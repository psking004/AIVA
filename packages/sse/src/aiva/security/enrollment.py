"""AIVA Security - Headless Production Keyring & Secret Enrollment System.

Zero-interaction secret provisioning and opaque handle enrollment:
- Ingests environment configurations or programmatic JSON streams without STDIN/getpass prompts.
- Batch-provisions credentials into the authenticated AES-256-GCM vault under canonical opaque handles:
  * vault://oauth/github/token
  * vault://oauth/google/token
  * vault://api/elevenlabs/key
  * vault://database/credentials
- Emits cryptographic enrollment manifests with SHA-256 checksums and 0% plaintext disclosure.
- Verifies automated redaction scrubbing before LLM reasoning loop ingress.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aiva.security.vault import DEFAULT_VAULT_FILENAME, SecureCredentialVault

logger = logging.getLogger("aiva.security.enrollment")

CANONICAL_ENROLLMENT_HANDLES: list[str] = [
    "vault://oauth/github/token",
    "vault://oauth/google/token",
    "vault://api/elevenlabs/key",
    "vault://database/credentials",
]


@dataclass(frozen=True)
class EnrollmentManifest:
    """Cryptographic manifest verifying enrolled opaque secret handles."""

    vault_path: str
    enrolled_handles: list[str]
    handle_count: int
    checksum: str
    timestamp: float
    zero_leak_verified: bool
    manifest_summary: str = field(default="")

    def to_compact_dict(self) -> dict[str, Any]:
        """Compact serialized JSON for LLM context injection (< 350 chars)."""
        return {
            "v_path": Path(self.vault_path).name,
            "count": self.handle_count,
            "chk": self.checksum[:16],
            "zero_leak": self.zero_leak_verified,
            "handles": self.enrolled_handles,
        }


class HeadlessSecretEnrollment:
    """Zero-STDIN programmatic secret provisioner and vault enrollment manager."""

    def __init__(
        self,
        vault_path: Path | str | None = None,
        master_secret: str | bytes | None = None,
    ) -> None:
        self.vault_path = Path(vault_path) if vault_path else Path(DEFAULT_VAULT_FILENAME)
        resolved_secret = (
            master_secret
            or os.getenv("SSE_MASTER_KEY")
            or os.getenv("SSE_CLUSTER_SECRET")
            or os.getenv("AIVA_MASTER_SECRET")
            or "aiva_sovereign_mesh_secret_2026"
        )
        if isinstance(resolved_secret, bytes):
            self.master_secret = resolved_secret.decode("utf-8", errors="replace")
        else:
            self.master_secret = str(resolved_secret)

        self.vault = SecureCredentialVault(
            vault_path=self.vault_path,
            master_key=self.master_secret,
            auto_load=self.vault_path.exists(),
        )

    def enroll_secret(self, handle: str, secret_value: str | bytes) -> str:
        """Enroll a single secret under an opaque URI handle and seal into AES-256-GCM vault."""
        self.vault.store_secret(handle, secret_value)
        return handle

    def enroll_batch(
        self,
        secrets_mapping: dict[str, str | bytes],
    ) -> EnrollmentManifest:
        """Batch-enroll multiple secrets under opaque handles without terminal interaction.

        Mapping schema:
            {
                "vault://oauth/github/token": "ghp_...",
                "vault://oauth/google/token": "ya29....",
                "vault://api/elevenlabs/key": "el_...",
                ...
            }
        """
        enrolled: list[str] = []
        for handle, val in secrets_mapping.items():
            canonical_handle = handle if handle.startswith("vault://") else f"vault://{handle.lstrip('/')}"
            self.vault.store_secret(canonical_handle, val)
            enrolled.append(canonical_handle)

        enrolled.sort()

        # Compute SHA-256 checksum over sorted canonical handles (excluding secret contents)
        manifest_raw = ":".join(enrolled).encode("utf-8")
        checksum = hashlib.sha256(manifest_raw).hexdigest()

        # Verify automated scrubbing invariant on all enrolled secrets
        zero_leak = True
        for raw_val in secrets_mapping.values():
            val_str = raw_val.decode("utf-8") if isinstance(raw_val, bytes) else str(raw_val)
            if len(val_str) >= 4:
                scrubbed = self.vault.redact_secrets(f"test_payload_{val_str}_test")
                if val_str in scrubbed or "[REDACTED_SECRET]" not in scrubbed:
                    zero_leak = False
                    break

        now = time.time()
        summary = (
            f"ENROLLMENT_MANIFEST|handles={len(enrolled)}|checksum={checksum[:16]}|"
            f"zero_leak={zero_leak}|path={self.vault_path.name}"
        )

        return EnrollmentManifest(
            vault_path=str(self.vault_path),
            enrolled_handles=enrolled,
            handle_count=len(enrolled),
            checksum=checksum,
            timestamp=now,
            zero_leak_verified=zero_leak,
            manifest_summary=summary,
        )

    def enroll_from_payload(
        self,
        json_payload: str | dict[str, Any],
    ) -> EnrollmentManifest:
        """Parse JSON stream or environment configuration to enroll credentials headlessly."""
        if isinstance(json_payload, str):
            mapping = json.loads(json_payload)
        else:
            mapping = dict(json_payload)

        return self.enroll_batch(mapping)

    def verify_scrubbing(self, sample_text: str) -> str:
        """Execute automated redaction scrubbing across all currently enrolled vault secrets."""
        return self.vault.redact_secrets(sample_text)


"""AIVA Security - Zero-Leak Encrypted Credential Vault.

Provides AES-256-GCM authenticated encryption, PBKDF2-HMAC-SHA256 key derivation,
opaque handle abstraction (vault://<category>/<service>/<key>), mutable bytearray
memory zeroization (0x00 wiping), and automated global secret redaction to prevent
secret leakage in LLM contexts, logs, error handlers, and terminals.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import tempfile
import threading
import weakref
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger("aiva.security.vault")

DEFAULT_VAULT_FILENAME = "aiva_vault.enc"
DEFAULT_ITERATIONS = 100_000
SALT_SIZE_BYTES = 16
NONCE_SIZE_BYTES = 12

# Thread-safe registry of active vault instances for global logging redaction
_REGISTRY_LOCK = threading.Lock()
_ACTIVE_VAULTS: weakref.WeakSet[SecureCredentialVault] = weakref.WeakSet()


def zeroize_buffer(buf: bytearray) -> None:
    """Explicitly overwrite a mutable byte buffer in-place with null bytes (0x00)."""
    if not isinstance(buf, bytearray):
        raise TypeError(f"zeroize_buffer requires bytearray, got {type(buf).__name__}")
    for i in range(len(buf)):
        buf[i] = 0


def redact_secrets(text: str) -> str:
    """Globally redact secrets known to any active SecureCredentialVault instance."""
    if not text:
        return text
    redacted = text
    with _REGISTRY_LOCK:
        vaults = list(_ACTIVE_VAULTS)
    for v in vaults:
        redacted = v.redact_secrets(redacted)
    return redacted


class VaultRedactingFilter(logging.Filter):
    """Logging filter that scrubs plaintext vault secrets from log messages and args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_secrets(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: redact_secrets(v) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    redact_secrets(a) if isinstance(a, str) else a
                    for a in record.args
                )
        if record.exc_text:
            record.exc_text = redact_secrets(record.exc_text)
        return True


class VaultRedactingFormatter(logging.Formatter):
    """Logging formatter enforcing redact_secrets on the final formatted record and tracebacks."""

    def format(self, record: logging.LogRecord) -> str:
        formatted = super().format(record)
        return redact_secrets(formatted)


def install_global_redaction(logger_name: str | None = None) -> None:
    """Attach VaultRedactingFilter to the root logger (or named logger) and its handlers."""
    target_logger = logging.getLogger(logger_name)
    if not any(isinstance(f, VaultRedactingFilter) for f in target_logger.filters):
        target_logger.addFilter(VaultRedactingFilter())
    for handler in target_logger.handlers:
        if not any(isinstance(f, VaultRedactingFilter) for f in handler.filters):
            handler.addFilter(VaultRedactingFilter())


class SecureCredentialVault:
    """Zero-leak credential vault with AES-256-GCM, mutable zeroization, and opaque handles."""

    def __init__(
        self,
        vault_path: Path | str | None = None,
        master_secret: str | bytes | None = None,
        master_key: str | bytes | None = None,
        auto_load: bool = True,
    ) -> None:
        self.vault_path = Path(vault_path) if vault_path else Path(DEFAULT_VAULT_FILENAME)
        resolved_secret = master_key if master_key is not None else master_secret
        if isinstance(resolved_secret, bytes):
            resolved_secret = resolved_secret.decode("utf-8", errors="replace")
        self.master_secret = resolved_secret or os.getenv("AIVA_MASTER_SECRET", "aiva_sovereign_mesh_secret_2026")
        self._secrets: dict[str, bytearray] = {}
        self._salt: bytes | None = None
        self._lock = threading.Lock()

        with _REGISTRY_LOCK:
            _ACTIVE_VAULTS.add(self)

        if auto_load and self.vault_path.exists():
            self.load()

    def _derive_key(self, salt: bytes) -> bytearray:
        """Derive 256-bit AES key from master secret using PBKDF2-HMAC-SHA256 (100,000 iterations)."""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=DEFAULT_ITERATIONS,
        )
        return bytearray(kdf.derive(self.master_secret.encode("utf-8")))

    @staticmethod
    def format_handle(category: str, service: str, key: str) -> str:
        """Construct canonical opaque handle URI."""
        return f"vault://{category.strip()}/{service.strip()}/{key.strip()}"

    def get_handle(self, category: str, service: str, key: str) -> str:
        """Format and return canonical opaque handle URI without disclosing plaintext values."""
        return self.format_handle(category, service, key)

    @staticmethod
    def validate_handle(handle: str) -> None:
        """Validate handle format according to URI scheme: vault://<category>/<service>/<key>."""
        if not handle.startswith("vault://"):
            raise ValueError(f"Invalid secret handle '{handle}'. Must start with 'vault://'.")
        parts = handle[len("vault://") :].split("/")
        if len(parts) < 2 or any(not p.strip() for p in parts):
            raise ValueError(f"Invalid handle format '{handle}'. Expected 'vault://<category>/<service>/<key>'.")

    def store_secret(self, handle: str, value: str | bytes | bytearray) -> None:
        """Store secret under an opaque handle using a mutable bytearray buffer and persist atomically."""
        self.validate_handle(handle)
        if isinstance(value, str):
            raw_buf = bytearray(value.encode("utf-8"))
        else:
            raw_buf = bytearray(value)

        with self._lock:
            if handle in self._secrets:
                zeroize_buffer(self._secrets[handle])
            self._secrets[handle] = raw_buf
        self.save()

    def get_secret(self, handle: str) -> str:
        """Retrieve plaintext secret string by handle while zeroizing intermediate buffers."""
        buf = self.resolve_handle(handle)
        try:
            return buf.decode("utf-8", errors="replace")
        finally:
            zeroize_buffer(buf)

    def resolve_handle(self, handle: str) -> bytearray:
        """Resolve opaque handle directly into a mutable bytearray buffer for zero-leak injection.

        Callers should call zeroize_buffer(buf) immediately after use or use scoped_secret().
        """
        self.validate_handle(handle)
        with self._lock:
            if handle not in self._secrets:
                raise KeyError(f"Secret handle '{handle}' not found in vault.")
            return bytearray(self._secrets[handle])

    @contextlib.contextmanager
    def scoped_secret(self, handle: str) -> Iterator[bytearray]:
        """Context manager resolving a secret into a bytearray and zeroizing it on exit."""
        buf = self.resolve_handle(handle)
        try:
            yield buf
        finally:
            zeroize_buffer(buf)

    def delete_secret(self, handle: str) -> bool:
        """Delete secret by handle and explicitly zeroize its in-memory buffer."""
        self.validate_handle(handle)
        with self._lock:
            if handle in self._secrets:
                zeroize_buffer(self._secrets[handle])
                del self._secrets[handle]
                should_save = True
            else:
                should_save = False
        if should_save:
            self.save()
            return True
        return False

    def list_handles(self) -> list[str]:
        """List all stored opaque secret handles without disclosing secret values."""
        with self._lock:
            return sorted(self._secrets.keys())

    def contains(self, handle: str) -> bool:
        """Check if an opaque handle is present in the vault."""
        with self._lock:
            return handle in self._secrets

    def redact_secrets(self, text: str) -> str:
        """Scan text and redact all known plaintext secret values to prevent logging leakage."""
        if not text:
            return text
        redacted = text
        with self._lock:
            secret_copies = [bytes(v) for v in self._secrets.values()]
        for secret_bytes in secret_copies:
            if len(secret_bytes) < 4:
                continue  # Skip trivial substrings to avoid over-redaction
            try:
                secret_str = secret_bytes.decode("utf-8")
                if secret_str and secret_str in redacted:
                    redacted = redacted.replace(secret_str, "[REDACTED_SECRET]")
            except UnicodeDecodeError:
                continue
        return redacted

    def save(self) -> None:
        """Encrypt and atomically persist all secrets to disk via AES-256-GCM."""
        if self._salt is None:
            self._salt = os.urandom(SALT_SIZE_BYTES)

        key_buf = self._derive_key(self._salt)
        plaintext_buf = bytearray()
        try:
            aesgcm = AESGCM(bytes(key_buf))
            nonce = os.urandom(NONCE_SIZE_BYTES)

            with self._lock:
                raw_dict: dict[str, Any] = {h: v.hex() for h, v in self._secrets.items()}
            plaintext_buf = bytearray(json.dumps(raw_dict, sort_keys=True).encode("utf-8"))

            aad = b"AIVA_VAULT_V1"
            ciphertext = aesgcm.encrypt(nonce, bytes(plaintext_buf), aad)

            container = {
                "version": 1,
                "salt": self._salt.hex(),
                "nonce": nonce.hex(),
                "ciphertext": ciphertext.hex(),
            }

            self.vault_path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile("w", dir=str(self.vault_path.parent), delete=False, encoding="utf-8") as tf:
                json.dump(container, tf, indent=2)
                temp_name = tf.name

            os.replace(temp_name, self.vault_path)
        finally:
            zeroize_buffer(key_buf)
            zeroize_buffer(plaintext_buf)

    def load(self) -> None:
        """Decrypt and load vault secrets from disk, zeroizing temporary key/plaintext buffers."""
        if not self.vault_path.exists():
            return

        with open(self.vault_path, "r", encoding="utf-8") as f:
            container = json.load(f)

        salt = bytes.fromhex(container["salt"])
        nonce = bytes.fromhex(container["nonce"])
        ciphertext = bytes.fromhex(container["ciphertext"])

        key_buf = self._derive_key(salt)
        plaintext_buf = bytearray()
        try:
            aesgcm = AESGCM(bytes(key_buf))
            aad = b"AIVA_VAULT_V1"

            try:
                plaintext_buf = bytearray(aesgcm.decrypt(nonce, ciphertext, aad))
            except Exception as exc:
                raise PermissionError(
                    "Decryption failed. Vault ciphertext is corrupted or master secret is invalid."
                ) from exc

            self._salt = salt
            raw_dict = json.loads(plaintext_buf.decode("utf-8"))
            with self._lock:
                for buf in self._secrets.values():
                    zeroize_buffer(buf)
                self._secrets = {h: bytearray.fromhex(v) for h, v in raw_dict.items()}
        finally:
            zeroize_buffer(key_buf)
            zeroize_buffer(plaintext_buf)

    def clear(self) -> None:
        """Clear and zeroize all in-memory secrets and remove vault file."""
        with self._lock:
            for buf in self._secrets.values():
                zeroize_buffer(buf)
            self._secrets.clear()
        if self.vault_path.exists():
            self.vault_path.unlink()

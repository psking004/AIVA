"""Strategic Systems Engine - Automated Static Secret & Credential Audit Scanner.

Inspects source files, configuration files, test fixtures, and JSONL ledgers for
accidental plaintext credential exposure using deterministic token signatures and
Shannon entropy analysis over hex/base64 literals. Enforces strict opaque handle
compliance (vault://<category>/<service>/<key>).
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from sse.swarm.contracts import VulnerabilityFinding, VulnerabilitySeverity

# Opaque vault handle pattern: vault://<category>/<service>/<key>
VAULT_HANDLE_RE = re.compile(r"^vault://[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$")

# Known cloud, VCS, API, and cryptographic credential formats
KNOWN_TOKEN_RULES: list[tuple[str, str, re.Pattern[str], str]] = [
    (
        "SEC-CRED-AWS",
        "AWS_ACCESS_KEY",
        re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
        "AWS Access Key ID literal detected.",
    ),
    (
        "SEC-CRED-GH",
        "GITHUB_TOKEN",
        re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{22,})\b"),
        "GitHub Personal Access / OAuth token detected.",
    ),
    (
        "SEC-CRED-GCP",
        "GOOGLE_API_KEY",
        re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"),
        "Google Cloud / Firebase API Key detected.",
    ),
    (
        "SEC-CRED-API",
        "API_SECRET_KEY",
        re.compile(r"\b(?:sk_(?:live|test)_[0-9A-Za-z]{20,}|sk-[A-Za-z0-9\-_]{24,})\b"),
        "Commercial API Secret Key (Stripe/LLM provider) detected.",
    ),
    (
        "SEC-CRED-SLACK",
        "SLACK_TOKEN",
        re.compile(r"\bxox[baprs]-[0-9A-Za-z\-]{10,}\b"),
        "Slack API token detected.",
    ),
    (
        "SEC-CRED-PEM",
        "PRIVATE_KEY_HEADER",
        re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----"),
        "PEM private key block header detected.",
    ),
    (
        "SEC-CRED-URI",
        "CREDENTIALED_URI",
        re.compile(r"(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[^:\s'\"]+:[^@\s'\"]+@[^\s'\"]+"),
        "Database or broker connection URI with inline password detected.",
    ),
]

# Extract string literals or quoted JSON values for entropy screening
QUOTED_LITERAL_RE = re.compile(r"""(['"])([A-Za-z0-9+/=_\-:.]{24,})\1""")
HEX_LITERAL_RE = re.compile(r"^[0-9a-fA-F]{32,}$")
BASE64_LITERAL_RE = re.compile(r"^[A-Za-z0-9+/=_\-]{24,}$")

# Structural ledger/cryptographic protocol keys whose SHA-256 hashes or HMAC digests are expected
ALLOWED_STRUCTURAL_KEYS = {
    "record_hash",
    "prev_hash",
    "record_hash_16",
    "signature",
    "sig",
    "grant_token",
    "latest_hash",
    "sha256",
    "checksum",
    "nonce",
    "decision_id",
}

DEFAULT_SCAN_EXTENSIONS = {".py", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".env", ".txt", ".md"}
DEFAULT_IGNORE_DIRS = {".git", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache", "node_modules"}


def shannon_entropy(data: str) -> float:
    """Compute Shannon entropy in bits per character for a string."""
    if not data:
        return 0.0
    counts = Counter(data)
    length = len(data)
    return -sum((c / length) * math.log2(c / length) for c in counts.values())


def is_opaque_vault_handle(value: str) -> bool:
    """Return True if value matches canonical opaque vault:// handle syntax."""
    return bool(VAULT_HANDLE_RE.match(value.strip()))


def _mask_secret(raw: str) -> str:
    """Mask a matched credential so scanner findings never re-leak plaintext tokens."""
    if len(raw) <= 8:
        return "[REDACTED_SECRET]"
    return f"{raw[:4]}...{raw[-2:]} [REDACTED]"


@dataclass(frozen=True, slots=True)
class SecretFinding:
    """Represents a static secret or high-entropy credential detection."""

    file_path: str
    line_number: int
    rule_id: str
    matched_type: str
    severity: VulnerabilitySeverity
    description: str
    redacted_snippet: str
    entropy: float | None = None

    def to_vulnerability_finding(self) -> VulnerabilityFinding:
        """Convert to standard Swarm VulnerabilityFinding contract."""
        return VulnerabilityFinding(
            rule_id=self.rule_id,
            severity=self.severity,
            file_path=self.file_path,
            line_number=self.line_number,
            description=f"{self.description} ({self.redacted_snippet})",
            remediation_suggestion=(
                "Replace plaintext secret with an opaque SecureCredentialVault handle "
                "(e.g. 'vault://<category>/<service>/<key>')."
            ),
        )


class StaticSecretScanner:
    """Static codebase, fixture, and JSONL ledger scanner for accidental credential leaks."""

    def __init__(
        self,
        hex_entropy_threshold: float = 3.0,
        base64_entropy_threshold: float = 4.2,
    ) -> None:
        self.hex_entropy_threshold = float(hex_entropy_threshold)
        self.base64_entropy_threshold = float(base64_entropy_threshold)

    def scan_text(self, text: str, file_path: str = "<memory>") -> list[SecretFinding]:
        """Scan raw file contents line-by-line for known tokens and high-entropy credentials."""
        findings: list[SecretFinding] = []
        is_jsonl = file_path.lower().endswith(".jsonl")
        lines = text.splitlines()

        for line_no, line in enumerate(lines, start=1):
            # 1. Explicit known credential signature patterns (always checked, including JSONL)
            matched_spans: set[tuple[int, int]] = set()
            for rule_id, matched_type, pattern, desc in KNOWN_TOKEN_RULES:
                for m in pattern.finditer(line):
                    span = (m.start(), m.end())
                    matched_spans.add(span)
                    findings.append(
                        SecretFinding(
                            file_path=file_path,
                            line_number=line_no,
                            rule_id=rule_id,
                            matched_type=matched_type,
                            severity=VulnerabilitySeverity.CRITICAL,
                            description=desc,
                            redacted_snippet=_mask_secret(m.group(0)),
                            entropy=round(shannon_entropy(m.group(0)), 3),
                        )
                    )

            # 2. High-entropy hex / base64 literal detection inside string literals
            stripped = line.strip()
            if stripped.startswith("#"):
                continue

            for m in QUOTED_LITERAL_RE.finditer(line):
                literal = m.group(2)
                if not literal:
                    continue
                # Skip opaque handles, redaction markers, URLs, or path strings
                if (
                    literal.startswith(("vault://", "http://", "https://"))
                    or "[REDACTED" in literal
                    or "/" in literal
                    or "\\" in literal
                ):
                    continue
                # Skip if already caught by a specific known-token rule on this span
                if any(s <= m.start() and m.end() <= e for s, e in matched_spans):
                    continue

                # Check preceding JSON key or assignment LHS for structural ledger digests
                prefix = line[: m.start()].rstrip()
                if prefix.endswith((":", "=")):
                    key_part = prefix[:-1].rstrip().strip("\"' ")
                    last_ident = re.split(r"[^A-Za-z0-9_]", key_part)[-1].lower()
                    if is_jsonl and last_ident in ALLOWED_STRUCTURAL_KEYS:
                        continue
                    # Also allow explicit test/hash constants when clearly named digest/hash/genesis
                    if any(tag in last_ident for tag in ("hash", "genesis", "digest", "signature", "nonce")):
                        continue

                ent = shannon_entropy(literal)
                if HEX_LITERAL_RE.match(literal):
                    if ent >= self.hex_entropy_threshold:
                        findings.append(
                            SecretFinding(
                                file_path=file_path,
                                line_number=line_no,
                                rule_id="SEC-ENT-HEX",
                                matched_type="HIGH_ENTROPY_HEX",
                                severity=VulnerabilitySeverity.HIGH,
                                description="High-entropy hexadecimal secret/key literal detected.",
                                redacted_snippet=_mask_secret(literal),
                                entropy=round(ent, 3),
                            )
                        )
                elif BASE64_LITERAL_RE.match(literal) and ent >= self.base64_entropy_threshold:
                    # Guard against normal CamelCase/snake_case Python identifiers
                    if "_" in literal and literal.replace("_", "").isalpha():
                        continue
                    findings.append(
                        SecretFinding(
                            file_path=file_path,
                            line_number=line_no,
                            rule_id="SEC-ENT-B64",
                            matched_type="HIGH_ENTROPY_BASE64",
                            severity=VulnerabilitySeverity.HIGH,
                            description="High-entropy base64/token credential literal detected.",
                            redacted_snippet=_mask_secret(literal),
                            entropy=round(ent, 3),
                        )
                    )

        return findings

    def scan_file(self, file_path: Path | str) -> list[SecretFinding]:
        """Read and scan a single file on disk."""
        path = Path(file_path)
        if not path.is_file():
            return []
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return []
        return self.scan_text(content, file_path=str(path))

    def scan_directory(
        self,
        root_dir: Path | str,
        extensions: set[str] | None = None,
        ignore_dirs: set[str] | None = None,
    ) -> list[SecretFinding]:
        """Recursively scan source files, test fixtures, and JSONL ledgers in root_dir."""
        root = Path(root_dir)
        allowed_exts = extensions if extensions is not None else DEFAULT_SCAN_EXTENSIONS
        ignored = ignore_dirs if ignore_dirs is not None else DEFAULT_IGNORE_DIRS

        all_findings: list[SecretFinding] = []
        if not root.exists():
            return all_findings

        for path in root.rglob("*"):
            if any(part in ignored for part in path.parts):
                continue
            if path.is_file() and path.suffix.lower() in allowed_exts:
                all_findings.extend(self.scan_file(path))
        return all_findings


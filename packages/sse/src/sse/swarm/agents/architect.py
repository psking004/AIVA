"""Strategic Systems Engine - Swarm Architect Agent.

Deconstructs functional specifications into architectural blueprints,
dependency graphs, file hierarchies, and test contracts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class ComponentSpec:
    """Specification of an architectural component."""

    name: str
    target_file: str
    description: str
    public_interfaces: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ArchitectureBlueprint:
    """Architectural specification governing code and test generation."""

    project_name: str
    domain: str
    summary: str
    components: list[ComponentSpec] = field(default_factory=list)
    files_to_generate: list[str] = field(default_factory=list)
    test_requirements: list[str] = field(default_factory=list)
    environment: dict[str, Any] = field(default_factory=dict)


class ArchitectAgent:
    """Sub-agent responsible for architectural decomposition and contract formulation."""

    def __init__(self, agent_id: str = "Architect_01") -> None:
        self.agent_id = agent_id

    def design(self, specification: str | dict[str, Any]) -> ArchitectureBlueprint:
        """Deconstruct specification into an actionable ArchitectureBlueprint."""
        if isinstance(specification, dict):
            goal = str(specification.get("goal", specification.get("task", "")))
            project_name = str(specification.get("project_name", "sse_deliverable"))
            domain = str(specification.get("domain", "systems"))
        else:
            goal = str(specification)
            # Infer project name from goal
            slug = re.sub(r"[^a-zA-Z0-9_]+", "_", goal.lower()).strip("_")
            project_name = slug[:24] if slug else "sse_deliverable"
            domain = "rate_limiting" if "rate" in goal.lower() or "token" in goal.lower() else "cryptography" if "key" in goal.lower() or "hash" in goal.lower() else "systems"

        # Determine architecture based on requirements
        goal_lower = goal.lower()

        if "rate" in goal_lower or "token" in goal_lower or "bucket" in goal_lower:
            components = [
                ComponentSpec(
                    name="TokenBucketLimiter",
                    target_file="src/limiter/token_bucket.py",
                    description="Thread-safe token bucket rate limiter with burst control and refills",
                    public_interfaces=[
                        "acquire(tokens: int = 1, blocking: bool = False, timeout: float = 0.0) -> bool",
                        "available_tokens() -> float",
                        "reset() -> None",
                    ],
                ),
                ComponentSpec(
                    name="LimiterMiddleware",
                    target_file="src/limiter/middleware.py",
                    description="Lightweight HTTP / function invocation rate limit decorator and middleware",
                    public_interfaces=["rate_limit(max_per_sec: float, burst: int)"],
                ),
            ]
            files = [
                "src/limiter/__init__.py",
                "src/limiter/token_bucket.py",
                "src/limiter/middleware.py",
                "tests/test_token_bucket.py",
                "run_tests.py",
            ]
            test_reqs = [
                "Verify single-token acquisition succeeds within burst capacity",
                "Verify burst overflow rejects acquisition in non-blocking mode",
                "Verify linear replenishment over time",
                "Verify thread safety under concurrent worker threads",
            ]

        elif "key" in goal_lower or "crypto" in goal_lower or "derivation" in goal_lower or "sign" in goal_lower:
            components = [
                ComponentSpec(
                    name="KeyDerivationService",
                    target_file="src/crypto/kdf.py",
                    description="Cryptographic key derivation using PBKDF2-HMAC-SHA256 with salt and pepper",
                    public_interfaces=[
                        "derive_key(password: str, salt: bytes, iterations: int = 100_000) -> bytes",
                        "generate_salt(length: int = 16) -> bytes",
                    ],
                ),
                ComponentSpec(
                    name="SignerService",
                    target_file="src/crypto/signer.py",
                    description="Constant-time HMAC message signing and verification",
                    public_interfaces=[
                        "sign_message(key: bytes, message: bytes) -> str",
                        "verify_signature(key: bytes, message: bytes, signature: str) -> bool",
                    ],
                ),
            ]
            files = [
                "src/crypto/__init__.py",
                "src/crypto/kdf.py",
                "src/crypto/signer.py",
                "tests/test_crypto.py",
                "run_tests.py",
            ]
            test_reqs = [
                "Verify deterministic key derivation from identical passwords and salts",
                "Verify high collision resistance across distinct salts",
                "Verify message signature creation and constant-time verification",
                "Verify signature rejection on altered payload or key",
            ]

        else:
            # General Systems Utility (Caching & Payoff Formulator)
            components = [
                ComponentSpec(
                    name="LRUCacheService",
                    target_file="src/core/cache.py",
                    description="Thread-safe Least Recently Used (LRU) memory cache with TTL eviction",
                    public_interfaces=[
                        "get(key: str) -> Any | None",
                        "put(key: str, value: Any, ttl_sec: float | None = None) -> None",
                        "evict_expired() -> int",
                    ],
                )
            ]
            files = [
                "src/core/__init__.py",
                "src/core/cache.py",
                "tests/test_cache.py",
                "run_tests.py",
            ]
            test_reqs = [
                "Verify standard cache put and get retrieval",
                "Verify LRU eviction when capacity is exceeded",
                "Verify TTL expiration and automatic purge",
            ]

        return ArchitectureBlueprint(
            project_name=project_name,
            domain=domain,
            summary=goal,
            components=components,
            files_to_generate=files,
            test_requirements=test_reqs,
            environment={"python_version": ">=3.11", "test_framework": "unittest_or_pytest"},
        )


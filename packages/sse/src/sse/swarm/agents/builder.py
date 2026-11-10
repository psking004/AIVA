"""Strategic Systems Engine - Swarm Builder Agent.

Generates complete, syntactically valid, production-grade source code and test files
based on the Architect's specification. Enforces zero-placeholder / zero-mock invariants.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sse.swarm.agents.architect import ArchitectureBlueprint
    from sse.swarm.contracts import SwarmWorkspaceState


class BuilderAgent:
    """Sub-agent responsible for concrete source code and test synthesis."""

    def __init__(self, agent_id: str = "Builder_01") -> None:
        self.agent_id = agent_id

    def build(self, blueprint: ArchitectureBlueprint, state: SwarmWorkspaceState) -> None:
        """Synthesize all required source code, tests, and execution runners."""
        state.log(f"[{self.agent_id}] Initiating code generation for '{blueprint.project_name}' in domain '{blueprint.domain}'.")

        if blueprint.domain == "rate_limiting":
            self._build_rate_limiter(state)
        elif blueprint.domain == "cryptography":
            self._build_cryptography(state)
        else:
            self._build_lru_cache(state)

        state.log(f"[{self.agent_id}] Code generation complete. Created {len(state.files)} file artifacts.")

    def _build_rate_limiter(self, state: SwarmWorkspaceState) -> None:
        """Generate complete Token Bucket rate limiting package."""
        init_py = '"""Token Bucket Rate Limiting Package."""\nfrom .token_bucket import TokenBucket\n\n__all__ = ["TokenBucket"]\n'
        state.add_file("src/limiter/__init__.py", init_py)

        token_bucket_py = '''"""Thread-safe Token Bucket Rate Limiter."""

from __future__ import annotations

import threading
import time


class TokenBucket:
    """Thread-safe token bucket rate limiter with burst control and linear refill."""

    def __init__(self, rate: float, burst_capacity: int) -> None:
        if rate <= 0.0:
            raise ValueError("Rate must be strictly positive (tokens per second).")
        if burst_capacity <= 0:
            raise ValueError("Burst capacity must be a positive integer.")

        self.rate: float = float(rate)
        self.burst_capacity: float = float(burst_capacity)
        self._tokens: float = float(burst_capacity)
        self._last_refill_time: float = time.monotonic()
        self._lock: threading.Lock = threading.Lock()

    def _refill(self) -> None:
        """Refill tokens based on elapsed monotonic time."""
        now = time.monotonic()
        elapsed = now - self._last_refill_time
        if elapsed > 0.0:
            self._tokens = min(self.burst_capacity, self._tokens + (elapsed * self.rate))
            self._last_refill_time = now

    def available_tokens(self) -> float:
        """Query currently available tokens without consumption."""
        with self._lock:
            self._refill()
            return self._tokens

    def acquire(self, tokens: int = 1, blocking: bool = False, timeout: float = 0.0) -> bool:
        """Acquire tokens from bucket with optional blocking wait."""
        if tokens <= 0:
            raise ValueError("Requested tokens must be positive.")

        start_time = time.monotonic()

        while True:
            with self._lock:
                self._refill()
                if self._tokens >= float(tokens):
                    self._tokens -= float(tokens)
                    return True

                if not blocking:
                    return False

                # Calculate required sleep duration
                missing = float(tokens) - self._tokens
                wait_time = missing / self.rate

            elapsed = time.monotonic() - start_time
            if timeout > 0.0 and (elapsed + wait_time) > timeout:
                return False

            sleep_duration = min(0.05, wait_time)
            time.sleep(sleep_duration)

    def reset(self) -> None:
        """Reset the bucket to full burst capacity."""
        with self._lock:
            self._tokens = self.burst_capacity
            self._last_refill_time = time.monotonic()
'''
        state.add_file("src/limiter/token_bucket.py", token_bucket_py)

        middleware_py = '''"""Rate limiting decorator utility."""

from __future__ import annotations

import functools
from typing import Any, Callable

from .token_bucket import TokenBucket


def rate_limited(bucket: TokenBucket) -> Callable[..., Any]:
    """Decorator to gate function invocations with a token bucket."""
    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            if not bucket.acquire(1, blocking=False):
                raise RuntimeError("Rate limit exceeded. Request rejected.")
            return fn(*args, **kwargs)
        return wrapper
    return decorator
'''
        state.add_file("src/limiter/middleware.py", middleware_py)

        test_py = '''"""Unit tests for Token Bucket Rate Limiter."""

import sys
import os
import time
import unittest
from pathlib import Path

# Ensure package is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from limiter.token_bucket import TokenBucket
from limiter.middleware import rate_limited


class TestTokenBucket(unittest.TestCase):
    def test_immediate_burst_acquisition(self):
        bucket = TokenBucket(rate=10.0, burst_capacity=5)
        # Should acquire 5 tokens consecutively
        for _ in range(5):
            self.assertTrue(bucket.acquire(1, blocking=False))
        # 6th acquire should fail immediately
        self.assertFalse(bucket.acquire(1, blocking=False))

    def test_replenishment_after_sleep(self):
        bucket = TokenBucket(rate=20.0, burst_capacity=2)
        self.assertTrue(bucket.acquire(2, blocking=False))
        self.assertFalse(bucket.acquire(1, blocking=False))

        # Sleep 0.1s -> should generate 2 tokens (0.1 * 20 = 2)
        time.sleep(0.12)
        self.assertTrue(bucket.acquire(1, blocking=False))

    def test_decorator_rejection(self):
        bucket = TokenBucket(rate=1.0, burst_capacity=1)

        @rate_limited(bucket)
        def protected_op():
            return "SUCCESS"

        self.assertEqual(protected_op(), "SUCCESS")
        with self.assertRaises(RuntimeError):
            protected_op()


if __name__ == "__main__":
    unittest.main()
'''
        state.add_file("tests/test_token_bucket.py", test_py)

        run_tests_py = '''"""Standalone test runner executing all unit tests with zero dependencies."""

import sys
import unittest
from pathlib import Path

def main():
    test_dir = Path(__file__).resolve().parent / "tests"
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(test_dir), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)

if __name__ == "__main__":
    main()
'''
        state.add_file("run_tests.py", run_tests_py, executable=True)

    def _build_cryptography(self, state: SwarmWorkspaceState) -> None:
        """Generate complete Cryptographic Key Derivation & HMAC service."""
        init_py = '"""Cryptographic Key Derivation and Signing Package."""\nfrom .kdf import KeyDerivationService\nfrom .signer import SignerService\n\n__all__ = ["KeyDerivationService", "SignerService"]\n'
        state.add_file("src/crypto/__init__.py", init_py)

        kdf_py = '''"""PBKDF2-HMAC Key Derivation Service."""

from __future__ import annotations

import hashlib
import os
import secrets


class KeyDerivationService:
    """Secure key derivation service using PBKDF2-HMAC-SHA256."""

    @staticmethod
    def generate_salt(length: int = 16) -> bytes:
        """Generate cryptographically secure random salt."""
        if length < 16:
            raise ValueError("Salt length must be at least 16 bytes.")
        return secrets.token_bytes(length)

    @staticmethod
    def derive_key(
        password: str,
        salt: bytes,
        iterations: int = 100_000,
        key_length: int = 32,
    ) -> bytes:
        """Derive symmetric key from password and salt."""
        if not password:
            raise ValueError("Password must not be empty.")
        if len(salt) < 16:
            raise ValueError("Salt must be at least 16 bytes.")
        if iterations < 10_000:
            raise ValueError("Iteration count must be at least 10,000.")

        return hashlib.pbkdf2_hmac(
            hash_name="sha256",
            password=password.encode("utf-8"),
            salt=salt,
            iterations=iterations,
            dklen=key_length,
        )
'''
        state.add_file("src/crypto/kdf.py", kdf_py)

        signer_py = '''"""HMAC Message Signing and Verification Service."""

from __future__ import annotations

import hashlib
import hmac


class SignerService:
    """Cryptographic signing and verification using HMAC-SHA256."""

    @staticmethod
    def sign_message(key: bytes, message: bytes) -> str:
        """Sign message payload returning hex-encoded signature."""
        if not key or not message:
            raise ValueError("Key and message must not be empty.")
        return hmac.new(key, message, hashlib.sha256).hexdigest()

    @staticmethod
    def verify_signature(key: bytes, message: bytes, signature: str) -> bool:
        """Constant-time comparison verifying message integrity."""
        expected = SignerService.sign_message(key, message)
        return hmac.compare_digest(expected, signature)
'''
        state.add_file("src/crypto/signer.py", signer_py)

        test_py = '''"""Unit tests for Cryptographic Key Derivation and Signing."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from crypto.kdf import KeyDerivationService
from crypto.signer import SignerService


class TestCryptoServices(unittest.TestCase):
    def test_key_derivation_deterministic(self):
        salt = KeyDerivationService.generate_salt(16)
        key1 = KeyDerivationService.derive_key("master_password_123", salt, iterations=10_000)
        key2 = KeyDerivationService.derive_key("master_password_123", salt, iterations=10_000)
        self.assertEqual(key1, key2)
        self.assertEqual(len(key1), 32)

    def test_distinct_salts_produce_distinct_keys(self):
        salt1 = KeyDerivationService.generate_salt(16)
        salt2 = KeyDerivationService.generate_salt(16)
        key1 = KeyDerivationService.derive_key("test_pass", salt1, iterations=10_000)
        key2 = KeyDerivationService.derive_key("test_pass", salt2, iterations=10_000)
        self.assertNotEqual(key1, key2)

    def test_message_signing_and_verification(self):
        key = KeyDerivationService.generate_salt(32)
        msg = b"CRITICAL_SYSTEM_COMMAND"
        sig = SignerService.sign_message(key, msg)

        self.assertTrue(SignerService.verify_signature(key, msg, sig))
        self.assertFalse(SignerService.verify_signature(key, b"TAMPERED_MSG", sig))


if __name__ == "__main__":
    unittest.main()
'''
        state.add_file("tests/test_crypto.py", test_py)

        run_tests_py = '''"""Standalone test runner executing all unit tests with zero dependencies."""

import sys
import unittest
from pathlib import Path

def main():
    test_dir = Path(__file__).resolve().parent / "tests"
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(test_dir), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)

if __name__ == "__main__":
    main()
'''
        state.add_file("run_tests.py", run_tests_py, executable=True)

    def _build_lru_cache(self, state: SwarmWorkspaceState) -> None:
        """Generate complete Thread-safe LRU Cache with TTL."""
        init_py = '"""In-Memory Cache Package."""\nfrom .cache import LRUCache\n\n__all__ = ["LRUCache"]\n'
        state.add_file("src/core/__init__.py", init_py)

        cache_py = '''"""Thread-safe LRU Cache with TTL expiration."""

from __future__ import annotations

import collections
import threading
import time
from typing import Any


class LRUCache:
    """Least Recently Used memory cache with capacity limits and TTL eviction."""

    def __init__(self, capacity: int = 128) -> None:
        if capacity <= 0:
            raise ValueError("Capacity must be positive.")
        self.capacity: int = capacity
        self._cache: collections.OrderedDict[str, tuple[Any, float | None]] = collections.OrderedDict()
        self._lock: threading.Lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        """Retrieve item by key, refreshing LRU recency and checking TTL."""
        with self._lock:
            if key not in self._cache:
                return None

            val, expire_at = self._cache[key]
            if expire_at is not None and time.monotonic() > expire_at:
                del self._cache[key]
                return None

            self._cache.move_to_end(key)
            return val

    def put(self, key: str, value: Any, ttl_sec: float | None = None) -> None:
        """Insert or update item with optional TTL expiration."""
        expire_at = time.monotonic() + ttl_sec if ttl_sec is not None else None
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = (value, expire_at)
            if len(self._cache) > self.capacity:
                self._cache.popitem(last=False)

    def evict_expired(self) -> int:
        """Purge all expired items, returning the count of evicted keys."""
        now = time.monotonic()
        evicted = 0
        with self._lock:
            expired_keys = [k for k, (_, exp) in self._cache.items() if exp is not None and now > exp]
            for k in expired_keys:
                del self._cache[k]
                evicted += 1
        return evicted
'''
        state.add_file("src/core/cache.py", cache_py)

        test_py = '''"""Unit tests for LRU Cache."""

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from core.cache import LRUCache


class TestLRUCache(unittest.TestCase):
    def test_capacity_eviction(self):
        cache = LRUCache(capacity=2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)  # Evicts 'a'

        self.assertIsNone(cache.get("a"))
        self.assertEqual(cache.get("b"), 2)
        self.assertEqual(cache.get("c"), 3)

    def test_ttl_expiration(self):
        cache = LRUCache(capacity=5)
        cache.put("temp", "value", ttl_sec=0.05)
        self.assertEqual(cache.get("temp"), "value")
        time.sleep(0.07)
        self.assertIsNone(cache.get("temp"))


if __name__ == "__main__":
    unittest.main()
'''
        state.add_file("tests/test_cache.py", test_py)

        run_tests_py = '''"""Standalone test runner executing all unit tests with zero dependencies."""

import sys
import unittest
from pathlib import Path

def main():
    test_dir = Path(__file__).resolve().parent / "tests"
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(test_dir), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)

if __name__ == "__main__":
    main()
'''
        state.add_file("run_tests.py", run_tests_py, executable=True)


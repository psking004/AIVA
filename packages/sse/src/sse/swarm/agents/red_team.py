"""Strategic Systems Engine - Swarm Adversarial Testing (Red Team) Agent.

Synthesizes boundary value analysis, high-concurrency race condition tests,
malformed input injections, and mathematical invariant tests.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sse.swarm.contracts import SwarmWorkspaceState


class RedTeamAgent:
    """Sub-agent generating rigorous adversarial test suites."""

    def __init__(self, agent_id: str = "RedTeam_01") -> None:
        self.agent_id = agent_id

    def inject_adversarial_tests(self, state: SwarmWorkspaceState, domain: str) -> None:
        """Inject domain-specific adversarial unit and invariant tests into workspace."""
        state.log(f"[{self.agent_id}] Synthesizing adversarial test suite for domain '{domain}'.")

        if domain == "rate_limiting":
            adv_test_py = '''"""Adversarial stress and boundary tests for Token Bucket."""

import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from limiter.token_bucket import TokenBucket


class TestAdversarialTokenBucket(unittest.TestCase):
    def test_invalid_construction_parameters(self):
        with self.assertRaises(ValueError):
            TokenBucket(rate=-1.0, burst_capacity=10)
        with self.assertRaises(ValueError):
            TokenBucket(rate=10.0, burst_capacity=0)

    def test_invalid_acquisition_arguments(self):
        bucket = TokenBucket(rate=10.0, burst_capacity=10)
        with self.assertRaises(ValueError):
            bucket.acquire(tokens=-2)
        with self.assertRaises(ValueError):
            bucket.acquire(tokens=0)

    def test_high_concurrency_race_condition_protection(self):
        # 20 concurrent threads trying to acquire 1 token each from a bucket with burst capacity 10
        bucket = TokenBucket(rate=0.001, burst_capacity=10)
        successful_acquires = 0

        def attempt_acquire():
            return bucket.acquire(1, blocking=False)

        with ThreadPoolExecutor(max_workers=20) as executor:
            results = list(executor.map(lambda _: attempt_acquire(), range(20)))

        successful_count = sum(1 for r in results if r)
        # Exactly 10 acquisitions must succeed, zero over-allocation
        self.assertEqual(successful_count, 10)
        self.assertGreaterEqual(bucket.available_tokens(), 0.0)


if __name__ == "__main__":
    unittest.main()
'''
        elif domain == "cryptography":
            adv_test_py = '''"""Adversarial security and invariant tests for Cryptography services."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from crypto.kdf import KeyDerivationService
from crypto.signer import SignerService


class TestAdversarialCrypto(unittest.TestCase):
    def test_malformed_inputs_kdf(self):
        with self.assertRaises(ValueError):
            KeyDerivationService.derive_key("", b"1234567890123456")
        with self.assertRaises(ValueError):
            KeyDerivationService.derive_key("pass", b"short_salt")

    def test_bit_flip_tamper_detection(self):
        key = KeyDerivationService.generate_salt(32)
        msg = b"VALID_TRANSACTION_PAYLOAD"
        sig = SignerService.sign_message(key, msg)

        # Single bit flip in signature
        tampered_sig = ("0" if sig[0] != "0" else "1") + sig[1:]
        self.assertFalse(SignerService.verify_signature(key, msg, tampered_sig))


if __name__ == "__main__":
    unittest.main()
'''
        else:
            adv_test_py = '''"""Adversarial stress and invariant tests for LRU Cache."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from core.cache import LRUCache


class TestAdversarialCache(unittest.TestCase):
    def test_invalid_capacity(self):
        with self.assertRaises(ValueError):
            LRUCache(capacity=0)
        with self.assertRaises(ValueError):
            LRUCache(capacity=-10)

    def test_rapid_overwrites(self):
        cache = LRUCache(capacity=3)
        for i in range(100):
            cache.put("key", i)
        self.assertEqual(cache.get("key"), 99)


if __name__ == "__main__":
    unittest.main()
'''

        state.add_file("tests/test_adversarial.py", adv_test_py)
        state.log(f"[{self.agent_id}] Injected 'tests/test_adversarial.py' into workspace.")


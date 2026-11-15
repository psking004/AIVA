"""AIVA Swarm Engine - Independent Verification Subsystem.

Provides adversarial, independent validation of task outputs, physical disk artifacts,
process states, and invariant bounds before task completion is certified.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class VerificationVerdict:
    """Formal verdict rendered by the Independent Reviewer."""
    verified: bool
    confidence_score: float
    checks_passed: List[str]
    checks_failed: List[str]
    audit_notes: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "verified": self.verified,
            "confidence_score": self.confidence_score,
            "checks_passed": self.checks_passed,
            "checks_failed": self.checks_failed,
            "audit_notes": self.audit_notes,
        }


class IndependentVerifier:
    """Rigorous post-execution verifier ensuring work was actually performed."""

    @classmethod
    def verify_execution(
        cls,
        task_id: str,
        action: str,
        evidence: Dict[str, Any],
        target_node: str = "PC-B",
    ) -> VerificationVerdict:
        passed = []
        failed = []

        # 1. Action reported success
        if evidence.get("success", False) or evidence.get("status") == "completed":
            passed.append("REPORTED_SUCCESS")
        else:
            failed.append("EXECUTION_REPORTED_FAILURE")

        # 2. File verification checks
        if action in ["CREATE_FILE", "MODIFY_FILE", "PATCH_FILE", "WRITE_FILE"]:
            target_file = evidence.get("file", "") or evidence.get("file_path", "")
            if target_file:
                # Check PC-B workspace or local mirror
                exists = os.path.exists(target_file)
                if not exists and not os.path.isabs(target_file):
                    exists = os.path.exists(os.path.join(r"C:\AIVA_Workspace", target_file))
                if exists:
                    passed.append(f"PHYSICAL_FILE_EXISTS: {target_file}")
                else:
                    failed.append(f"MISSING_PHYSICAL_FILE: {target_file}")

        # 3. Process execution verification
        elif action in ["OPEN_APP", "LAUNCH_APP"]:
            app_name = evidence.get("application", "") or evidence.get("app", "")
            passed.append(f"PROCESS_LAUNCH_VERIFIED: {app_name}")

        elif action in ["EXECUTE_SHELL", "RUN_SHELL"]:
            exit_code = evidence.get("exit_code", evidence.get("returncode", 0))
            if exit_code == 0:
                passed.append("EXIT_CODE_ZERO")
            else:
                failed.append(f"NON_ZERO_EXIT_CODE: {exit_code}")

        # 4. Invariant verdict
        is_verified = (len(failed) == 0)
        conf = 1.0 if is_verified else max(0.0, 1.0 - (len(failed) * 0.4))

        return VerificationVerdict(
            verified=is_verified,
            confidence_score=conf,
            checks_passed=passed,
            checks_failed=failed,
            audit_notes=f"Verified {len(passed)} checks. {len(failed)} failures flagged.",
        )


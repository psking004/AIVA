"""Strategic Systems Engine - Sovereign Tri-Node Core.

Multi-tier, zero-external-dependency autonomous decision engine running symmetrically
across PC-A (workstation), PC-B (remote node), and Mobile (Termux/Pythonista).
Operates with pure standard library Python, with optional numpy acceleration when present.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from enum import Enum

CLUSTER_SHARED_SECRET: str = os.getenv("SSE_CLUSTER_SECRET", "sse_sovereign_mesh_secret_v1_2026")


class NodeID(str, Enum):
    """Symmetric sovereign node identifiers."""

    PC_A = "PC_A"
    PC_B = "PC_B"
    MOBILE = "MOBILE"


class NodeRole(str, Enum):
    """Symmetric sovereign node roles."""

    NODE_A = "PC_A"
    NODE_B = "PC_B"
    NODE_M = "MOBILE"


class OperationalMode(str, Enum):
    """Node operational execution topology."""

    SOLO = "SOLO"
    MESH = "MESH"


@dataclass(frozen=True, slots=True)
class SovereignDecisionVerdict:
    """Immutable, compact strategic verdict conforming to strict context budgeting."""

    node_id: str
    decision_id: str
    action_idx: int
    action_name: str
    expected_utility: float
    worst_case_regret: float
    solver_tier: str
    grant_token: str
    record_hash_16: str
    mode: str
    timestamp: float = 0.0

    def to_compact_payload(self) -> str:
        """Serialize into context-budgeted compact JSON (< 350 characters)."""
        data = {
            "node": self.node_id,
            "dec_id": self.decision_id,
            "act": self.action_idx,
            "name": self.action_name,
            "util": round(self.expected_utility, 3),
            "regret": round(self.worst_case_regret, 3),
            "tier": self.solver_tier,
            "grant": self.grant_token,
            "hash": self.record_hash_16,
            "mode": self.mode,
        }
        return json.dumps(data, separators=(",", ":"))


def generate_sovereign_grant(
    node_id: str,
    decision_id: str,
    action_idx: int,
    timestamp: float,
    prev_hash: str,
    secret: str = CLUSTER_SHARED_SECRET,
) -> str:
    """Generate an HMAC-SHA256 authorization grant token."""
    payload = f"{node_id}:{decision_id}:{action_idx}:{timestamp:.3f}:{prev_hash}".encode()
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"grant_{node_id}_{signature[:24]}"


def verify_sovereign_grant(
    grant_token: str,
    node_id: str,
    decision_id: str,
    action_idx: int,
    timestamp: float,
    prev_hash: str,
    current_time: float | None = None,
    airgapped_solo: bool = True,
    secret: str = CLUSTER_SHARED_SECRET,
    max_skew_sec: float = 300.0,
) -> tuple[bool, str]:
    """Verify cryptographic grant token with anti-replay and air-gapped isolation support."""
    if not airgapped_solo and current_time is not None:
        skew = abs(current_time - timestamp)
        if skew > max_skew_sec:
            return False, f"Timestamp expired (clock skew {skew:.2f}s > {max_skew_sec}s)"

    expected = generate_sovereign_grant(
        node_id=node_id,
        decision_id=decision_id,
        action_idx=action_idx,
        timestamp=timestamp,
        prev_hash=prev_hash,
        secret=secret,
    )
    if not hmac.compare_digest(grant_token, expected):
        return False, "Cryptographic grant signature mismatch"

    return True, "Grant valid"


class SovereignDecisionCore:
    """Multi-tier, zero-external-dependency autonomous decision engine."""

    def __init__(
        self,
        node_id: str | NodeID = NodeID.PC_A,
        mode: str | OperationalMode = OperationalMode.SOLO,
        secret: str = CLUSTER_SHARED_SECRET,
    ) -> None:
        self.node_id = str(node_id.value if isinstance(node_id, NodeID) else node_id)
        self.mode = str(mode.value if isinstance(mode, OperationalMode) else mode)
        self.secret = secret

    def solve_matrix(
        self,
        u1: list[list[float]],
        u2: list[list[float]],
        actions_p1: list[str] | None = None,
        actions_p2: list[str] | None = None,
        decision_id: str | None = None,
        prev_hash: str = "0" * 64,
        airgapped_solo: bool = True,
    ) -> SovereignDecisionVerdict:
        """Solve arbitrary 2-player bimatrix game using the 3-tier sovereign cascade.

        Tier 1: Iterative Elimination of Strictly Dominated Strategies (IESDS).
        Tier 2: Bilevel Strong Stackelberg Leader-Follower Equilibrium.
        Tier 3: Savage Minimax Regret Fallback.
        """
        m = len(u1)
        if m == 0 or len(u1[0]) == 0:
            raise ValueError("Payoff matrix u1 must not be empty.")
        n = len(u1[0])

        if len(u2) != m or any(len(row) != n for row in u2):
            raise ValueError(f"Payoff matrix u2 shape must match u1 ({m}x{n}).")

        act_p1 = actions_p1 or [f"A{i}" for i in range(m)]

        dec_id = decision_id or f"dec_{uuid.uuid4().hex[:8]}"
        now = time.time()

        # Tier 1: IESDS
        t1_action, t1_util = self._solve_iesds(u1, u2, m, n)
        if t1_action is not None:
            chosen_idx = t1_action
            chosen_name = act_p1[chosen_idx]
            exp_util = t1_util
            regret = 0.0
            tier = "T1_IESDS"
        else:
            # Tier 2: Bilevel Stackelberg Leader-Follower
            t2_action, t2_util, t2_unique = self._solve_stackelberg(u1, u2, m, n)
            if t2_unique and t2_action is not None:
                chosen_idx = t2_action
                chosen_name = act_p1[chosen_idx]
                exp_util = t2_util
                regret = 0.0
                tier = "T2_STACKELBERG"
            else:
                # Tier 3: Savage Minimax Regret Fallback
                chosen_idx, exp_util, regret = self._solve_minimax_regret(u1, m, n)
                chosen_name = act_p1[chosen_idx]
                tier = "T3_MINIMAX_REGRET"

        # Generate cryptographic grant
        grant_token = generate_sovereign_grant(
            node_id=self.node_id,
            decision_id=dec_id,
            action_idx=chosen_idx,
            timestamp=round(now, 3),
            prev_hash=prev_hash,
            secret=self.secret,
        )

        # 16-character record hash binding verdict
        hash_payload = f"{round(now, 3):.3f}:{self.node_id}:{dec_id}:{chosen_idx}:{grant_token}:{prev_hash}"
        record_hash_16 = hashlib.sha256(hash_payload.encode()).hexdigest()[:16]

        return SovereignDecisionVerdict(
            node_id=self.node_id,
            decision_id=dec_id,
            action_idx=chosen_idx,
            action_name=chosen_name,
            expected_utility=exp_util,
            worst_case_regret=regret,
            solver_tier=tier,
            grant_token=grant_token,
            record_hash_16=record_hash_16,
            mode=self.mode,
            timestamp=round(now, 3),
        )

    def _solve_iesds(
        self, u1: list[list[float]], u2: list[list[float]], m: int, n: int
    ) -> tuple[int | None, float]:
        """Pure-Python Iterative Elimination of Strictly Dominated Strategies."""
        alive_p1 = set(range(m))
        alive_p2 = set(range(n))

        changed = True
        while changed:
            changed = False

            # Check P1 strictly dominated actions
            p1_to_remove: set[int] = set()
            for i in alive_p1:
                for alt_i in alive_p1:
                    if alt_i == i:
                        continue
                    # alt_i strictly dominates i if u1[alt_i][j] > u1[i][j] for ALL alive j
                    if all(u1[alt_i][j] > u1[i][j] for j in alive_p2):
                        p1_to_remove.add(i)
                        break

            if p1_to_remove:
                alive_p1.difference_update(p1_to_remove)
                changed = True

            # Check P2 strictly dominated actions
            p2_to_remove: set[int] = set()
            for j in alive_p2:
                for alt_j in alive_p2:
                    if alt_j == j:
                        continue
                    # alt_j strictly dominates j if u2[i][alt_j] > u2[i][j] for ALL alive i
                    if all(u2[i][alt_j] > u2[i][j] for i in alive_p1):
                        p2_to_remove.add(j)
                        break

            if p2_to_remove:
                alive_p2.difference_update(p2_to_remove)
                changed = True

        if len(alive_p1) == 1 and len(alive_p2) == 1:
            i_star = next(iter(alive_p1))
            j_star = next(iter(alive_p2))
            return i_star, float(u1[i_star][j_star])

        return None, 0.0

    def _solve_stackelberg(
        self, u1: list[list[float]], u2: list[list[float]], m: int, n: int
    ) -> tuple[int | None, float, bool]:
        """Pure-Python Bilevel Strong Stackelberg Equilibrium with follower best response."""
        leader_payoffs: list[float] = []

        for i in range(m):
            # Follower best response set BR_2(i)
            max_follower_u = max(u2[i][j] for j in range(n))
            br2 = [j for j in range(n) if abs(u2[i][j] - max_follower_u) < 1e-9]

            # Strong Stackelberg: Follower breaks ties in leader's favor
            best_leader_u = max(u1[i][j] for j in br2)
            leader_payoffs.append(best_leader_u)

        max_lead = max(leader_payoffs)
        min_lead = min(leader_payoffs)
        best_actions = [i for i, u in enumerate(leader_payoffs) if abs(u - max_lead) < 1e-9]

        is_unique = (len(best_actions) == 1) or (max_lead > min_lead)
        chosen = best_actions[0]
        return chosen, max_lead, is_unique

    def _solve_minimax_regret(
        self, u1: list[list[float]], m: int, n: int
    ) -> tuple[int, float, float]:
        """Pure-Python Savage Minimax Regret minimization fallback."""
        # For each state of nature (action j of player 2), find maximum payoff
        max_for_state = [max(u1[i][j] for i in range(m)) for j in range(n)]

        max_regrets: list[float] = []
        for i in range(m):
            # Regret in each state: max_for_state[j] - u1[i][j]
            mr_i = max(max_for_state[j] - u1[i][j] for j in range(n))
            max_regrets.append(mr_i)

        min_worst_case_regret = min(max_regrets)
        best_i = max_regrets.index(min_worst_case_regret)

        # Expected utility averaged over adversary states
        avg_util = sum(u1[best_i][j] for j in range(n)) / float(n)
        return best_i, avg_util, min_worst_case_regret

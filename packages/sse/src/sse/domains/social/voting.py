"""Social Systems domain — Weighted Voting Bodies, Power Indices (Banzhaf, Shapley-Shubik), and Ostrom CPR."""

from __future__ import annotations

import math
from collections.abc import Sequence
from itertools import combinations

import numpy as np

from sse.models import FiniteNormalFormGame


class WeightedVotingBody:
    """Calculates exact voting power indices for weighted voting bodies [q; w_1, ..., w_n].

    Characteristic function v(S) = 1 if sum_{i in S} w_i >= q else 0.
    1. Penrose-Banzhaf Index (swing count):
       eta_i = count of coalitions S without i where S is losing (sum < q) but S U {i} is winning (sum >= q).
       Absolute Banzhaf: beta_i = eta_i / 2^(n-1).
       Normalized Banzhaf: beta'_i = eta_i / sum_j eta_j.
    2. Shapley-Shubik Index (pivotal permutations):
       phi_i = sum_{S subset N \\ {i}} [ |S|! * (n - |S| - 1)! / n! ] * [v(S U {i}) - v(S)].
       Invariant: sum_i phi_i == 1.0.
    """

    def __init__(
        self,
        weights: Sequence[float],
        quota: float,
        voter_names: Sequence[str] | None = None,
    ) -> None:
        if not weights:
            raise ValueError("Voting body must have at least one member.")
        if quota <= 0:
            raise ValueError("Quota must be strictly positive.")
        self.weights = list(weights)
        self.quota = quota
        self.n = len(self.weights)
        self.names = list(voter_names) if voter_names else [f"Voter_{i+1}" for i in range(self.n)]
        if len(self.names) != self.n:
            raise ValueError("Length of voter_names must match weights.")

    def is_winning(self, subset_indices: Sequence[int]) -> int:
        """Characteristic function v(S): 1 if sum_{i in S} w_i >= q else 0."""
        return 1 if sum(self.weights[i] for i in subset_indices) >= self.quota else 0

    def penrose_banzhaf_indices(self) -> tuple[dict[str, float], dict[str, float]]:
        """Computes absolute and normalized Penrose-Banzhaf power indices.

        Returns:
            (absolute_banzhaf, normalized_banzhaf)
        """
        n = self.n
        swings = np.zeros(n, dtype=np.int64)
        all_voters = set(range(n))

        # Iterate over all coalitions not containing voter i
        for size in range(n):
            for subset in combinations(range(n), size):
                weight_s = sum(self.weights[idx] for idx in subset)
                subset_set = set(subset)
                for i in all_voters - subset_set:
                    if weight_s < self.quota and (weight_s + self.weights[i]) >= self.quota:
                        swings[i] += 1

        total_swings = int(np.sum(swings))
        total_subsets = 2 ** (n - 1)

        absolute_b = {self.names[i]: float(swings[i] / total_subsets) for i in range(n)}
        if total_swings > 0:
            norm_b = {self.names[i]: float(swings[i] / total_swings) for i in range(n)}
        else:
            norm_b = {self.names[i]: float(1.0 / n) for i in range(n)}

        return absolute_b, norm_b

    def shapley_shubik_indices(self) -> dict[str, float]:
        """Computes exact Shapley-Shubik power indices: sum_i phi_i == 1.0."""
        n = self.n
        phi = np.zeros(n, dtype=np.float64)
        fact_n = math.factorial(n)
        all_voters = set(range(n))

        for size in range(n):
            coeff = (math.factorial(size) * math.factorial(n - size - 1)) / fact_n
            for subset in combinations(range(n), size):
                weight_s = sum(self.weights[idx] for idx in subset)
                subset_set = set(subset)
                for i in all_voters - subset_set:
                    # Marginal contribution v(S U {i}) - v(S)
                    if weight_s < self.quota and (weight_s + self.weights[i]) >= self.quota:
                        phi[i] += coeff

        # Normalize minor floating point rounding
        total = float(np.sum(phi))
        if total > 0:
            phi = phi / total

        return {self.names[i]: float(phi[i]) for i in range(n)}

    def to_game(self) -> FiniteNormalFormGame:
        """Generates a voting game over Support vs Abstain/Veto for first 2 representative voters."""
        v1_actions = ["Vote_Yes", "Vote_No"]
        v2_actions = ["Vote_Yes", "Vote_No"]

        payoffs: list[list[float]] = []
        ss = self.shapley_shubik_indices()
        phi1 = ss[self.names[0]]
        phi2 = ss[self.names[1]] if self.n > 1 else 0.0

        for a1 in v1_actions:
            for a2 in v2_actions:
                votes = (1 if a1 == "Vote_Yes" else 0, 1 if a2 == "Vote_Yes" else 0)
                # Baseline passage payoff proportional to power
                if sum(votes) >= 1:
                    u1 = 10.0 * phi1
                    u2 = 10.0 * phi2
                else:
                    u1 = 0.0
                    u2 = 0.0
                payoffs.append([round(u1, 2), round(u2, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "weighted-voting-power-index",
            "name": f"Weighted Voting Body [q={self.quota}]",
            "players": [self.names[0], self.names[1] if self.n > 1 else "Voter_2"],
            "actions": {
                self.names[0]: v1_actions,
                self.names[1] if self.n > 1 else "Voter_2": v2_actions,
            },
            "payoffs": payoffs,
        })


class OstromCommonPoolGovernance:
    """Elinor Ostrom Common-Pool Resource (CPR) Governance Game with Graduated Sanctions.

    Appropriators choose extraction levels x_i from renewable resource pool R.
    Over-extraction leads to resource collapse.
    Monitoring probability p_inspect detects over-extraction and applies graduated penalties S(x_i).
    """

    def __init__(
        self,
        pool_capacity: float = 100.0,
        regeneration_rate: float = 0.20,
        p_inspect: float = 0.40,
        graduated_sanction_factor: float = 2.5,
    ) -> None:
        self.capacity = pool_capacity
        self.regen = regeneration_rate
        self.p_inspect = p_inspect
        self.sanction_factor = graduated_sanction_factor

    def to_game(
        self,
        extraction_levels: Sequence[float] = (15.0, 30.0, 50.0),
    ) -> FiniteNormalFormGame:
        """Constructs a 2-appropriator CPR extraction game."""
        actions = [f"Extract_{int(x)}" for x in extraction_levels]
        payoffs: list[list[float]] = []

        sustainable_threshold = (self.capacity * self.regen) / 2.0

        for x1 in extraction_levels:
            for x2 in extraction_levels:
                total_extract = x1 + x2
                collapse_risk = max(0.0, min(1.0, (total_extract - self.capacity * self.regen) / self.capacity))

                # Direct revenue
                r1 = x1 * (1.0 - 0.5 * collapse_risk)
                r2 = x2 * (1.0 - 0.5 * collapse_risk)

                # Sanctions for exceeding sustainable threshold
                fine1 = (
                    self.p_inspect * self.sanction_factor * (x1 - sustainable_threshold)
                    if x1 > sustainable_threshold
                    else 0.0
                )
                fine2 = (
                    self.p_inspect * self.sanction_factor * (x2 - sustainable_threshold)
                    if x2 > sustainable_threshold
                    else 0.0
                )

                u1 = r1 - fine1
                u2 = r2 - fine2
                payoffs.append([round(float(u1), 2), round(float(u2), 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "ostrom-cpr-graduated-sanctions",
            "name": "Ostrom Common-Pool Resource Governance",
            "players": ["Appropriator_A", "Appropriator_B"],
            "actions": {
                "Appropriator_A": actions,
                "Appropriator_B": actions,
            },
            "payoffs": payoffs,
        })

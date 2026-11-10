"""Social Systems Domain Adapter — Ingests voting bodies, quotas, and commons governance parameters."""

from __future__ import annotations

from collections.abc import Sequence

from sse.domains.social.voting import (
    OstromCommonPoolGovernance,
    WeightedVotingBody,
)
from sse.models import FiniteNormalFormGame


class SocialSystemsAdapter:
    """Translates political voting weights, power indices, and resource extraction rules into games."""

    @staticmethod
    def create_weighted_voting_game(
        weights: Sequence[float],
        quota: float,
        voter_names: Sequence[str] | None = None,
    ) -> FiniteNormalFormGame:
        """Constructs a weighted voting body strategic interaction game."""
        body = WeightedVotingBody(weights=weights, quota=quota, voter_names=voter_names)
        return body.to_game()

    @staticmethod
    def calculate_power_indices(
        weights: Sequence[float],
        quota: float,
        voter_names: Sequence[str] | None = None,
    ) -> dict[str, dict[str, float]]:
        """Calculates exact Banzhaf and Shapley-Shubik voting power indices."""
        body = WeightedVotingBody(weights=weights, quota=quota, voter_names=voter_names)
        abs_b, norm_b = body.penrose_banzhaf_indices()
        ss = body.shapley_shubik_indices()
        return {
            "absolute_banzhaf": abs_b,
            "normalized_banzhaf": norm_b,
            "shapley_shubik": ss,
        }

    @staticmethod
    def create_common_pool_resource_game(
        pool_capacity: float = 100.0,
        regeneration_rate: float = 0.20,
        p_inspect: float = 0.40,
        graduated_sanction_factor: float = 2.5,
        extraction_levels: Sequence[float] = (15.0, 30.0, 50.0),
    ) -> FiniteNormalFormGame:
        """Constructs an Ostrom common-pool resource governance game."""
        cpr = OstromCommonPoolGovernance(
            pool_capacity=pool_capacity,
            regeneration_rate=regeneration_rate,
            p_inspect=p_inspect,
            graduated_sanction_factor=graduated_sanction_factor,
        )
        return cpr.to_game(extraction_levels=extraction_levels)


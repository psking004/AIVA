"""Cybersecurity Domain Adapter — Bridges external network/vulnerability feeds into formal games."""

from __future__ import annotations

from typing import Any

from sse.domains.cybersecurity.models import (
    BayesianDynamicDeceptionModel,
    DynamicPatchPrioritizationModel,
    NetworkAsset,
    StackelbergSecurityGame,
)
from sse.models import FiniteNormalFormGame
from sse.models.bayesian import BayesianGame


class CybersecurityDomainAdapter:
    """Translates network topology, vulnerability telemetry, and alert streams into game models."""

    @staticmethod
    def create_honeypot_allocation_game(
        network_topology: dict[str, Any],
        target_assets: list[dict[str, Any]],
        defense_budget: float,
    ) -> FiniteNormalFormGame:
        """Constructs a Stackelberg Security Game for honeypot placement and monitoring coverage."""
        assets: list[NetworkAsset] = []
        for item in target_assets:
            assets.append(
                NetworkAsset(
                    target_id=str(item.get("id", item.get("target_id", "asset"))),
                    valuation=float(item.get("valuation", item.get("value", 10.0))),
                    defense_cost=float(item.get("defense_cost", 1.0)),
                    attack_cost=float(item.get("attack_cost", 0.5)),
                    cvss_score=float(item.get("cvss", 7.0)),
                    centrality=float(item.get("centrality", 0.5)),
                    downtime_cost=float(item.get("downtime_cost", 5.0)),
                )
            )

        edges = network_topology.get("edges", [])
        game_model = StackelbergSecurityGame(
            targets=assets,
            defense_budget=defense_budget,
            network_edges=edges,
        )
        return game_model.to_game()

    @staticmethod
    def create_apt_lateral_movement_game(
        network_nodes: list[str],
        apt_prior_prob: float = 0.35,
    ) -> BayesianGame:
        """Constructs an incomplete-information Bayesian game over attacker skill levels."""
        deception_model = BayesianDynamicDeceptionModel(
            target_nodes=network_nodes,
            p_apt=apt_prior_prob,
        )
        return deception_model.to_bayesian_game()

    @staticmethod
    def create_patch_prioritization_game(
        vulnerabilities: list[dict[str, Any]],
        budget: float = 15.0,
    ) -> FiniteNormalFormGame:
        """Constructs a dynamic patch prioritization game balancing CVSS and downtime costs."""
        patch_model = DynamicPatchPrioritizationModel(
            vulnerabilities=vulnerabilities,
            maintenance_budget=budget,
        )
        return patch_model.to_game()


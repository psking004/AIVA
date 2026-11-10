"""Strategic Systems Engine - Uncertainty Quantifier.

Distinguishes epistemic vs aleatoric uncertainty, measures information completeness,
and produces formal UncertaintyAssessment contract objects.
"""

from __future__ import annotations

from sse.contracts.decision import UncertaintyAssessment
from sse.contracts.world_state import WorldStateSnapshot
from sse.strategic.prediction.scenario_generator import Scenario


class UncertaintyQuantifier:
    """Measures and decomposes uncertainty in strategic decision contexts."""

    def assess_uncertainty(
        self,
        snapshot: WorldStateSnapshot,
        scenarios: list[Scenario],
        forecast_metrics: dict[str, float],
        known_unknowns: list[str] | None = None,
    ) -> UncertaintyAssessment:
        """Computes a formal UncertaintyAssessment for a decision situation."""
        unknowns = known_unknowns or []

        # Epistemic uncertainty: increases with missing entity attributes and unverified relations
        missing_attrs = 0
        total_entities = max(1, len(snapshot.entities))
        for ent in snapshot.entities.values():
            if not ent.attributes:
                missing_attrs += 1
            if ent.rationality_bound < 0.5:
                unknowns.append(f"Entity '{ent.name}' rationality is unpredictable")

        epistemic = min(1.0, (missing_attrs / total_entities) * 0.4 + (len(unknowns) * 0.15))

        # Aleatoric uncertainty: driven by dispersion of scenario outcomes
        var = forecast_metrics.get("variance", 0.0)
        mean_abs = abs(forecast_metrics.get("expected_payoff", 1.0))
        # Coefficient of variation capped at 1.0
        aleatoric = min(1.0, (var ** 0.5) / (mean_abs + 1e-4) if mean_abs > 0 else 0.5)

        # Composite confidence score
        # Confidence decays as epistemic and aleatoric uncertainty increase
        composite_confidence = max(0.05, 1.0 - (0.6 * epistemic + 0.4 * aleatoric))

        ci_low = forecast_metrics.get("ci_low", 0.0)
        ci_high = forecast_metrics.get("ci_high", 1.0)
        var_95 = forecast_metrics.get("var_95", 0.0)

        sensitivity_factors: dict[str, float] = {
            "competitor_rationality": 0.35,
            "resource_cost_volatility": 0.25,
            "market_demand_elasticity": 0.40,
        }

        return UncertaintyAssessment(
            confidence_score=round(composite_confidence, 3),
            epistemic_uncertainty=round(epistemic, 3),
            aleatoric_uncertainty=round(aleatoric, 3),
            value_at_risk_95=round(var_95, 3),
            confidence_interval_low=round(ci_low, 3),
            confidence_interval_high=round(ci_high, 3),
            known_unknowns=list(set(unknowns)),
            sensitivity_factors=sensitivity_factors,
        )

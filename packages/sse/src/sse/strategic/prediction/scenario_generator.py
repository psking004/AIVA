"""Strategic Systems Engine - Scenario Generator.

Generates structured future scenarios (base-case, optimistic, pessimistic,
adversarial, and black-swan) based on world state and uncertainty parameters.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from sse.contracts.world_state import WorldStateSnapshot


@dataclass
class Scenario:
    """A projected future state scenario with assigned probability and parameter modifiers."""

    scenario_id: str
    name: str
    scenario_type: str  # base_case, optimistic, pessimistic, adversarial, black_swan
    probability: float  # [0.0, 1.0]
    payoff_modifier: float  # Multiplier applied to base returns
    risk_factor: float  # Additional risk exposure
    description: str
    assumptions: list[str] = field(default_factory=list)
    state_perturbations: dict[str, Any] = field(default_factory=dict)


class ScenarioGenerator:
    """Generates comprehensive scenario sets for decision evaluation."""

    def __init__(self, random_seed: int | None = None) -> None:
        self.random_seed = random_seed

    def generate_scenarios(
        self,
        snapshot: WorldStateSnapshot,
        competitor_count: int = 1,
    ) -> list[Scenario]:
        """Generates the standard 5-scenario evaluation suite."""
        scenarios: list[Scenario] = [
            Scenario(
                scenario_id=str(uuid.uuid4()),
                name="Base Case (Current Trajectory)",
                scenario_type="base_case",
                probability=0.50,
                payoff_modifier=1.0,
                risk_factor=0.20,
                description="Status quo operational environment persists with expected market growth.",
                assumptions=["Competitor behavior follows empirical priors", "No regulatory changes"],
            ),
            Scenario(
                scenario_id=str(uuid.uuid4()),
                name="Optimistic (Favorable Conditions)",
                scenario_type="optimistic",
                probability=0.20,
                payoff_modifier=1.35,
                risk_factor=0.10,
                description="High market demand, favorable partner alignment, minimal friction.",
                assumptions=["Cost efficiencies materialize", "Demand exceeds forecast by 25%"],
            ),
            Scenario(
                scenario_id=str(uuid.uuid4()),
                name="Pessimistic (Downturn / Friction)",
                scenario_type="pessimistic",
                probability=0.15,
                payoff_modifier=0.65,
                risk_factor=0.45,
                description="Economic contraction or operational delays reduce payoff yields.",
                assumptions=["Supply delays occur", "Operating costs rise by 15%"],
            ),
            Scenario(
                scenario_id=str(uuid.uuid4()),
                name="Adversarial (Aggressive Countermove)",
                scenario_type="adversarial",
                probability=0.10,
                payoff_modifier=0.40,
                risk_factor=0.65,
                description="Competitors execute coordinated price cuts or aggressive retaliatory actions.",
                assumptions=["Competitors behave as minimax rational adversaries"],
            ),
            Scenario(
                scenario_id=str(uuid.uuid4()),
                name="Black Swan (High-Impact Anomaly)",
                scenario_type="black_swan",
                probability=0.05,
                payoff_modifier=0.15,
                risk_factor=0.90,
                description="Extreme low-probability systemic shock (regulatory shutdown, critical exploit).",
                assumptions=["Critical external dependency experiences sudden total failure"],
            ),
        ]
        # Normalize probabilities to sum to 1.0 exactly
        total_p = sum(s.probability for s in scenarios)
        for s in scenarios:
            s.probability = float(s.probability / total_p)

        return scenarios

"""Strategic Systems Engine - Analytical Method & Solver Selector.

Selects appropriate mathematical solvers, optimization engines, and simulation
frameworks based on classified problem type.
"""

from __future__ import annotations

from sse.contracts.decision import DecisionRequest, ProblemType


class MethodSelector:
    """Selects primary and cross-verification analytical methods."""

    def select_methods(
        self,
        problem_type: ProblemType,
        request: DecisionRequest | None = None,
    ) -> list[str]:
        """Returns ordered list of solver methods suited for the problem type."""
        # If user explicitly requested solvers, prioritize them
        if request and request.preferred_solvers:
            return list(request.preferred_solvers)

        if problem_type == ProblemType.SINGLE_AGENT_OPTIMIZATION:
            return ["linear_optimization", "scenario_forecasting"]

        if problem_type == ProblemType.RESOURCE_ALLOCATION:
            return ["linear_optimization", "multi_objective_pareto", "scenario_forecasting"]

        if problem_type == ProblemType.TWO_PLAYER_ZERO_SUM:
            return ["minimax", "dominant_strategy", "scenario_forecasting"]

        if problem_type == ProblemType.TWO_PLAYER_GENERAL_SUM:
            return ["pure_nash", "support_enumeration", "dominant_strategy", "scenario_forecasting"]

        if problem_type == ProblemType.MULTI_AGENT_COMPETITIVE:
            return ["regret_matching", "evolutionary_dynamics", "multi_agent_simulation"]

        if problem_type == ProblemType.COOPERATIVE_COALITION:
            return ["shapley_value", "core_allocation"]

        if problem_type == ProblemType.SEQUENTIAL_EXTENSIVE:
            return ["backward_induction", "scenario_forecasting"]

        # Default fallback
        return ["scenario_forecasting", "minimax_regret"]

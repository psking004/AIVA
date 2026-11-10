"""Strategic Systems Engine - Minimax Regret Analyzer.

Evaluates Savage Minimax Regret across candidate actions and scenarios to identify
robust actions under deep uncertainty.
"""

from __future__ import annotations


class RegretAnalyzer:
    """Computes regret matrices and identifies minimax-regret decisions."""

    def compute_regret_matrix(
        self,
        payoff_matrix: dict[str, dict[str, float]],  # action_id -> scenario_id -> payoff
    ) -> dict[str, dict[str, float]]:
        """Constructs the regret matrix.

        regret(action, scenario) = max_a'(payoff(a', scenario)) - payoff(action, scenario)
        """
        if not payoff_matrix:
            return {}

        actions = list(payoff_matrix.keys())
        scenarios = list(payoff_matrix[actions[0]].keys())

        # Determine best payoff in each scenario
        scenario_max: dict[str, float] = {}
        for s in scenarios:
            best_val = max(payoff_matrix[a][s] for a in actions)
            scenario_max[s] = best_val

        # Compute regret table
        regret_table: dict[str, dict[str, float]] = {}
        for a in actions:
            regret_table[a] = {}
            for s in scenarios:
                regret_table[a][s] = max(0.0, scenario_max[s] - payoff_matrix[a][s])

        return regret_table

    def find_minimax_regret_action(
        self,
        payoff_matrix: dict[str, dict[str, float]],
    ) -> tuple[str, float, dict[str, float]]:
        """Finds the action that minimizes maximum possible regret.

        Returns (best_action_id, minimum_maximum_regret, max_regret_per_action).
        """
        regret_table = self.compute_regret_matrix(payoff_matrix)
        if not regret_table:
            return ("", 0.0, {})

        max_regrets: dict[str, float] = {}
        for a, s_dict in regret_table.items():
            max_regrets[a] = max(s_dict.values()) if s_dict else 0.0

        best_action = min(max_regrets.keys(), key=lambda a: max_regrets[a])
        return (best_action, max_regrets[best_action], max_regrets)

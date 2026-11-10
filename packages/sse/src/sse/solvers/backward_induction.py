"""Subgame-perfect backward induction solver for extensive-form game trees."""

from __future__ import annotations

from dataclasses import dataclass, field

from sse.core.games import ExtensiveFormGame
from sse.core.types import GameFamily
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class BackwardInductionResult(SolverResult):
    """Result of backward induction on an extensive-form game tree."""

    optimal_actions: dict[str, str] = field(default_factory=dict)  # node_id -> optimal action chosen
    root_expected_payoffs: tuple[float, ...] = ()
    nodes_evaluated: int = 0


class BackwardInductionSolver:
    """Compute subgame-perfect Nash equilibrium (SPNE) on finite extensive-form games."""

    name = "backward_induction"
    supported_families = (GameFamily.EXTENSIVE_FORM,)

    def solve(
        self,
        game: ExtensiveFormGame,
        tolerance: float = 0.0,
    ) -> BackwardInductionResult:
        """Execute recursive backward induction starting from the root node."""
        if not game.is_perfect_information:
            raise ValueError(
                "Backward induction requires perfect information (no nontrivial information sets)."
            )

        optimal_actions: dict[str, str] = {}
        nodes_evaluated = 0

        def _evaluate(node_id: str) -> tuple[float, ...]:
            nonlocal nodes_evaluated
            nodes_evaluated += 1
            node = game.nodes[node_id]

            if node.node_type == "TERMINAL":
                if node.payoffs is None:
                    raise ValueError(f"Terminal node '{node_id}' has no payoff vector.")
                return node.payoffs

            elif node.node_type == "CHANCE":
                if not node.actions or not node.chance_probs:
                    raise ValueError(f"Chance node '{node_id}' missing actions or chance_probs.")
                expected_payoffs = [0.0] * len(game.players)
                for (action, child_id), prob in zip(node.actions, node.chance_probs, strict=True):
                    child_payoffs = _evaluate(child_id)
                    for p_idx in range(len(game.players)):
                        expected_payoffs[p_idx] += prob * child_payoffs[p_idx]
                return tuple(expected_payoffs)

            elif node.node_type == "DECISION":
                if node.player_id is None:
                    raise ValueError(f"Decision node '{node_id}' has no player_id.")
                player_idx = game.players.index(node.player_id)

                best_action: str | None = None
                best_payoff = float("-inf")
                best_vector: tuple[float, ...] = ()

                for action, child_id in node.actions:
                    child_payoffs = _evaluate(child_id)
                    curr_payoff = child_payoffs[player_idx]
                    if curr_payoff > best_payoff + tolerance:
                        best_payoff = curr_payoff
                        best_action = action
                        best_vector = child_payoffs

                if best_action is None:
                    raise ValueError(f"No valid action could be chosen at node '{node_id}'.")

                optimal_actions[node_id] = best_action
                return best_vector

            else:
                raise ValueError(f"Unrecognized node_type: {node.node_type}")

        root_payoffs = _evaluate(game.root_id)

        return BackwardInductionResult(
            status="solved",
            solution_count=1,
            diagnostics={
                "nodes_evaluated": nodes_evaluated,
                "tree_node_count": len(game.nodes),
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="zermelo_kuhn_backward_induction",
                exact=True,
                tolerance=tolerance,
                notes=("Subgame-perfect equilibrium via backward induction on game trees.",),
            ),
            optimal_actions=optimal_actions,
            root_expected_payoffs=root_payoffs,
            nodes_evaluated=nodes_evaluated,
        )

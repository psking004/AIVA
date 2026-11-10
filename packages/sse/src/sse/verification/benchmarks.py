"""Strategic Systems Engine - Canonical Game Benchmark Suite and Invariant Engine.

Programmatically generates the 10 canonical benchmark games and provides formal
mathematical invariant validation checks for equilibrium solutions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from sse.models import FiniteNormalFormGame, Player
from sse.strategic.solvers.exact_solvers import (
    EquilibriumResult,
    StackelbergEquilibriumResult,
    extract_bimatrix,
)


class CanonicalBenchmarkSuite:
    """Factory for the 10 canonical research benchmark games."""

    @staticmethod
    def prisoners_dilemma() -> FiniteNormalFormGame:
        """1. Prisoner's Dilemma: Dominant-strategy defect-defect equilibrium."""
        players = (Player("P1", "Row"), Player("P2", "Column"))
        actions = (("Cooperate", "Defect"), ("Cooperate", "Defect"))
        # Payoffs: (C,C)=(3,3), (C,D)=(0,5), (D,C)=(5,0), (D,D)=(1,1)
        payoffs = ((3.0, 3.0), (0.0, 5.0), (5.0, 0.0), (1.0, 1.0))
        return FiniteNormalFormGame("prisoners_dilemma", "Prisoner's Dilemma", players, actions, payoffs)

    @staticmethod
    def matching_pennies() -> FiniteNormalFormGame:
        """2. Matching Pennies: 2x2 strictly competitive zero-sum game."""
        players = (Player("P1", "Heads/Tails"), Player("P2", "Heads/Tails"))
        actions = (("Heads", "Tails"), ("Heads", "Tails"))
        # Payoffs: (H,H)=(1,-1), (H,T)=(-1,1), (T,H)=(-1,1), (T,T)=(1,-1)
        payoffs = ((1.0, -1.0), (-1.0, 1.0), (-1.0, 1.0), (1.0, -1.0))
        return FiniteNormalFormGame("matching_pennies", "Matching Pennies", players, actions, payoffs)

    @staticmethod
    def rock_paper_scissors() -> FiniteNormalFormGame:
        """3. Rock-Paper-Scissors: 3x3 cyclic zero-sum game."""
        players = (Player("P1", "Player 1"), Player("P2", "Player 2"))
        actions = (("Rock", "Paper", "Scissors"), ("Rock", "Paper", "Scissors"))
        payoffs = (
            (0.0, 0.0), (-1.0, 1.0), (1.0, -1.0),
            (1.0, -1.0), (0.0, 0.0), (-1.0, 1.0),
            (-1.0, 1.0), (1.0, -1.0), (0.0, 0.0),
        )
        return FiniteNormalFormGame("rock_paper_scissors", "Rock Paper Scissors", players, actions, payoffs)

    @staticmethod
    def battle_of_the_sexes() -> FiniteNormalFormGame:
        """4. Battle of the Sexes: Coordination game with asymmetric preferences."""
        players = (Player("P1", "Row"), Player("P2", "Column"))
        actions = (("Opera", "Football"), ("Opera", "Football"))
        payoffs = ((3.0, 2.0), (0.0, 0.0), (0.0, 0.0), (2.0, 3.0))
        return FiniteNormalFormGame("battle_of_the_sexes", "Battle of the Sexes", players, actions, payoffs)

    @staticmethod
    def stag_hunt() -> FiniteNormalFormGame:
        """5. Stag Hunt: Payoff-dominant vs risk-dominant coordination game."""
        players = (Player("P1", "Row"), Player("P2", "Column"))
        actions = (("Stag", "Hare"), ("Stag", "Hare"))
        # (S,S)=(5,5) payoff dominant, (H,H)=(3,3) risk dominant, (S,H)=(0,3), (H,S)=(3,0)
        payoffs = ((5.0, 5.0), (0.0, 3.0), (3.0, 0.0), (3.0, 3.0))
        return FiniteNormalFormGame("stag_hunt", "Stag Hunt", players, actions, payoffs)

    @staticmethod
    def hawk_dove() -> FiniteNormalFormGame:
        """6. Hawk-Dove (Chicken): Anti-coordination game."""
        players = (Player("P1", "Row"), Player("P2", "Column"))
        actions = (("Hawk", "Dove"), ("Hawk", "Dove"))
        # (H,H)=(-25,-25), (H,D)=(50,0), (D,H)=(0,50), (D,D)=(15,15)
        payoffs = ((-25.0, -25.0), (50.0, 0.0), (0.0, 50.0), (15.0, 15.0))
        return FiniteNormalFormGame("hawk_dove", "Hawk-Dove", players, actions, payoffs)

    @staticmethod
    def cournot_duopoly(
        grid_points: int = 5,
        market_demand_a: float = 30.0,
        slope_b: float = 1.0,
        marginal_cost_c: float = 6.0,
    ) -> FiniteNormalFormGame:
        """7. Cournot Duopoly: Discretized quantity competition P(Q) = max(0, a - b*Q)."""
        players = (Player("Firm1", "Firm 1"), Player("Firm 2", "Firm 2"))
        quantities = np.linspace(2.0, 12.0, grid_points)
        actions = (
            tuple(f"q_{val:.1f}" for val in quantities),
            tuple(f"q_{val:.1f}" for val in quantities),
        )
        payoffs: list[tuple[float, float]] = []
        for q1 in quantities:
            for q2 in quantities:
                price = max(0.0, market_demand_a - slope_b * (q1 + q2))
                pi1 = q1 * (price - marginal_cost_c)
                pi2 = q2 * (price - marginal_cost_c)
                payoffs.append((float(pi1), float(pi2)))
        return FiniteNormalFormGame("cournot_duopoly", "Cournot Duopoly", players, actions, tuple(payoffs))

    @staticmethod
    def bertrand_competition(
        grid_points: int = 5,
        marginal_cost_c: float = 10.0,
    ) -> FiniteNormalFormGame:
        """8. Bertrand Price Competition: Firm with lowest price captures entire market."""
        players = (Player("Firm1", "Firm 1"), Player("Firm 2", "Firm 2"))
        prices = np.linspace(marginal_cost_c, marginal_cost_c + 8.0, grid_points)
        actions = (
            tuple(f"p_{val:.1f}" for val in prices),
            tuple(f"p_{val:.1f}" for val in prices),
        )
        payoffs: list[tuple[float, float]] = []
        for p1 in prices:
            for p2 in prices:
                demand = max(0.0, 50.0 - min(p1, p2))
                if p1 < p2:
                    pi1 = demand * (p1 - marginal_cost_c)
                    pi2 = 0.0
                elif p2 < p1:
                    pi1 = 0.0
                    pi2 = demand * (p2 - marginal_cost_c)
                else:
                    # Equal split
                    pi1 = 0.5 * demand * (p1 - marginal_cost_c)
                    pi2 = 0.5 * demand * (p2 - marginal_cost_c)
                payoffs.append((float(pi1), float(pi2)))
        return FiniteNormalFormGame("bertrand_competition", "Bertrand Competition", players, actions, tuple(payoffs))

    @staticmethod
    def stackelberg_market() -> FiniteNormalFormGame:
        """9. Stackelberg Leader-Follower Market: 3x3 quantity commitment game."""
        players = (Player("Leader", "Leader Firm"), Player("Follower", "Follower Firm"))
        actions = (("q_low", "q_mid", "q_high"), ("q_low", "q_mid", "q_high"))
        # Standard discretized Cournot-Stackelberg payoffs
        payoffs = (
            (18.0, 18.0), (14.0, 20.0), (9.0, 18.0),
            (20.0, 14.0), (16.0, 16.0), (10.0, 14.0),
            (18.0, 9.0),  (14.0, 10.0), (8.0, 8.0),
        )
        return FiniteNormalFormGame("stackelberg_market", "Stackelberg Market", players, actions, payoffs)

    @staticmethod
    def public_goods_dilemma(
        grid_points: int = 4,
        endowment: float = 10.0,
        multiplier: float = 1.6,
    ) -> FiniteNormalFormGame:
        """10. Public Goods Dilemma: Contribution game with social multiplier."""
        players = (Player("Agent1", "Agent 1"), Player("Agent 2", "Agent 2"))
        contributions = np.linspace(0.0, endowment, grid_points)
        actions = (
            tuple(f"c_{val:.1f}" for val in contributions),
            tuple(f"c_{val:.1f}" for val in contributions),
        )
        payoffs: list[tuple[float, float]] = []
        for c1 in contributions:
            for c2 in contributions:
                pool = multiplier * (c1 + c2)
                share = pool / 2.0
                u1 = (endowment - c1) + share
                u2 = (endowment - c2) + share
                payoffs.append((float(u1), float(u2)))
        return FiniteNormalFormGame("public_goods", "Public Goods Dilemma", players, actions, tuple(payoffs))


@dataclass(frozen=True, slots=True)
class InvariantVerificationReport:
    """Report validating mathematical invariants on computed equilibria."""

    game_id: str
    epsilon_nash_satisfied: bool
    max_incentive_to_deviate: float
    zero_sum_minimax_satisfied: bool | None
    dominated_strategy_pruned: bool
    stackelberg_gain_satisfied: bool | None
    details: dict[str, Any]


class MathematicalInvariantEngine:
    """Rigorous verification engine enforcing game-theoretic mathematical invariants."""

    @staticmethod
    def verify_epsilon_nash(
        game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray],
        eq: EquilibriumResult,
        epsilon_tol: float = 1e-6,
    ) -> tuple[bool, float]:
        """Asserts: max_{s_i' in S_i} [ u_i(s_i', s_{-i}*) - u_i(s_i*, s_{-i}*) ] <= epsilon_tol."""
        A, B = extract_bimatrix(game)
        x = eq.strategy_1
        y = eq.strategy_2

        # P1 deviations:
        u1_pure = A @ y
        u1_exp = float(x @ u1_pure)
        max_dev1 = float(np.max(u1_pure) - u1_exp)

        # P2 deviations:
        u2_pure = x @ B
        u2_exp = float(u2_pure @ y)
        max_dev2 = float(np.max(u2_pure) - u2_exp)

        max_dev = max(0.0, max(max_dev1, max_dev2))
        return (max_dev <= epsilon_tol, max_dev)

    @staticmethod
    def verify_minimax_identity(
        A: np.ndarray,
        B: np.ndarray,
        eq: EquilibriumResult,
        tol: float = 1e-6,
    ) -> bool | None:
        """In zero-sum games (B == -A), asserts value(P1) == -value(P2)."""
        if not np.allclose(B, -A, atol=1e-8):
            return None  # Not a zero-sum game
        return abs(eq.payoff_1 + eq.payoff_2) <= tol

    @staticmethod
    def verify_strict_dominance_pruning(
        game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray],
        eq: EquilibriumResult,
        tol: float = 1e-8,
    ) -> bool:
        """Strictly dominated pure strategies must receive exactly 0.0 probability in all equilibria."""
        A, B = extract_bimatrix(game)
        m, n = A.shape

        # Find strictly dominated actions for P1
        dominated_p1 = set()
        for i1 in range(m):
            for i2 in range(m):
                if i1 != i2 and np.all(A[i2, :] > A[i1, :] + 1e-8):
                    dominated_p1.add(i1)
                    break

        # Find strictly dominated actions for P2
        dominated_p2 = set()
        for j1 in range(n):
            for j2 in range(n):
                if j1 != j2 and np.all(B[:, j2] > B[:, j1] + 1e-8):
                    dominated_p2.add(j1)
                    break

        # Check if any dominated action has > tol probability
        for idx in dominated_p1:
            if eq.strategy_1[idx] > tol:
                return False

        for idx in dominated_p2:
            if eq.strategy_2[idx] > tol:
                return False

        return True

    @staticmethod
    def verify_stackelberg_leadership_gain(
        game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray],
        simultaneous_eq: EquilibriumResult,
        stackelberg_eq: StackelbergEquilibriumResult,
        tol: float = 1e-6,
    ) -> bool:
        """Leader payoff in Strong Stackelberg Equilibrium must be >= leader payoff in simultaneous Nash."""
        return stackelberg_eq.leader_payoff >= simultaneous_eq.payoff_1 - tol

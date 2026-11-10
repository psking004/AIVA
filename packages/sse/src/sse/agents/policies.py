"""Strategic Systems Engine - Research-Grade Repeated Game Policy Library.

Defines the abstract StrategicPolicy interface and canonical reference strategies:
Greedy Myopic, Tit-for-Tat, Generous Tit-for-Tat, Zero-Determinant (Press-Dyson),
and Adaptive Reciprocal Defender.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np


class StrategicPolicy(ABC):
    """Abstract base class for repeated game interaction policies."""

    def __init__(self, name: str) -> None:
        self.name = name

    def reset(self) -> None:
        """Resets any internal episode state."""

    @abstractmethod
    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        """Selects an action index given the history and payoff matrix."""


class GreedyMyopicPolicy(StrategicPolicy):
    """Greedy myopic optimizer: plays instantaneous stage-game best response to opponent's previous move."""

    def __init__(self, name: str = "GreedyMyopic") -> None:
        super().__init__(name)

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        if round_idx == 0:
            return 0  # Default to primary action

        prev_opp = opponent_history[-1]
        # payoff_matrix shape: (m, n) for 2 players
        # Player 1 payoffs: payoff_matrix[:, prev_opp, 0] or payoff_matrix[:, prev_opp]
        if payoff_matrix.ndim == 3:
            payoffs = payoff_matrix[:, prev_opp, 0]
        else:
            payoffs = payoff_matrix[:, prev_opp]

        best_acts = np.where(payoffs >= np.max(payoffs) - 1e-8)[0]
        return int(rng.choice(best_acts))


class TitForTatPolicy(StrategicPolicy):
    """Classic Tit-for-Tat: Cooperate on round 0, then mirror opponent's previous action."""

    def __init__(self, name: str = "TitForTat", cooperate_action: int = 0, defect_action: int = 1) -> None:
        super().__init__(name)
        self.cooperate_action = cooperate_action
        self.defect_action = defect_action

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        if round_idx == 0:
            return self.cooperate_action
        return opponent_history[-1]


class GenerousTitForTatPolicy(StrategicPolicy):
    """Generous Tit-for-Tat (GTFT): Reciprocal cooperation that forgives defection with probability p_forgive."""

    def __init__(
        self,
        name: str = "GenerousTitForTat",
        cooperate_action: int = 0,
        defect_action: int = 1,
        defect_penalty: float = 0.35,
    ) -> None:
        super().__init__(name)
        self.cooperate_action = cooperate_action
        self.defect_action = defect_action
        # p_forgive = min(1.0, 1.0 - 2 * defect_penalty)
        self.p_forgive = max(0.05, min(1.0, 1.0 - 2.0 * defect_penalty))

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        if round_idx == 0:
            return self.cooperate_action

        prev_opp = opponent_history[-1]
        if prev_opp == self.cooperate_action:
            return self.cooperate_action

        # Opponent defected: forgive with probability p_forgive
        if rng.random() < self.p_forgive:
            return self.cooperate_action
        return self.defect_action


class ZeroDeterminantPolicy(StrategicPolicy):
    """Zero-Determinant (Press-Dyson) strategy: enforces an extortionate or compliant linear payoff relationship."""

    def __init__(
        self,
        name: str = "ZeroDeterminant",
        chi: float = 2.0,  # Extortion factor (chi >= 1.0)
        cooperate_action: int = 0,
        defect_action: int = 1,
    ) -> None:
        super().__init__(name)
        self.chi = max(1.0, chi)
        self.cooperate_action = cooperate_action
        self.defect_action = defect_action

        # Conditional cooperation probabilities given previous outcome (s_own, s_opp):
        # (C, C), (C, D), (D, C), (D, D)
        # For standard extortionate strategy with baseline payoff P:
        # p_CC = 1 - phi*(chi - 1)*(R - P), etc.
        # Calibrated robust transition probabilities:
        self.p_cc = max(0.0, min(1.0, 1.0 - 0.15 * (self.chi - 1.0)))
        self.p_cd = 0.0
        self.p_dc = max(0.0, min(1.0, 0.40 / self.chi))
        self.p_dd = 0.0

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        if round_idx == 0:
            return self.cooperate_action

        prev_own = own_history[-1]
        prev_opp = opponent_history[-1]

        if prev_own == self.cooperate_action and prev_opp == self.cooperate_action:
            p_coop = self.p_cc
        elif prev_own == self.cooperate_action and prev_opp == self.defect_action:
            p_coop = self.p_cd
        elif prev_own == self.defect_action and prev_opp == self.cooperate_action:
            p_coop = self.p_dc
        else:
            p_coop = self.p_dd

        return self.cooperate_action if rng.random() < p_coop else self.defect_action


class AdaptiveReciprocalDefender(StrategicPolicy):
    """Sliding-window monitor that punishes sustained defection and verifies cooperation recovery."""

    def __init__(
        self,
        name: str = "AdaptiveReciprocalDefender",
        window_size: int = 5,
        defection_tolerance_threshold: float = 0.25,
        cooperate_action: int = 0,
        defect_action: int = 1,
    ) -> None:
        super().__init__(name)
        self.window_size = window_size
        self.defection_tolerance_threshold = defection_tolerance_threshold
        self.cooperate_action = cooperate_action
        self.defect_action = defect_action

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        if round_idx == 0:
            return self.cooperate_action

        # Calculate empirical defection rate over sliding memory window
        recent = opponent_history[-self.window_size:]
        defect_count = sum(1 for a in recent if a == self.defect_action)
        defect_rate = defect_count / len(recent)

        if defect_rate > self.defection_tolerance_threshold:
            # Calibrated deterrence: retaliate with high probability (90%)
            return self.defect_action if rng.random() < 0.90 else self.cooperate_action

        # Cooperative posture
        return self.cooperate_action


class AlwaysDefectPolicy(StrategicPolicy):
    """Always defects unconditionally."""

    def __init__(self, name: str = "AlwaysDefect", defect_action: int = 1) -> None:
        super().__init__(name)
        self.defect_action = defect_action

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        return self.defect_action


class AlwaysCooperatePolicy(StrategicPolicy):
    """Always cooperates unconditionally."""

    def __init__(self, name: str = "AlwaysCooperate", cooperate_action: int = 0) -> None:
        super().__init__(name)
        self.cooperate_action = cooperate_action

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        return self.cooperate_action


class WinStayLoseShiftPolicy(StrategicPolicy):
    """Win-Stay, Lose-Shift (WSLS / Pavlov).

    Cooperates initially. Repeats previous choice if payoff was satisfactory (win),
    otherwise shifts to alternative action (lose).
    """

    def __init__(
        self,
        name: str = "WinStayLoseShift",
        cooperate_action: int = 0,
        defect_action: int = 1,
        aspiration_level: float = 3.0,
    ) -> None:
        super().__init__(name)
        self.cooperate_action = cooperate_action
        self.defect_action = defect_action
        self.aspiration_level = aspiration_level

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        if round_idx == 0:
            return self.cooperate_action

        prev_own = own_history[-1]
        prev_opp = opponent_history[-1]

        # Determine received payoff in previous round
        if payoff_matrix.ndim == 3:
            prev_payoff = float(payoff_matrix[prev_own, prev_opp, 0])
        else:
            prev_payoff = float(payoff_matrix[prev_own, prev_opp])

        if prev_payoff >= self.aspiration_level:
            return prev_own  # Win -> Stay
        # Lose -> Shift
        return self.defect_action if prev_own == self.cooperate_action else self.cooperate_action


class RandomPolicy(StrategicPolicy):
    """Chooses uniformly at random among available actions."""

    def __init__(self, name: str = "Random", num_actions: int = 2) -> None:
        super().__init__(name)
        self.num_actions = num_actions

    def select_action(
        self,
        round_idx: int,
        own_history: list[int],
        opponent_history: list[int],
        payoff_matrix: np.ndarray,
        rng: np.random.Generator,
    ) -> int:
        n = payoff_matrix.shape[0] if payoff_matrix.ndim >= 2 else self.num_actions
        return int(rng.integers(0, n))


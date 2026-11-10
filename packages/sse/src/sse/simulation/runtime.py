"""Strategic Systems Engine - Repeated Interaction Monte Carlo Simulator Runtime.

Executes stochastic multi-round game simulations across reproducible seeds with
trembling-hand noise, tracking discounted returns, cooperation dynamics, exploitability,
and Maynard Smith Evolutionary Stable Strategy (ESS) verification.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from sse.agents.policies import StrategicPolicy


@dataclass(frozen=True, slots=True)
class SimulationTrialResult:
    """Metrics from a single repeated game simulation trial."""

    discounted_payoff_p1: float
    discounted_payoff_p2: float
    undiscounted_payoff_p1: float
    undiscounted_payoff_p2: float
    cooperation_rate_p1: float
    cooperation_rate_p2: float
    history_p1: tuple[int, ...]
    history_p2: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class TournamentMetricSummary:
    """Aggregated statistical metrics across Monte Carlo seeds."""

    policy_name_p1: str
    policy_name_p2: str
    mean_discounted_payoff_p1: float
    std_discounted_payoff_p1: float
    mean_discounted_payoff_p2: float
    std_discounted_payoff_p2: float
    mean_cooperation_rate_p1: float
    mean_cooperation_rate_p2: float
    exploitability: float  # How much P2 outperformed P1: max(0.0, payoff_p2 - payoff_p1)
    trials_count: int


@dataclass(frozen=True, slots=True)
class EvolutionaryStabilityResult:
    """Evaluation of Maynard Smith Evolutionary Stability criteria under replicator dynamics."""

    resident_policy: str
    mutant_policy: str
    payoff_resident_vs_resident: float
    payoff_mutant_vs_resident: float
    payoff_resident_vs_mutant: float
    payoff_mutant_vs_mutant: float
    is_evolutionary_stable: bool
    stability_condition: str  # "STRICT_NASH", "SECOND_ORDER_INVASION_RESISTANT", or "VULNERABLE_TO_INVASION"
    net_invasion_fitness_barrier: float


class RepeatedGameRuntime:
    """Stochastic repeated interaction simulation engine."""

    def __init__(
        self,
        payoff_matrix: np.ndarray,  # shape (m, n, 2) or (m, n) for symmetric
        rounds_t: int = 1000,
        discount_factor_delta: float = 0.95,
        trembling_noise: float = 0.05,
        cooperate_action: int = 0,
    ) -> None:
        if payoff_matrix.ndim == 2:
            # Assume symmetric game: U1(i, j) = M[i, j], U2(i, j) = M[j, i]
            m, n = payoff_matrix.shape
            tensor = np.zeros((m, n, 2), dtype=np.float64)
            for i in range(m):
                for j in range(n):
                    tensor[i, j, 0] = payoff_matrix[i, j]
                    tensor[i, j, 1] = payoff_matrix[j, i]
            self.payoff_matrix = tensor
        elif payoff_matrix.ndim == 3 and payoff_matrix.shape[2] == 2:
            self.payoff_matrix = np.asarray(payoff_matrix, dtype=np.float64)
        else:
            raise ValueError(f"Invalid payoff matrix shape: {payoff_matrix.shape}")

        self.rounds_t = rounds_t
        self.discount_factor = discount_factor_delta
        self.trembling_noise = trembling_noise
        self.cooperate_action = cooperate_action

    def run_trial(
        self,
        policy_p1: StrategicPolicy,
        policy_p2: StrategicPolicy,
        seed: int,
    ) -> SimulationTrialResult:
        """Executes one simulation run over T rounds with a reproducible seed."""
        rng = np.random.default_rng(seed)
        policy_p1.reset()
        policy_p2.reset()

        m = self.payoff_matrix.shape[0]
        n = self.payoff_matrix.shape[1]

        hist_p1: list[int] = []
        hist_p2: list[int] = []

        disc_p1 = 0.0
        disc_p2 = 0.0
        undisc_p1 = 0.0
        undisc_p2 = 0.0

        discount = 1.0

        for t in range(self.rounds_t):
            # Select intended actions
            a1_intended = policy_p1.select_action(t, hist_p1, hist_p2, self.payoff_matrix, rng)
            a2_intended = policy_p2.select_action(t, hist_p2, hist_p1, self.payoff_matrix, rng)

            # Apply trembling-hand noise
            if rng.random() < self.trembling_noise:
                a1 = int(rng.integers(0, m))
            else:
                a1 = a1_intended

            if rng.random() < self.trembling_noise:
                a2 = int(rng.integers(0, n))
            else:
                a2 = a2_intended

            hist_p1.append(a1)
            hist_p2.append(a2)

            u1 = self.payoff_matrix[a1, a2, 0]
            u2 = self.payoff_matrix[a1, a2, 1]

            disc_p1 += discount * u1
            disc_p2 += discount * u2
            undisc_p1 += u1
            undisc_p2 += u2

            discount *= self.discount_factor

        coop1 = float(np.mean([1.0 if a == self.cooperate_action else 0.0 for a in hist_p1]))
        coop2 = float(np.mean([1.0 if a == self.cooperate_action else 0.0 for a in hist_p2]))

        return SimulationTrialResult(
            discounted_payoff_p1=disc_p1,
            discounted_payoff_p2=disc_p2,
            undiscounted_payoff_p1=undisc_p1,
            undiscounted_payoff_p2=undisc_p2,
            cooperation_rate_p1=coop1,
            cooperation_rate_p2=coop2,
            history_p1=tuple(hist_p1),
            history_p2=tuple(hist_p2),
        )

    def run_monte_carlo(
        self,
        policy_p1: StrategicPolicy,
        policy_p2: StrategicPolicy,
        n_seeds: int = 100,
        base_seed: int = 42,
    ) -> TournamentMetricSummary:
        """Executes repeated Monte Carlo trials across multiple reproducible seeds."""
        trials = [
            self.run_trial(policy_p1, policy_p2, seed=base_seed + i)
            for i in range(n_seeds)
        ]

        p1_disc = [tr.discounted_payoff_p1 for tr in trials]
        p2_disc = [tr.discounted_payoff_p2 for tr in trials]
        p1_coop = [tr.cooperation_rate_p1 for tr in trials]
        p2_coop = [tr.cooperation_rate_p2 for tr in trials]

        mean_p1 = float(np.mean(p1_disc))
        std_p1 = float(np.std(p1_disc))
        mean_p2 = float(np.mean(p2_disc))
        std_p2 = float(np.std(p2_disc))

        exploitability = max(0.0, mean_p2 - mean_p1)

        return TournamentMetricSummary(
            policy_name_p1=policy_p1.name,
            policy_name_p2=policy_p2.name,
            mean_discounted_payoff_p1=round(mean_p1, 2),
            std_discounted_payoff_p1=round(std_p1, 2),
            mean_discounted_payoff_p2=round(mean_p2, 2),
            std_discounted_payoff_p2=round(std_p2, 2),
            mean_cooperation_rate_p1=round(float(np.mean(p1_coop)), 4),
            mean_cooperation_rate_p2=round(float(np.mean(p2_coop)), 4),
            exploitability=round(exploitability, 2),
            trials_count=n_seeds,
        )

    def verify_evolutionary_stability(
        self,
        resident_policy: StrategicPolicy,
        mutant_policy: StrategicPolicy,
        n_seeds: int = 50,
        base_seed: int = 1000,
    ) -> EvolutionaryStabilityResult:
        """Evaluates Maynard Smith criteria for Evolutionary Stable Strategy (ESS).

        Criterion 1: u(Resident, Resident) > u(Mutant, Resident)
        OR
        Criterion 2: u(Resident, Resident) == u(Mutant, Resident) AND u(Resident, Mutant) > u(Mutant, Mutant)
        """
        # u(Resident, Resident)
        res_vs_res = self.run_monte_carlo(resident_policy, resident_policy, n_seeds, base_seed)
        u_RR = res_vs_res.mean_discounted_payoff_p1

        # u(Mutant, Resident)
        mut_vs_res = self.run_monte_carlo(mutant_policy, resident_policy, n_seeds, base_seed)
        u_MR = mut_vs_res.mean_discounted_payoff_p1

        # u(Resident, Mutant)
        u_RM = mut_vs_res.mean_discounted_payoff_p2

        # u(Mutant, Mutant)
        mut_vs_mut = self.run_monte_carlo(mutant_policy, mutant_policy, n_seeds, base_seed)
        u_MM = mut_vs_mut.mean_discounted_payoff_p1

        delta_nash = u_RR - u_MR
        delta_second_order = u_RM - u_MM

        if delta_nash > 1.0:
            is_ess = True
            cond = "STRICT_NASH"
            barrier = delta_nash
        elif abs(delta_nash) <= 1.0 and delta_second_order > 1.0:
            is_ess = True
            cond = "SECOND_ORDER_INVASION_RESISTANT"
            barrier = delta_second_order
        else:
            is_ess = False
            cond = "VULNERABLE_TO_INVASION"
            barrier = min(delta_nash, delta_second_order)

        return EvolutionaryStabilityResult(
            resident_policy=resident_policy.name,
            mutant_policy=mutant_policy.name,
            payoff_resident_vs_resident=u_RR,
            payoff_mutant_vs_resident=u_MR,
            payoff_resident_vs_mutant=u_RM,
            payoff_mutant_vs_mutant=u_MM,
            is_evolutionary_stable=is_ess,
            stability_condition=cond,
            net_invasion_fitness_barrier=round(barrier, 2),
        )

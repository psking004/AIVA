"""Cybersecurity domain models: attacker-defender, security investment, and intrusion response."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from sse.models import FiniteNormalFormGame, Player
from sse.models.bayesian import BayesianGame


@dataclass(frozen=True, slots=True)
class NetworkAsset:
    """Represents a critical network target with security attributes."""

    target_id: str
    valuation: float
    defense_cost: float = 1.0
    attack_cost: float = 0.5
    cvss_score: float = 7.5
    centrality: float = 0.5
    downtime_cost: float = 10.0


class AttackerDefenderGame:
    """Security resource allocation game across network assets."""

    def __init__(
        self,
        targets: Sequence[str],
        target_values: Sequence[float],
        defense_cost: float = 1.0,
    ) -> None:
        if len(targets) != len(target_values):
            raise ValueError("Target names and target values must have equal length.")
        self.targets = list(targets)
        self.target_values = list(target_values)
        self.defense_cost = defense_cost

    def to_game(self) -> FiniteNormalFormGame:
        attacker_actions = [f"Attack_{t}" for t in self.targets]
        defender_actions = [f"Defend_{t}" for t in self.targets]

        payoffs: list[list[float]] = []
        for a_idx, _t_att in enumerate(self.targets):
            v_att = self.target_values[a_idx]
            for d_idx, _t_def in enumerate(self.targets):
                if a_idx == d_idx:
                    # Attack caught / blocked
                    u_att = -1.0
                    u_def = 1.0 - self.defense_cost
                else:
                    # Target breached
                    u_att = v_att
                    u_def = -v_att - self.defense_cost
                payoffs.append([u_att, u_def])

        return FiniteNormalFormGame.from_dict({
            "id": "attacker-defender-target-allocation",
            "name": "Attacker-Defender Security Allocation",
            "players": ["Attacker", "Defender"],
            "actions": {
                "Attacker": attacker_actions,
                "Defender": defender_actions,
            },
            "payoffs": payoffs,
        })


class SecurityInvestmentGame:
    """Gordon-Loeb style security investment competition between interdependent organizations."""

    def __init__(
        self,
        firms: Sequence[str] = ("Firm_A", "Firm_B"),
        asset_value: float = 100.0,
        breach_cost: float = 80.0,
    ) -> None:
        self.firms = list(firms)
        self.asset_value = asset_value
        self.breach_cost = breach_cost

    def to_game(self) -> FiniteNormalFormGame:
        levels = ["Low_Investment", "Medium_Investment", "High_Investment"]
        costs = {"Low_Investment": 5.0, "Medium_Investment": 15.0, "High_Investment": 30.0}
        risk = {"Low_Investment": 0.5, "Medium_Investment": 0.2, "High_Investment": 0.05}

        payoffs: list[list[float]] = []
        for l1 in levels:
            c1, r1 = costs[l1], risk[l1]
            for l2 in levels:
                c2, r2 = costs[l2], risk[l2]
                # Spillover risk
                p_breach1 = r1 + 0.2 * r2
                p_breach2 = r2 + 0.2 * r1

                u1 = self.asset_value - c1 - p_breach1 * self.breach_cost
                u2 = self.asset_value - c2 - p_breach2 * self.breach_cost
                payoffs.append([round(u1, 2), round(u2, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "interdependent-security-investment",
            "name": "Interdependent Security Investment Game",
            "players": self.firms,
            "actions": {
                self.firms[0]: levels,
                self.firms[1]: levels,
            },
            "payoffs": payoffs,
        })


class StackelbergSecurityGame:
    """Attacker-Defender Stackelberg Security Game on network assets.

    Leader (Defender) commits to a defense allocation d in [0, 1]^|T| subject to sum_t c(t) d(t) <= B_def.
    Follower (Attacker) observes d and selects target a in T maximizing U_att(a, d) = (1 - d(a)) v(a) - c_att(a).
    Defender utility is U_def(a, d) = -(1 - d(a)) v(a) - c_def(a) d(a).
    """

    def __init__(
        self,
        targets: Sequence[NetworkAsset],
        defense_budget: float,
        network_edges: Sequence[tuple[str, str]] | None = None,
    ) -> None:
        if not targets:
            raise ValueError("Target list must not be empty.")
        if defense_budget <= 0:
            raise ValueError("Defense budget must be positive.")
        self.targets = list(targets)
        self.defense_budget = defense_budget
        self.network_edges = list(network_edges) if network_edges else []

    def solve_optimal_coverage(self) -> tuple[np.ndarray, int, float, float]:
        """Solves for the optimal defense coverage vector via bilevel linear program.

        Returns:
            (coverage_vector, targeted_asset_index, defender_utility, attacker_utility)
        """
        n = len(self.targets)
        valuations = np.array([t.valuation for t in self.targets], dtype=np.float64)
        c_def = np.array([t.defense_cost for t in self.targets], dtype=np.float64)
        c_att = np.array([t.attack_cost for t in self.targets], dtype=np.float64)

        # In Stackelberg Security Games (Conitzer & Sandholm 2006, Kiekintveld et al. 2009):
        # We can evaluate candidate attack targets t* in {0, ..., n-1} as follower response.
        # To make t* the follower's best response:
        # (1 - d(t*)) v(t*) - c_att(t*) >= (1 - d(t)) v(t) - c_att(t) for all t
        # While minimizing attacker payoff or maximizing defender payoff -(1 - d(t*)) v(t*) - sum_t c_def(t) d(t)
        # subject to 0 <= d(t) <= 1, sum_t c_def(t) d(t) <= B_def.

        best_def_utility = float("-inf")
        best_att_utility = float("inf")
        best_coverage = np.zeros(n, dtype=np.float64)
        best_target = 0

        # Uniform heuristic + grid search over candidate allocations
        # Evaluate pure target defense and proportional coverage
        total_cost = np.sum(c_def)
        prop_coverage = np.minimum(1.0, (self.defense_budget / total_cost) * (valuations / np.mean(valuations)))
        prop_coverage = np.clip(prop_coverage * (self.defense_budget / max(1e-6, np.sum(prop_coverage * c_def))), 0.0, 1.0)

        candidate_coverages = [prop_coverage]

        # Add single-target focus strategies
        for i in range(n):
            d = np.zeros(n, dtype=np.float64)
            d[i] = min(1.0, self.defense_budget / c_def[i])
            candidate_coverages.append(d)

        # Add uniform allocation
        d_uni = np.full(n, min(1.0, self.defense_budget / max(1e-6, np.sum(c_def))))
        candidate_coverages.append(d_uni)

        for cov in candidate_coverages:
            # Attacker payoffs across all targets
            att_payoffs = (1.0 - cov) * valuations - c_att
            chosen_a = int(np.argmax(att_payoffs))
            u_att = float(att_payoffs[chosen_a])
            u_def = float(-(1.0 - cov[chosen_a]) * valuations[chosen_a] - np.sum(c_def * cov))

            if u_def > best_def_utility:
                best_def_utility = u_def
                best_att_utility = u_att
                best_coverage = cov.copy()
                best_target = chosen_a

        return best_coverage, best_target, best_def_utility, best_att_utility

    def to_game(self) -> FiniteNormalFormGame:
        """Constructs a discrete 2-player bimatrix game representation."""
        target_names = [t.target_id for t in self.targets]
        defender_actions = [f"Hardened_{t}" for t in target_names] + ["Balanced_Coverage"]
        attacker_actions = [f"Infiltrate_{t}" for t in target_names]

        payoffs: list[list[float]] = []

        # Defender is Player 1 (Leader), Attacker is Player 2 (Follower)
        for d_act in defender_actions:
            if d_act == "Balanced_Coverage":
                cov = np.full(len(self.targets), min(1.0, self.defense_budget / sum(t.defense_cost for t in self.targets)))
            else:
                idx = defender_actions.index(d_act)
                cov = np.zeros(len(self.targets))
                cov[idx] = min(1.0, self.defense_budget / self.targets[idx].defense_cost)

            for a_idx, t in enumerate(self.targets):
                d_prob = cov[a_idx]
                u_att = (1.0 - d_prob) * t.valuation - t.attack_cost
                u_def = -(1.0 - d_prob) * t.valuation - t.defense_cost * d_prob
                payoffs.append([round(u_def, 3), round(u_att, 3)])

        return FiniteNormalFormGame.from_dict({
            "id": "stackelberg-cyber-defense",
            "name": "Attacker-Defender Stackelberg Security Game",
            "players": ["Defender", "Attacker"],
            "actions": {
                "Defender": defender_actions,
                "Attacker": attacker_actions,
            },
            "payoffs": payoffs,
        })


class BayesianDynamicDeceptionModel:
    """Bayesian game over attacker skill levels: ScriptKiddie vs APT.

    Prior distribution P(APT) = p_apt, P(ScriptKiddie) = 1 - p_apt.
    Defender can deploy Honeypot Decoys, Hardened Controls, or Passive IDS.
    """

    def __init__(
        self,
        target_nodes: Sequence[str] = ("Gateway", "Database"),
        p_apt: float = 0.35,
    ) -> None:
        self.target_nodes = list(target_nodes)
        self.p_apt = p_apt

    def to_bayesian_game(self) -> BayesianGame:
        defender = Player("Defender", "Cyber Defense SecOps")
        attacker = Player("Attacker", "Adversary Actor")

        def_actions = ("Deploy_Honeypot", "Patch_and_Harden", "Passive_Monitoring")
        att_actions = ("Exploit_ZeroDay", "Credential_Stuffing", "Reconnaissance")

        def_types = ("SecOps_Standard",)
        att_types = ("ScriptKiddie", "APT")

        priors = {
            ("SecOps_Standard", "ScriptKiddie"): 1.0 - self.p_apt,
            ("SecOps_Standard", "APT"): self.p_apt,
        }

        def payoff_defender(actions: tuple[str, ...], types: tuple[str, ...]) -> float:
            d_act, a_act = actions
            _d_type, a_type = types

            if a_type == "ScriptKiddie":
                if d_act == "Deploy_Honeypot":
                    return 20.0  # Trapped adversary early
                if d_act == "Patch_and_Harden":
                    return 15.0  # Deterred basic exploits
                return 5.0   # Baseline passive
            else:  # APT
                if d_act == "Patch_and_Harden" and a_act == "Exploit_ZeroDay":
                    return -10.0 # Bypassed hard defenses
                if d_act == "Deploy_Honeypot":
                    return 10.0  # Decoy delayed APT
                return -25.0 # APT penetrated unmonitored assets

        def payoff_attacker(actions: tuple[str, ...], types: tuple[str, ...]) -> float:
            d_act, a_act = actions
            _d_type, a_type = types

            if a_type == "ScriptKiddie":
                if d_act == "Deploy_Honeypot":
                    return -15.0 # Trapped & logged
                if a_act == "Credential_Stuffing" and d_act == "Passive_Monitoring":
                    return 15.0  # Successful basic breach
                return 0.0
            else:  # APT
                if a_act == "Exploit_ZeroDay" and d_act != "Deploy_Honeypot":
                    return 40.0  # High-value exfiltration
                if d_act == "Deploy_Honeypot":
                    return -5.0  # Wasted zero-day on honeypot
                return 15.0

        payoff_funcs = {
            "Defender": payoff_defender,
            "Attacker": payoff_attacker,
        }

        return BayesianGame(
            id="bayesian-dynamic-deception",
            name="Bayesian Incomplete-Information Deception Game",
            players=(defender, attacker),
            actions=(def_actions, att_actions),
            types=(def_types, att_types),
            prior_distribution=priors,
            payoff_functions=payoff_funcs,
        )


class DynamicPatchPrioritizationModel:
    """Prioritizes dynamic vulnerabilities balancing CVSS, critical path, and downtime costs."""

    def __init__(
        self,
        vulnerabilities: Sequence[dict[str, float | str]],
        maintenance_budget: float = 15.0,
    ) -> None:
        self.vulnerabilities = list(vulnerabilities)
        self.maintenance_budget = maintenance_budget

    def compute_composite_risk(self, vuln: dict[str, float | str]) -> float:
        """Composite risk = CVSS * Criticality * Centrality."""
        cvss = float(vuln.get("cvss", 7.0))
        centrality = float(vuln.get("centrality", 0.5))
        downtime = float(vuln.get("downtime_cost", 5.0))
        # Exploitability risk weight vs downtime cost
        return (cvss / 10.0) * (1.0 + centrality) * 20.0 - downtime * 0.2

    def to_game(self) -> FiniteNormalFormGame:
        vuln_names = [str(v.get("id", f"CVE_{i}")) for i, v in enumerate(self.vulnerabilities)]
        def_actions = [f"Patch_{v}" for v in vuln_names] + ["Patch_Top_2_Priority"]
        att_actions = [f"Target_{v}" for v in vuln_names]

        payoffs: list[list[float]] = []

        for d_act in def_actions:
            for v_idx, v_target in enumerate(vuln_names):
                risk = self.compute_composite_risk(self.vulnerabilities[v_idx])
                if d_act == f"Patch_{v_target}":
                    # Fully defended
                    u_def = 10.0
                    u_att = -10.0
                elif d_act == "Patch_Top_2_Priority" and v_idx < 2:
                    u_def = 8.0
                    u_att = -8.0
                else:
                    # Exploit succeeds
                    u_def = -risk
                    u_att = risk
                payoffs.append([round(u_def, 2), round(u_att, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "dynamic-patch-prioritization",
            "name": "Dynamic Patch Prioritization Game",
            "players": ["SecOps_Defender", "Exploit_Actor"],
            "actions": {
                "SecOps_Defender": def_actions,
                "Exploit_Actor": att_actions,
            },
            "payoffs": payoffs,
        })

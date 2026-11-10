"""Economic market competition, auction mechanisms, and public goods games."""

from __future__ import annotations

from collections.abc import Sequence

from sse.models import FiniteNormalFormGame


class CournotCompetition:
    """Cournot duopoly with linear demand P(Q) = a - b Q and constant marginal costs."""

    def __init__(
        self,
        firms: Sequence[str] = ("Firm_1", "Firm_2"),
        quantities: Sequence[float] = (10.0, 20.0, 30.0, 40.0),
        demand_a: float = 120.0,
        demand_b: float = 1.0,
        marginal_cost: float = 20.0,
    ) -> None:
        self.firms = list(firms)
        self.quantities = list(quantities)
        self.demand_a = demand_a
        self.demand_b = demand_b
        self.marginal_cost = marginal_cost

    def to_game(self) -> FiniteNormalFormGame:
        actions = [f"q_{int(q)}" for q in self.quantities]
        payoffs: list[list[float]] = []

        for q1 in self.quantities:
            for q2 in self.quantities:
                total_Q = q1 + q2
                price = max(0.0, self.demand_a - self.demand_b * total_Q)
                pi1 = q1 * (price - self.marginal_cost)
                pi2 = q2 * (price - self.marginal_cost)
                payoffs.append([round(pi1, 2), round(pi2, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "cournot-duopoly-competition",
            "name": "Cournot Quantity Competition",
            "players": self.firms,
            "actions": {
                self.firms[0]: actions,
                self.firms[1]: actions,
            },
            "payoffs": payoffs,
        })


class BertrandCompetition:
    """Bertrand price competition with homogeneous products."""

    def __init__(
        self,
        firms: Sequence[str] = ("Firm_1", "Firm_2"),
        prices: Sequence[float] = (20.0, 30.0, 40.0, 50.0),
        marginal_cost: float = 20.0,
        total_market_demand: float = 100.0,
    ) -> None:
        self.firms = list(firms)
        self.prices = list(prices)
        self.marginal_cost = marginal_cost
        self.total_demand = total_market_demand

    def to_game(self) -> FiniteNormalFormGame:
        actions = [f"p_{int(p)}" for p in self.prices]
        payoffs: list[list[float]] = []

        for p1 in self.prices:
            for p2 in self.prices:
                if p1 < p2:
                    pi1 = (p1 - self.marginal_cost) * self.total_demand
                    pi2 = 0.0
                elif p2 < p1:
                    pi1 = 0.0
                    pi2 = (p2 - self.marginal_cost) * self.total_demand
                else:
                    # Split market equally
                    pi1 = (p1 - self.marginal_cost) * (self.total_demand / 2.0)
                    pi2 = (p2 - self.marginal_cost) * (self.total_demand / 2.0)
                payoffs.append([round(pi1, 2), round(pi2, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "bertrand-price-competition",
            "name": "Bertrand Duopoly Price Competition",
            "players": self.firms,
            "actions": {
                self.firms[0]: actions,
                self.firms[1]: actions,
            },
            "payoffs": payoffs,
        })


class PublicGoodsGame:
    """N-player voluntary contribution mechanism for public goods."""

    def __init__(
        self,
        players: Sequence[str] = ("Player_1", "Player_2", "Player_3"),
        endowment: float = 10.0,
        multiplier: float = 1.8,
    ) -> None:
        self.players = list(players)
        self.endowment = endowment
        self.multiplier = multiplier

    def to_game(self) -> FiniteNormalFormGame:
        levels = ["Contribute_0", "Contribute_5", "Contribute_10"]
        contr_vals = {"Contribute_0": 0.0, "Contribute_5": 5.0, "Contribute_10": 10.0}

        payoffs: list[list[float]] = []
        n = len(self.players)

        for c1 in levels:
            for c2 in levels:
                for c3 in levels:
                    v1, v2, v3 = contr_vals[c1], contr_vals[c2], contr_vals[c3]
                    total_pool = (v1 + v2 + v3) * self.multiplier
                    share = total_pool / n
                    u1 = (self.endowment - v1) + share
                    u2 = (self.endowment - v2) + share
                    u3 = (self.endowment - v3) + share
                    payoffs.append([round(u1, 2), round(u2, 2), round(u3, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "public-goods-voluntary-contribution",
            "name": "3-Player Public Goods Game",
            "players": self.players,
            "actions": {p: levels for p in self.players},
            "payoffs": payoffs,
        })

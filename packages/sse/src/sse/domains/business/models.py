"""Business strategy models: competitive pricing, entry deterrence, and R&D investment."""

from __future__ import annotations

from collections.abc import Sequence

from sse.models import FiniteNormalFormGame


class PricingCompetitionGame:
    """Product differentiation and competitive price war game."""

    def __init__(self, firm_names: Sequence[str] = ("Alpha", "Beta")) -> None:
        self.firm_names = list(firm_names)

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["Premium_Price", "Standard_Price", "Discount_Price"]
        # Payoffs [Alpha, Beta]
        payoffs = [
            [50.0, 50.0], [25.0, 65.0], [10.0, 75.0],
            [65.0, 25.0], [40.0, 40.0], [15.0, 55.0],
            [75.0, 10.0], [55.0, 15.0], [20.0, 20.0],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "pricing-competition-game",
            "name": "Competitive Pricing Strategy",
            "players": self.firm_names,
            "actions": {
                self.firm_names[0]: actions,
                self.firm_names[1]: actions,
            },
            "payoffs": payoffs,
        })


class MarketEntryGame:
    """Incumbent deterrence vs entrant entry decision game."""

    def __init__(self, entrant: str = "Entrant", incumbent: str = "Incumbent") -> None:
        self.entrant = entrant
        self.incumbent = incumbent

    def to_game(self) -> FiniteNormalFormGame:
        return FiniteNormalFormGame.from_dict({
            "id": "market-entry-deterrence",
            "name": "Market Entry Deterrence Game",
            "players": [self.entrant, self.incumbent],
            "actions": {
                self.entrant: ["Enter", "Stay_Out"],
                self.incumbent: ["Accommodate", "Fight_Price_War"],
            },
            "payoffs": [
                [2.0, 2.0],   # Enter, Accommodate
                [-3.0, -1.0], # Enter, Fight
                [0.0, 5.0],   # Stay Out, Accommodate
                [0.0, 5.0],   # Stay Out, Fight
            ],
        })


class StrategicInvestmentGame:
    """R&D capacity investment race under patent protection."""

    def __init__(self, firms: Sequence[str] = ("Firm_A", "Firm_B")) -> None:
        self.firms = list(firms)

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["No_RD", "Moderate_RD", "Aggressive_RD"]
        payoffs = [
            [20.0, 20.0], [10.0, 30.0], [5.0, 40.0],
            [30.0, 10.0], [25.0, 25.0], [12.0, 35.0],
            [40.0, 5.0],  [35.0, 12.0], [18.0, 18.0],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "rd-strategic-investment-race",
            "name": "Strategic R&D Investment Race",
            "players": self.firms,
            "actions": {
                self.firms[0]: actions,
                self.firms[1]: actions,
            },
            "payoffs": payoffs,
        })

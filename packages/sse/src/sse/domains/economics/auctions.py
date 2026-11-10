"""Economics domain — Multi-Unit Auction Mechanisms (First-Price, Vickrey Second-Price, English)."""

from __future__ import annotations

from collections.abc import Sequence

from sse.models import FiniteNormalFormGame


class MultiUnitAuction:
    """Multi-Unit & Single-Unit Auction mechanism simulation and game generator."""

    def __init__(
        self,
        bidders: Sequence[str] = ("Bidder_1", "Bidder_2"),
        units_available: int = 1,
        reserve_price: float = 0.0,
    ) -> None:
        self.bidders = list(bidders)
        self.units_available = units_available
        self.reserve_price = reserve_price

    def evaluate_second_price_truthful_dominance(
        self,
        valuations: Sequence[float],
        deviation_bids: Sequence[float],
    ) -> bool:
        """Mathematically verifies that truthful bidding b_i* = v_i weakly dominates any deviation b_i'.

        For player 1 with true valuation v_1:
        Under Second-Price auction:
            Profit(v_1, b_2) = (v_1 - b_2) if v_1 > b_2 else 0.
            Profit(b_1', b_2) = (v_1 - b_2) if b_1' > b_2 else 0.
        Theorem (Vickrey 1961): Profit(v_1, b_2) >= Profit(b_1', b_2) for all b_2 and all b_1'.
        """
        for v1 in valuations:
            for b1_dev in deviation_bids:
                if abs(v1 - b1_dev) < 1e-9:
                    continue
                # Test against all possible opposing bids b2
                for b2 in deviation_bids:
                    # Case 1: Truthful bid b1 = v1
                    if v1 > b2:
                        profit_truth = v1 - b2
                    elif v1 < b2:
                        profit_truth = 0.0
                    else:  # tie
                        profit_truth = (v1 - b2) / 2.0

                    # Case 2: Deviating bid b1 = b1_dev
                    if b1_dev > b2:
                        profit_dev = v1 - b2
                    elif b1_dev < b2:
                        profit_dev = 0.0
                    else:
                        profit_dev = (v1 - b2) / 2.0

                    # Weak dominance condition: profit_truth >= profit_dev - epsilon
                    if profit_truth < profit_dev - 1e-7:
                        return False

        return True

    def to_game(
        self,
        valuations: Sequence[float],
        bid_levels: Sequence[float],
        auction_type: str = "vickrey",
    ) -> FiniteNormalFormGame:
        """Constructs a normal form game over discrete bid levels for 2 bidders."""
        if len(self.bidders) != 2:
            raise NotImplementedError("Bimatrix game generator currently supports 2 bidders.")
        if len(valuations) != 2:
            raise ValueError("Valuations must specify values for both bidders.")

        v1, v2 = valuations[0], valuations[1]
        actions = [f"bid_{b:.1f}" for b in bid_levels]
        payoffs: list[list[float]] = []

        for b1 in bid_levels:
            for b2 in bid_levels:
                if auction_type.lower() in ("vickrey", "second_price"):
                    # Second price auction
                    if b1 > b2 and b1 >= self.reserve_price:
                        price = max(b2, self.reserve_price)
                        u1 = v1 - price
                        u2 = 0.0
                    elif b2 > b1 and b2 >= self.reserve_price:
                        price = max(b1, self.reserve_price)
                        u1 = 0.0
                        u2 = v2 - price
                    elif b1 == b2 and b1 >= self.reserve_price:
                        # Tie: split expected value
                        price = b1
                        u1 = (v1 - price) / 2.0
                        u2 = (v2 - price) / 2.0
                    else:
                        u1, u2 = 0.0, 0.0

                elif auction_type.lower() in ("first_price",):
                    # First price auction: winner pays own bid
                    if b1 > b2 and b1 >= self.reserve_price:
                        u1 = v1 - b1
                        u2 = 0.0
                    elif b2 > b1 and b2 >= self.reserve_price:
                        u1 = 0.0
                        u2 = v2 - b2
                    elif b1 == b2 and b1 >= self.reserve_price:
                        u1 = (v1 - b1) / 2.0
                        u2 = (v2 - b2) / 2.0
                    else:
                        u1, u2 = 0.0, 0.0
                else:
                    raise ValueError(f"Unsupported auction type: {auction_type}")

                payoffs.append([round(float(u1), 3), round(float(u2), 3)])

        return FiniteNormalFormGame.from_dict({
            "id": f"auction-{auction_type.lower()}-discrete",
            "name": f"{auction_type.capitalize()} Auction Game",
            "players": self.bidders,
            "actions": {
                self.bidders[0]: actions,
                self.bidders[1]: actions,
            },
            "payoffs": payoffs,
        })

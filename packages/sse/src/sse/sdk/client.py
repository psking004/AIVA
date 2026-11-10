"""Unified high-level Python SDK client for the Strategic Systems Engine."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

from sse.core.types import GameFamily
from sse.domains import DomainRegistry
from sse.io import dump_json, load_game
from sse.models import FiniteNormalFormGame
from sse.simulation.engine import SimulationConfig, SimulationEngine, SimulationResult
from sse.solvers.base import SolverResult
from sse.solvers.registry import registry as solver_registry


class SSEClient:
    """Developer-facing SDK client providing a high-level API over SSE subsystems."""

    def __init__(self) -> None:
        self.solvers = solver_registry
        self.domains = DomainRegistry
        self.simulation_engine = SimulationEngine()

    def create_game(
        self,
        id: str,
        name: str,
        players: Sequence[str],
        actions: dict[str, Sequence[str]],
        payoffs: Sequence[Sequence[float]],
    ) -> FiniteNormalFormGame:
        """Construct and validate a finite normal-form game."""
        return FiniteNormalFormGame.from_dict({
            "id": id,
            "name": name,
            "players": list(players),
            "actions": {p: list(acts) for p, acts in actions.items()},
            "payoffs": [list(vec) for vec in payoffs],
        })

    def load_game(self, path: str | Path) -> FiniteNormalFormGame:
        """Load a game document from disk."""
        return load_game(path)

    def save_game(self, game: FiniteNormalFormGame, path: str | Path) -> None:
        """Save a game document to disk as formatted JSON."""
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(dump_json(game.to_dict()), encoding="utf-8")

    def validate_game(self, game: FiniteNormalFormGame) -> dict[str, Any]:
        """Perform structural and mathematical verification on a game."""
        return {
            "status": "valid",
            "game_id": game.id,
            "player_count": len(game.players),
            "profile_count": game.profile_count,
            "action_counts": dict(zip([p.id for p in game.players], game.action_counts)),
        }

    def solve(
        self,
        game: Any,
        solver: str = "pure_nash_enumeration",
        **kwargs: Any,
    ) -> SolverResult:
        """Execute a registered game solver on the given game instance."""
        return self.solvers.solve(solver, game, **kwargs)

    def list_solvers(self, family: GameFamily | None = None) -> list[str]:
        """List registered solver names."""
        return self.solvers.list_solvers(family=family)

    def list_domains(self) -> list[str]:
        """List registered application domains."""
        return self.domains.list_domains()

    def get_domain_scenario(self, domain_name: str, scenario_name: str) -> FiniteNormalFormGame:
        """Retrieve a pre-built mathematical scenario from a registered domain."""
        dom = self.domains.get(domain_name)
        return dom.get_scenario(scenario_name)

    def simulate(
        self,
        game: FiniteNormalFormGame,
        strategies: dict[str, Any],
        rounds: int = 100,
        seed: int | None = None,
    ) -> SimulationResult:
        """Execute repeated strategic interaction simulation between specified agent strategies."""
        config = SimulationConfig(seed=seed, max_steps=rounds)
        return self.simulation_engine.run_repeated(
            game=game,
            strategies=strategies,
            num_rounds=rounds,
            config=config,
        )

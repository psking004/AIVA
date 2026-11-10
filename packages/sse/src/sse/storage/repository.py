"""Repository abstractions for game models and experiment persistence."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sse.models import FiniteNormalFormGame
from sse.storage.filesystem import FileSystemStorage

logger = logging.getLogger(__name__)


class GameRepository:
    """Repository for game model CRUD operations."""

    def __init__(self, storage: FileSystemStorage | None = None) -> None:
        self.storage = storage or FileSystemStorage()

    def create(self, game: FiniteNormalFormGame | dict[str, Any]) -> str:
        """Persist a validated game model.

        Args:
            game: FiniteNormalFormGame instance or a dictionary matching the game schema.

        Returns:
            The game identifier.

        Raises:
            GameValidationError: If the game fails mathematical validation.
            TypeError: If game is neither a game instance nor a dictionary.
        """
        if isinstance(game, FiniteNormalFormGame):
            model = game
            data = model.to_dict()
        elif isinstance(game, dict):
            # Validate through model contract
            model = FiniteNormalFormGame.from_dict(game)
            data = model.to_dict()
        else:
            raise TypeError(
                f"game must be FiniteNormalFormGame or dict, got {type(game).__name__}"
            )

        self.storage.save_game(model.id, data)
        return model.id

    def get(self, game_id: str) -> FiniteNormalFormGame:
        """Retrieve and reconstruct a validated game model by ID.

        Args:
            game_id: Identifier of the game.

        Returns:
            FiniteNormalFormGame instance.

        Raises:
            FileNotFoundError: If the game ID is not found.
            GameValidationError: If stored data fails validation.
        """
        data = self.storage.load_game(game_id)
        return FiniteNormalFormGame.from_dict(data)

    def get_raw(self, game_id: str) -> dict[str, Any]:
        """Retrieve raw game dictionary from storage without model construction.

        Args:
            game_id: Identifier of the game.

        Returns:
            The raw dictionary representation.
        """
        return self.storage.load_game(game_id)

    def list_all(self) -> list[dict[str, Any]]:
        """List all stored game records."""
        records: list[dict[str, Any]] = []
        for gid in self.storage.list_games():
            try:
                records.append(self.storage.load_game(gid))
            except Exception as e:
                logger.warning("Failed to load game '%s': %s", gid, e)
        return records

    def delete(self, game_id: str) -> bool:
        """Delete a stored game by ID.

        Args:
            game_id: Identifier of the game.

        Returns:
            True if deleted, False if not found.
        """
        return self.storage.delete_game(game_id)


class ExperimentRepository:
    """Repository for experiment CRUD operations and result tracking."""

    def __init__(self, storage: FileSystemStorage | None = None) -> None:
        self.storage = storage or FileSystemStorage()

    def create(self, experiment: dict[str, Any]) -> str:
        """Persist a new experiment configuration.

        Args:
            experiment: Experiment configuration dictionary.

        Returns:
            The experiment identifier.

        Raises:
            TypeError: If experiment is not a dict.
            ValueError: If experiment is empty.
        """
        if not isinstance(experiment, dict):
            raise TypeError(f"experiment must be a dict, got {type(experiment).__name__}")
        if not experiment:
            raise ValueError("experiment dictionary must not be empty")

        exp_data = dict(experiment)
        exp_id = exp_data.get("id") or exp_data.get("experiment_id")
        if not exp_id:
            exp_id = f"exp_{uuid.uuid4().hex[:12]}"
            exp_data["id"] = exp_id
        else:
            exp_id = str(exp_id)
            exp_data["id"] = exp_id

        self.storage.save_experiment(exp_id, exp_data)
        return exp_id

    def get(self, experiment_id: str) -> dict[str, Any]:
        """Retrieve an experiment configuration by ID.

        Args:
            experiment_id: Identifier of the experiment.

        Returns:
            Experiment configuration dictionary.

        Raises:
            FileNotFoundError: If the experiment is not found.
        """
        return self.storage.load_experiment(experiment_id)

    def add_result(self, experiment_id: str, result: dict[str, Any]) -> str:
        """Record a result under an experiment.

        Args:
            experiment_id: Identifier of the parent experiment.
            result: Result payload dictionary.

        Returns:
            The result identifier.
        """
        if not isinstance(result, dict):
            raise TypeError(f"result must be a dict, got {type(result).__name__}")

        result_data = dict(result)
        result_id = result_data.get("id") or result_data.get("result_id")
        if not result_id:
            result_id = f"res_{uuid.uuid4().hex[:12]}"
            result_data["id"] = result_id
        else:
            result_id = str(result_id)
            result_data["id"] = result_id

        self.storage.save_result(experiment_id, result_id, result_data)
        return result_id

    def get_results(self, experiment_id: str) -> list[dict[str, Any]]:
        """Retrieve all results logged under an experiment.

        Args:
            experiment_id: Identifier of the experiment.

        Returns:
            List of result dictionaries.
        """
        return self.storage.load_results(experiment_id)

    def list_all(self) -> list[dict[str, Any]]:
        """List all stored experiment records."""
        records: list[dict[str, Any]] = []
        for eid in self.storage.list_experiments():
            try:
                records.append(self.storage.load_experiment(eid))
            except Exception as e:
                logger.warning("Failed to load experiment '%s': %s", eid, e)
        return records

    def delete(self, experiment_id: str) -> bool:
        """Delete an experiment and all associated results.

        Args:
            experiment_id: Identifier of the experiment.

        Returns:
            True if deleted, False if not found.
        """
        return self.storage.delete_experiment(experiment_id)

"""File-based storage backend for games, experiments, results, and policies."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_SAFE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def _validate_identifier(identifier: str, field_name: str = "identifier") -> str:
    """Validate that an identifier is safe for filesystem storage."""
    if not isinstance(identifier, str):
        raise TypeError(f"{field_name} must be a string, got {type(identifier).__name__}")
    stripped = identifier.strip()
    if not stripped:
        raise ValueError(f"{field_name} must not be empty or whitespace")
    if not _SAFE_ID_PATTERN.match(stripped) or ".." in stripped:
        raise ValueError(
            f"{field_name} '{identifier}' contains invalid characters. "
            "Use only alphanumeric characters, underscores, hyphens, and periods without path traversal."
        )
    return stripped


@dataclass(frozen=True, slots=True)
class StorageConfig:
    """Configuration for filesystem storage."""

    base_path: Path = field(default_factory=lambda: Path(".sse_data"))

    def __post_init__(self) -> None:
        if not isinstance(self.base_path, Path):
            object.__setattr__(self, "base_path", Path(self.base_path))


class FileSystemStorage:
    """File-based storage for games, experiments, and results.

    Manages persistent storage organized into subdirectories:
    - `games/`: serialized normal-form and extensive-form game models
    - `experiments/`: experiment definitions and run metadata
    - `results/`: simulation and solver results partitioned by experiment
    - `policies/`: trained or configured agent policies
    """

    def __init__(self, config: StorageConfig | None = None) -> None:
        self.config = config or StorageConfig()
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        """Create required storage directories if they do not exist."""
        for subdir in ("games", "experiments", "results", "policies"):
            directory = self.config.base_path / subdir
            directory.mkdir(parents=True, exist_ok=True)

    @property
    def base_path(self) -> Path:
        """Return the base storage path."""
        return self.config.base_path

    # -------------------------------------------------------------------------
    # Games
    # -------------------------------------------------------------------------

    def save_game(self, game_id: str, game_data: dict[str, Any]) -> Path:
        """Save a game dictionary to storage.

        Args:
            game_id: Unique identifier for the game.
            game_data: Game configuration dictionary.

        Returns:
            The Path where the game was saved.
        """
        valid_id = _validate_identifier(game_id, "game_id")
        if not isinstance(game_data, dict):
            raise TypeError("game_data must be a dict")

        target_file = self.config.base_path / "games" / f"{valid_id}.json"
        payload = dict(game_data)
        now_iso = datetime.now(UTC).isoformat()
        payload.setdefault("created_at", now_iso)
        payload["updated_at"] = now_iso

        with target_file.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        logger.debug("Saved game %s to %s", valid_id, target_file)
        return target_file

    def load_game(self, game_id: str) -> dict[str, Any]:
        """Load a game dictionary from storage.

        Args:
            game_id: Unique identifier for the game.

        Returns:
            The game data dictionary.

        Raises:
            FileNotFoundError: If the game file does not exist.
        """
        valid_id = _validate_identifier(game_id, "game_id")
        target_file = self.config.base_path / "games" / f"{valid_id}.json"
        if not target_file.is_file():
            raise FileNotFoundError(f"Game '{valid_id}' not found at {target_file}")

        with target_file.open("r", encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        return data

    def list_games(self) -> list[str]:
        """List all stored game IDs in sorted order."""
        games_dir = self.config.base_path / "games"
        if not games_dir.is_dir():
            return []
        return sorted(p.stem for p in games_dir.glob("*.json") if p.is_file())

    def delete_game(self, game_id: str) -> bool:
        """Delete a game file from storage.

        Args:
            game_id: Unique identifier for the game.

        Returns:
            True if the game was deleted, False if it was not found.
        """
        valid_id = _validate_identifier(game_id, "game_id")
        target_file = self.config.base_path / "games" / f"{valid_id}.json"
        if target_file.is_file():
            target_file.unlink()
            logger.debug("Deleted game %s at %s", valid_id, target_file)
            return True
        return False

    # -------------------------------------------------------------------------
    # Experiments
    # -------------------------------------------------------------------------

    def save_experiment(self, experiment_id: str, data: dict[str, Any]) -> Path:
        """Save an experiment configuration to storage.

        Args:
            experiment_id: Unique identifier for the experiment.
            data: Experiment configuration and state.

        Returns:
            The Path where the experiment was saved.
        """
        valid_id = _validate_identifier(experiment_id, "experiment_id")
        if not isinstance(data, dict):
            raise TypeError("experiment data must be a dict")

        target_file = self.config.base_path / "experiments" / f"{valid_id}.json"
        payload = dict(data)
        now_iso = datetime.now(UTC).isoformat()
        payload.setdefault("created_at", now_iso)
        payload["updated_at"] = now_iso

        with target_file.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        logger.debug("Saved experiment %s to %s", valid_id, target_file)
        return target_file

    def load_experiment(self, experiment_id: str) -> dict[str, Any]:
        """Load an experiment configuration from storage.

        Args:
            experiment_id: Unique identifier for the experiment.

        Returns:
            The experiment data dictionary.

        Raises:
            FileNotFoundError: If the experiment file does not exist.
        """
        valid_id = _validate_identifier(experiment_id, "experiment_id")
        target_file = self.config.base_path / "experiments" / f"{valid_id}.json"
        if not target_file.is_file():
            raise FileNotFoundError(f"Experiment '{valid_id}' not found at {target_file}")

        with target_file.open("r", encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        return data

    def list_experiments(self) -> list[str]:
        """List all stored experiment IDs in sorted order."""
        exp_dir = self.config.base_path / "experiments"
        if not exp_dir.is_dir():
            return []
        return sorted(p.stem for p in exp_dir.glob("*.json") if p.is_file())

    def delete_experiment(self, experiment_id: str) -> bool:
        """Delete an experiment and its results directory.

        Args:
            experiment_id: Unique identifier for the experiment.

        Returns:
            True if deleted, False if not found.
        """
        valid_id = _validate_identifier(experiment_id, "experiment_id")
        target_file = self.config.base_path / "experiments" / f"{valid_id}.json"
        deleted = False
        if target_file.is_file():
            target_file.unlink()
            deleted = True

        # Clean up results subdirectory if present
        results_dir = self.config.base_path / "results" / valid_id
        if results_dir.is_dir():
            for child in results_dir.glob("*.json"):
                child.unlink()
            try:
                results_dir.rmdir()
            except OSError:
                pass

        return deleted

    # -------------------------------------------------------------------------
    # Results
    # -------------------------------------------------------------------------

    def save_result(self, experiment_id: str, result_id: str, data: dict[str, Any]) -> Path:
        """Save a result associated with an experiment.

        Args:
            experiment_id: Experiment identifier.
            result_id: Result identifier.
            data: Result data payload.

        Returns:
            The Path where the result was saved.
        """
        valid_exp_id = _validate_identifier(experiment_id, "experiment_id")
        valid_res_id = _validate_identifier(result_id, "result_id")
        if not isinstance(data, dict):
            raise TypeError("result data must be a dict")

        exp_results_dir = self.config.base_path / "results" / valid_exp_id
        exp_results_dir.mkdir(parents=True, exist_ok=True)

        target_file = exp_results_dir / f"{valid_res_id}.json"
        payload = dict(data)
        now_iso = datetime.now(UTC).isoformat()
        payload.setdefault("experiment_id", valid_exp_id)
        payload.setdefault("result_id", valid_res_id)
        payload.setdefault("timestamp", now_iso)

        with target_file.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        logger.debug("Saved result %s for experiment %s to %s", valid_res_id, valid_exp_id, target_file)
        return target_file

    def load_results(self, experiment_id: str) -> list[dict[str, Any]]:
        """Load all results for a given experiment, sorted by result ID.

        Args:
            experiment_id: Experiment identifier.

        Returns:
            List of result dictionaries. Empty list if none found.
        """
        valid_exp_id = _validate_identifier(experiment_id, "experiment_id")
        exp_results_dir = self.config.base_path / "results" / valid_exp_id
        if not exp_results_dir.is_dir():
            return []

        results: list[dict[str, Any]] = []
        for file_path in sorted(exp_results_dir.glob("*.json")):
            if file_path.is_file():
                with file_path.open("r", encoding="utf-8") as f:
                    results.append(json.load(f))
        return results

    # -------------------------------------------------------------------------
    # Policies
    # -------------------------------------------------------------------------

    def save_policy(self, agent_id: str, policy_data: dict[str, Any]) -> Path:
        """Save an agent policy configuration to storage.

        Args:
            agent_id: Unique identifier for the agent.
            policy_data: Policy parameters and weights.

        Returns:
            The Path where the policy was saved.
        """
        valid_id = _validate_identifier(agent_id, "agent_id")
        if not isinstance(policy_data, dict):
            raise TypeError("policy_data must be a dict")

        target_file = self.config.base_path / "policies" / f"{valid_id}.json"
        payload = dict(policy_data)
        now_iso = datetime.now(UTC).isoformat()
        payload.setdefault("agent_id", valid_id)
        payload.setdefault("created_at", now_iso)
        payload["updated_at"] = now_iso

        with target_file.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        logger.debug("Saved policy for agent %s to %s", valid_id, target_file)
        return target_file

    def load_policy(self, agent_id: str) -> dict[str, Any]:
        """Load an agent policy from storage.

        Args:
            agent_id: Unique identifier for the agent.

        Returns:
            Policy configuration dictionary.

        Raises:
            FileNotFoundError: If the policy file does not exist.
        """
        valid_id = _validate_identifier(agent_id, "agent_id")
        target_file = self.config.base_path / "policies" / f"{valid_id}.json"
        if not target_file.is_file():
            raise FileNotFoundError(f"Policy for agent '{valid_id}' not found at {target_file}")

        with target_file.open("r", encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
        return data

    def list_policies(self) -> list[str]:
        """List all stored policy agent IDs in sorted order."""
        policies_dir = self.config.base_path / "policies"
        if not policies_dir.is_dir():
            return []
        return sorted(p.stem for p in policies_dir.glob("*.json") if p.is_file())

    def delete_policy(self, agent_id: str) -> bool:
        """Delete an agent policy from storage.

        Args:
            agent_id: Unique identifier for the agent.

        Returns:
            True if deleted, False if not found.
        """
        valid_id = _validate_identifier(agent_id, "agent_id")
        target_file = self.config.base_path / "policies" / f"{valid_id}.json"
        if target_file.is_file():
            target_file.unlink()
            return True
        return False

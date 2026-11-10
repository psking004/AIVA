"""Strategic Systems Engine - Episodic Memory.

Stores and indexes full historical decision episodes (situation, snapshot, decision,
rationale, execution, realized outcome, and prediction error).
"""

from __future__ import annotations

import copy
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sse.contracts.decision import DecisionRequest, DecisionResponse
from sse.contracts.world_state import WorldStateSnapshot


@dataclass
class DecisionEpisode:
    """A full end-to-end record of a decision from context to realized outcome."""

    episode_id: str
    request: DecisionRequest
    baseline_snapshot_checksum: str
    response: DecisionResponse
    executed_action_id: str | None = None
    realized_payoff: float | None = None
    realized_outcome: dict[str, Any] = field(default_factory=dict)
    prediction_variance: float | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    resolved_at: datetime | None = None


class EpisodicMemory:
    """Thread-safe storage and query engine for strategic decision episodes."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._episodes: dict[str, DecisionEpisode] = {}

    def record_decision(
        self,
        request: DecisionRequest,
        response: DecisionResponse,
        baseline_snapshot: WorldStateSnapshot,
    ) -> str:
        """Records an initial decision episode."""
        with self._lock:
            episode_id = str(uuid.uuid4())
            episode = DecisionEpisode(
                episode_id=episode_id,
                request=copy.deepcopy(request),
                baseline_snapshot_checksum=baseline_snapshot.calculate_checksum(),
                response=copy.deepcopy(response),
                executed_action_id=(
                    response.recommendation.selected_action_id
                    if response.recommendation
                    else None
                ),
            )
            self._episodes[episode_id] = episode
            return episode_id

    def record_outcome(
        self,
        episode_id: str,
        realized_payoff: float,
        realized_outcome: dict[str, Any] | None = None,
    ) -> DecisionEpisode | None:
        """Resolves an episode with observed real-world outcomes and computes prediction variance."""
        with self._lock:
            episode = self._episodes.get(episode_id)
            if not episode:
                return None

            episode.realized_payoff = realized_payoff
            episode.realized_outcome = realized_outcome or {}
            episode.resolved_at = datetime.now(UTC)

            # Compute variance if recommendation had expected payoff
            expected = 0.0
            if episode.response.alternatives and episode.executed_action_id:
                for alt in episode.response.alternatives:
                    if alt.action_id == episode.executed_action_id:
                        expected = alt.expected_payoff
                        break
            episode.prediction_variance = realized_payoff - expected
            return copy.deepcopy(episode)

    def get_episode(self, episode_id: str) -> DecisionEpisode | None:
        with self._lock:
            ep = self._episodes.get(episode_id)
            return copy.deepcopy(ep) if ep else None

    def list_episodes(self, limit: int = 50) -> list[DecisionEpisode]:
        with self._lock:
            # Sorted by created_at descending
            sorted_eps = sorted(self._episodes.values(), key=lambda e: e.created_at, reverse=True)
            return [copy.deepcopy(e) for e in sorted_eps[:limit]]

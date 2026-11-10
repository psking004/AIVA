"""Strategic Systems Engine - Strategic Problem Classifier.

Classifies incoming situations and world state snapshots into structured problem types
(Single-agent, Zero-sum, General-sum, Multi-agent, Cooperative, Sequential, etc.).
"""

from __future__ import annotations

from sse.contracts.decision import DecisionRequest, ProblemType
from sse.contracts.world_state import EntityType, WorldStateSnapshot


class ProblemClassifier:
    """Classifies strategic problem contexts to guide solver method selection."""

    def classify_problem(
        self,
        request: DecisionRequest,
        snapshot: WorldStateSnapshot,
    ) -> ProblemType:
        """Determines the mathematical problem type from context and world state."""
        context_lower = request.context_description.lower()
        goal_lower = request.goal.lower()

        # Check for explicit cooperative/coalition keywords
        if any(w in context_lower or w in goal_lower for w in ["coalition", "cooperative", "shapley", "profit sharing", "syndicate"]):
            return ProblemType.COOPERATIVE_COALITION

        # Check for sequential extensive keywords
        if any(w in context_lower or w in goal_lower for w in ["turn-based", "sequential", "rounds", "tree", "subgame"]):
            return ProblemType.SEQUENTIAL_EXTENSIVE

        # Check for resource allocation keywords
        if any(w in context_lower or w in goal_lower for w in ["allocate", "budget", "portfolio", "capacity", "linear program"]):
            return ProblemType.RESOURCE_ALLOCATION

        # Count active strategic agents in snapshot
        competitors = [
            e for e in snapshot.entities.values()
            if e.entity_type in (EntityType.COMPETITOR, EntityType.NEUTRAL_ACTOR) and e.is_active
        ]
        competitor_count = len(competitors)

        if competitor_count == 0:
            return ProblemType.SINGLE_AGENT_OPTIMIZATION

        if competitor_count == 1:
            # Check for zero-sum indicators
            if any(w in context_lower or w in goal_lower for w in ["zero-sum", "strictly opposing", "minimax", "duel"]):
                return ProblemType.TWO_PLAYER_ZERO_SUM
            return ProblemType.TWO_PLAYER_GENERAL_SUM

        # > 1 competitors
        return ProblemType.MULTI_AGENT_COMPETITIVE

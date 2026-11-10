"""Strategic Systems Engine - Contracts Package.

Exports universal schemas for decisions, observations, actions, world state,
and authorization governance across the SSE and AIVA platform.
"""

from sse.contracts.action import (
    ActionDefinition,
    ActionExecutionStatus,
    ActionResult,
    Reversibility,
)
from sse.contracts.authorization import (
    AuthorizationGrant,
    AuthorizationRequest,
    AutonomyLevel,
    PermissionScope,
    PolicyEvaluationResult,
    RevocationReason,
)
from sse.contracts.decision import (
    AlternativeStrategy,
    AuthorizationStatus,
    DecisionRequest,
    DecisionResponse,
    DecisionState,
    ProblemType,
    Recommendation,
    UncertaintyAssessment,
    VerificationStatus,
)
from sse.contracts.observation import (
    ConfidenceGrade,
    Observation,
    ObservationBatch,
)
from sse.contracts.world_state import (
    ConstraintDefinition,
    ConstraintType,
    EntityState,
    EntityType,
    RelationshipState,
    ResourceState,
    WorldStateSnapshot,
)

__all__ = [
    "ActionDefinition",
    "ActionExecutionStatus",
    "ActionResult",
    "AlternativeStrategy",
    "AuthorizationGrant",
    "AuthorizationRequest",
    "AuthorizationStatus",
    "AutonomyLevel",
    "ConfidenceGrade",
    "ConstraintDefinition",
    "ConstraintType",
    "DecisionRequest",
    "DecisionResponse",
    "DecisionState",
    "EntityState",
    "EntityType",
    "Observation",
    "ObservationBatch",
    "PermissionScope",
    "PolicyEvaluationResult",
    "ProblemType",
    "Recommendation",
    "RelationshipState",
    "ResourceState",
    "Reversibility",
    "RevocationReason",
    "UncertaintyAssessment",
    "VerificationStatus",
    "WorldStateSnapshot",
]


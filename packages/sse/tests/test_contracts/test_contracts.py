"""Unit tests for Strategic Systems Engine Contracts."""

from datetime import UTC, datetime, timedelta

from sse.contracts import (
    AlternativeStrategy,
    AuthorizationGrant,
    AuthorizationStatus,
    AutonomyLevel,
    ConfidenceGrade,
    ConstraintDefinition,
    ConstraintType,
    DecisionResponse,
    DecisionState,
    EntityState,
    EntityType,
    Observation,
    PermissionScope,
    ProblemType,
    Recommendation,
    RelationshipState,
    ResourceState,
    RevocationReason,
    UncertaintyAssessment,
    VerificationStatus,
    WorldStateSnapshot,
)


def test_observation_freshness_and_decay():
    now = datetime.now(UTC)
    obs = Observation(
        source="sensor_a",
        entity_id="entity_1",
        attribute_name="market_share",
        value=0.45,
        confidence=0.90,
        observed_at=now,
        validity_period_seconds=60.0,
        confidence_grade=ConfidenceGrade.HIGH_CONFIDENCE,
    )
    assert not obs.is_stale(now)
    assert obs.effective_confidence(now) == 0.90

    future = now + timedelta(seconds=120)
    assert obs.is_stale(future)
    assert obs.effective_confidence(future) < 0.90


def test_resource_state_capacity_bounds():
    res = ResourceState(
        resource_id="gpu_compute",
        name="GPU Cluster",
        total_capacity=100.0,
        allocated_capacity=80.0,
        min_reserve=10.0,
    )
    assert res.available_capacity == 20.0
    assert not res.is_exhausted

    res.allocated_capacity = 95.0
    assert res.available_capacity == 5.0
    assert res.is_exhausted


def test_world_state_snapshot_checksum():
    entity = EntityState(
        entity_id="ent_1",
        name="Competitor Alpha",
        entity_type=EntityType.COMPETITOR,
    )
    resource = ResourceState(
        resource_id="res_1",
        name="Capital",
        total_capacity=1000.0,
    )
    rel = RelationshipState(
        source_id="ent_1",
        target_id="ent_2",
        relation_type="competes_with",
        strength=-0.8,
    )
    constraint = ConstraintDefinition(
        constraint_id="c_1",
        name="Budget Limit",
        constraint_type=ConstraintType.HARD,
        description="Cannot spend > 500",
        expression="spend <= 500",
    )

    snapshot = WorldStateSnapshot(
        version=1,
        entities={"ent_1": entity},
        resources={"res_1": resource},
        relationships=[rel],
        constraints=[constraint],
    )
    checksum = snapshot.calculate_checksum()
    assert isinstance(checksum, str)
    assert len(checksum) == 64  # SHA-256


def test_decision_lifecycle_and_executability():
    rec = Recommendation(
        selected_action_id="act_defend",
        action_name="Defend Market Segment",
        justification="Dominant response against competitor expansion",
    )
    uncertainty = UncertaintyAssessment(
        confidence_score=0.85,
        epistemic_uncertainty=0.1,
        aleatoric_uncertainty=0.05,
        value_at_risk_95=10.5,
        confidence_interval_low=0.75,
        confidence_interval_high=0.95,
    )
    alt = AlternativeStrategy(
        action_id="act_retreat",
        name="Retreat",
        expected_payoff=-5.0,
        risk_score=0.2,
    )
    verification = VerificationStatus(is_valid=True, verified_by="invariant_checker")
    authorization = AuthorizationStatus(
        is_authorized=True,
        autonomy_level=3,
        grant_token="grant_xyz123",
    )

    decision = DecisionResponse(
        decision_id="dec_001",
        request_id="req_001",
        problem_type=ProblemType.TWO_PLAYER_GENERAL_SUM,
        state=DecisionState.AUTHORIZED,
        recommendation=rec,
        rationale="Clear Nash equilibrium",
        assumptions=["Competitor is rational"],
        risks=["Regulatory scrutiny"],
        uncertainty=uncertainty,
        alternatives=[alt],
        verification=verification,
        authorization=authorization,
    )

    assert decision.is_executable
    decision.verification.state_drift_detected = True
    assert not decision.is_executable


def test_authorization_grant_validity():
    now = datetime.now(UTC)
    grant = AuthorizationGrant(
        grant_id="g_1",
        decision_id="dec_1",
        action_id="act_1",
        authorized_by="aiva_governor",
        autonomy_level=AutonomyLevel.BOUNDED_AUTONOMOUS,
        granted_scope=PermissionScope.EXECUTION_LOW_RISK,
        grant_token="token_abc",
        issued_at=now,
        valid_until=now + timedelta(minutes=10),
        baseline_state_checksum="hash_123",
    )
    assert grant.is_valid(now)

    grant.is_revoked = True
    grant.revocation_reason = RevocationReason.EMERGENCY_STOP
    assert not grant.is_valid(now)

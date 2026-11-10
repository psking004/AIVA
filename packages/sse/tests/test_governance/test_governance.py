"""Unit tests for Decision Verification and Governance Authorization."""

from sse.contracts import (
    ActionDefinition,
    AuthorizationRequest,
    AutonomyLevel,
    PermissionScope,
    Reversibility,
)
from sse.governance import AuthorizationGate
from sse.verification import DecisionVerifier
from sse.world_model import WorldStateManager


def test_decision_verifier_clean_pass():
    state_mgr = WorldStateManager()
    verifier = DecisionVerifier(state_manager=state_mgr)
    snapshot = state_mgr.capture_snapshot()

    action = ActionDefinition(
        action_id="act_rebalance",
        name="Portfolio Rebalance",
        description="Rebalance low-risk weights",
        target_entity="portfolio",
        estimated_cost=50.0,
        reversibility=Reversibility.REVERSIBLE,
    )

    status = verifier.verify_action_decision(
        action=action,
        baseline_snapshot=snapshot,
        expected_payoff=120.0,
        risk_score=0.15,
    )

    assert status.is_valid
    assert not status.state_drift_detected
    assert len(status.constraint_violations) == 0


def test_authorization_gate_bounded_autonomy_approval():
    state_mgr = WorldStateManager()
    gate = AuthorizationGate(state_manager=state_mgr)
    verifier = DecisionVerifier(state_manager=state_mgr)
    snapshot = state_mgr.capture_snapshot()

    action = ActionDefinition(
        action_id="act_order",
        name="Restock Inventory",
        description="Auto restock",
        target_entity="supplier",
        estimated_cost=250.0,
        reversibility=Reversibility.REVERSIBLE,
    )

    verification = verifier.verify_action_decision(
        action=action,
        baseline_snapshot=snapshot,
        expected_payoff=500.0,
        risk_score=0.1,
    )

    req = AuthorizationRequest(
        decision_id="dec_101",
        action_id="act_order",
        requester_id="aiva_orchestrator",
        requested_autonomy=AutonomyLevel.BOUNDED_AUTONOMOUS,
        requested_scope=PermissionScope.EXECUTION_LOW_RISK,
        timeout_seconds=60.0,
    )

    eval_result = gate.evaluate_authorization(
        request=req,
        action=action,
        verification=verification,
        baseline_snapshot=snapshot,
    )

    assert eval_result["approved"]
    grant_token = eval_result["grant_token"]
    assert grant_token is not None

    # Validate grant
    val = gate.validate_grant(grant_token)
    assert val["valid"]


def test_authorization_gate_emergency_stop():
    state_mgr = WorldStateManager()
    gate = AuthorizationGate(state_manager=state_mgr)
    verifier = DecisionVerifier(state_manager=state_mgr)
    snapshot = state_mgr.capture_snapshot()

    action = ActionDefinition(
        action_id="act_order",
        name="Restock Inventory",
        description="Auto restock",
        target_entity="supplier",
        estimated_cost=100.0,
        reversibility=Reversibility.REVERSIBLE,
    )
    verification = verifier.verify_action_decision(
        action=action,
        baseline_snapshot=snapshot,
        expected_payoff=200.0,
        risk_score=0.1,
    )
    req = AuthorizationRequest(
        decision_id="dec_102",
        action_id="act_order",
        requester_id="aiva",
        requested_autonomy=AutonomyLevel.BOUNDED_AUTONOMOUS,
        requested_scope=PermissionScope.EXECUTION_LOW_RISK,
    )

    eval_result = gate.evaluate_authorization(
        request=req,
        action=action,
        verification=verification,
        baseline_snapshot=snapshot,
    )
    assert eval_result["approved"]
    token = eval_result["grant_token"]

    # Trigger emergency stop
    revoked = gate.trigger_emergency_stop("Suspicious volatility anomaly")
    assert revoked == 1
    assert gate.is_emergency_stopped

    # Grant should now be invalid
    val = gate.validate_grant(token)
    assert not val["valid"]

    # New authorization should be immediately rejected
    new_eval = gate.evaluate_authorization(
        request=req,
        action=action,
        verification=verification,
        baseline_snapshot=snapshot,
    )
    assert not new_eval["approved"]
    assert any("emergency stop" in r.lower() for r in new_eval["rejection_reasons"])

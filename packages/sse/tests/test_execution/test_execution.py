"""Unit tests for the Execution Package."""

from sse.contracts import (
    ActionDefinition,
    ActionExecutionStatus,
    AuthorizationRequest,
    AutonomyLevel,
    PermissionScope,
    Reversibility,
)
from sse.execution import (
    ActionDispatcher,
    CompensationCoordinator,
    ExecutionQuotaLimiter,
    MockActionAdapter,
    ToolCallAdapter,
)
from sse.governance import AuthorizationGate
from sse.verification import DecisionVerifier
from sse.world_model import WorldStateManager


def test_mock_adapter_and_dispatcher_success():
    state_mgr = WorldStateManager()
    gate = AuthorizationGate(state_manager=state_mgr)
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
    verification = verifier.verify_action_decision(action, snapshot, expected_payoff=100.0)
    auth_req = AuthorizationRequest(
        decision_id="dec_001",
        action_id="act_rebalance",
        requester_id="aiva_system",
        requested_autonomy=AutonomyLevel.BOUNDED_AUTONOMOUS,
        requested_scope=PermissionScope.EXECUTION_LOW_RISK,
    )
    auth_eval = gate.evaluate_authorization(auth_req, action, verification, snapshot)
    token = auth_eval["grant_token"]

    adapter = MockActionAdapter()
    dispatcher = ActionDispatcher(authorization_gate=gate, action_adapter=adapter)

    result = dispatcher.dispatch_action(action, grant_token=token)
    assert result.status == ActionExecutionStatus.SUCCESS
    assert result.output_payload["acknowledged"] is True
    assert len(adapter.execution_log) == 1


def test_dispatcher_unauthorized_token():
    state_mgr = WorldStateManager()
    gate = AuthorizationGate(state_manager=state_mgr)
    dispatcher = ActionDispatcher(authorization_gate=gate)

    action = ActionDefinition(
        action_id="act_unauth",
        name="Unauthorized Action",
        description="Test",
        target_entity="target",
    )
    res = dispatcher.dispatch_action(action, grant_token="invalid_token_123")
    assert res.status == ActionExecutionStatus.FAILURE
    assert "Unauthorized" in res.error_message


def test_compensation_coordinator_rollback():
    adapter = MockActionAdapter()
    coordinator = CompensationCoordinator(action_adapter=adapter)

    act1 = ActionDefinition(
        action_id="act_step1",
        name="Step 1 Allocate",
        description="Step 1",
        target_entity="system",
        reversibility=Reversibility.REVERSIBLE,
    )
    coordinator.register_action_definition(act1)
    res1 = adapter.execute(act1)
    coordinator.record_execution(res1)

    act2 = ActionDefinition(
        action_id="act_step2",
        name="Step 2 Deploy",
        description="Step 2",
        target_entity="system",
        reversibility=Reversibility.REVERSIBLE,
    )
    coordinator.register_action_definition(act2)
    res2 = adapter.execute(act2)
    coordinator.record_execution(res2)

    # Trigger rollback
    rollback_res = coordinator.trigger_rollback(reason="Test Rollback")
    assert rollback_res["successful_reversals"] == 2
    # Verify compensation actions were executed in reverse
    assert adapter.execution_log[-1].action_id == "undo_act_step1"
    assert adapter.execution_log[-2].action_id == "undo_act_step2"


def test_execution_quota_limiter():
    limiter = ExecutionQuotaLimiter(max_actions_per_minute=2, max_cost_per_hour=100.0)

    # First action -> OK
    res1 = limiter.check_and_record(action_cost=40.0)
    assert res1["allowed"]

    # Second action -> OK
    res2 = limiter.check_and_record(action_cost=40.0)
    assert res2["allowed"]

    # Third action -> Exceeds rate limit (2/min)
    res3 = limiter.check_and_record(action_cost=10.0)
    assert not res3["allowed"]
    assert "Rate limit" in res3["reason"]


def test_tool_call_adapter():
    adapter = ToolCallAdapter()
    adapter.register_tool("echo_tool", lambda params: {"echo": params.get("message")})

    action = ActionDefinition(
        action_id="act_echo",
        name="echo_tool",
        description="Echo test",
        target_entity="console",
        parameters={"message": "hello aiva"},
    )
    res = adapter.execute(action)
    assert res.status == ActionExecutionStatus.SUCCESS
    assert res.output_payload["echo"] == "hello aiva"


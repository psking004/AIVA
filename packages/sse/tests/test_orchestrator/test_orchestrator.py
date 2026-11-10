"""Unit tests for the Strategic Decision Orchestrator."""

from sse.contracts import (
    DecisionRequest,
    DecisionState,
    EntityState,
    EntityType,
    ProblemType,
)
from sse.orchestrator import (
    MethodSelector,
    ProblemClassifier,
    StrategicDecisionEngine,
)
from sse.world_model import WorldStateManager


def test_problem_classifier():
    classifier = ProblemClassifier()
    state_mgr = WorldStateManager()

    # Case 1: Single Agent (no competitors)
    snap1 = state_mgr.capture_snapshot()
    req1 = DecisionRequest(context_description="Internal system optimization", goal="Minimize latency")
    p1 = classifier.classify_problem(req1, snap1)
    assert p1 == ProblemType.SINGLE_AGENT_OPTIMIZATION

    # Case 2: 1 Competitor -> Two-player General Sum
    state_mgr.entities.register_entity(
        EntityState(entity_id="comp_1", name="Rival Inc", entity_type=EntityType.COMPETITOR)
    )
    snap2 = state_mgr.capture_snapshot()
    req2 = DecisionRequest(context_description="Market competition", goal="Maximize profit")
    p2 = classifier.classify_problem(req2, snap2)
    assert p2 == ProblemType.TWO_PLAYER_GENERAL_SUM

    # Case 3: Zero Sum context keywords
    req3 = DecisionRequest(context_description="A zero-sum duel for cybersecurity defense", goal="Minimax victory")
    p3 = classifier.classify_problem(req3, snap2)
    assert p3 == ProblemType.TWO_PLAYER_ZERO_SUM


def test_method_selector():
    selector = MethodSelector()
    methods_single = selector.select_methods(ProblemType.SINGLE_AGENT_OPTIMIZATION)
    assert "linear_optimization" in methods_single

    methods_two_player = selector.select_methods(ProblemType.TWO_PLAYER_GENERAL_SUM)
    assert "pure_nash" in methods_two_player


def test_decision_engine_full_lifecycle():
    engine = StrategicDecisionEngine()
    req = DecisionRequest(
        context_description="Expansion into competitive cloud region",
        goal="Maximize long term return",
        candidate_actions=[
            {
                "action_id": "act_lease",
                "name": "Lease Data Center Capacity",
                "description": "Lease from third party",
                "parameters": {"expected_return": 120.0},
                "estimated_cost": 20.0,
                "reversibility": "reversible",
            },
            {
                "action_id": "act_build",
                "name": "Build Owned Infrastructure",
                "description": "Heavy capital outlay",
                "parameters": {"expected_return": 200.0},
                "estimated_cost": 150.0,
                "reversibility": "irreversible",
            },
        ],
        required_confidence=0.50,
    )

    response = engine.formulate_decision(req)
    assert response.decision_id is not None
    assert response.state in (DecisionState.VERIFIED, DecisionState.EVALUATED)
    assert response.recommendation is not None
    assert len(response.alternatives) == 2
    assert response.rationale != ""
    assert len(response.assumptions) > 0
    assert len(response.risks) > 0
    assert response.uncertainty.confidence_score >= 0.50

    # Ensure episode was stored in episodic memory
    episodes = engine.episodic_memory.list_episodes()
    assert len(episodes) == 1
    assert episodes[0].request.goal == req.goal


def test_decision_engine_abstention_on_high_confidence_requirement():
    engine = StrategicDecisionEngine()
    req = DecisionRequest(
        context_description="Unknown anomalous situation",
        goal="Decide with extreme certainty",
        required_confidence=0.999,  # Unattainably high
    )

    response = engine.formulate_decision(req)
    assert response.state == DecisionState.ABSTAINED
    assert response.recommendation is None
    assert "Abstained" in response.rationale

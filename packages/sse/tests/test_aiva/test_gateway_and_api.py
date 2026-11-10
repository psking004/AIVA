"""Integration tests for the AIVA Strategic Intelligence Gateway Client and REST API."""

import pytest
from starlette.testclient import TestClient

from sse.api.app import app
from sse.contracts import ActionDefinition, AutonomyLevel, Reversibility
from sse.gateway import StrategicIntelligenceClient


@pytest.fixture
def api_client():
    return TestClient(app)


def test_strategic_intelligence_client_flow():
    client = StrategicIntelligenceClient()

    # Step 1: Analyze situation
    decision = client.analyse(
        context="Market entry into competitive robotics space",
        goal="Maximize long term market capture",
        candidate_actions=[
            {
                "action_id": "act_partner",
                "name": "Form Strategic Joint Venture",
                "description": "Partner with existing distributor",
                "parameters": {"expected_return": 150.0},
                "estimated_cost": 30.0,
                "reversibility": "reversible",
            },
            {
                "action_id": "act_solo",
                "name": "Direct Greenfield Entry",
                "description": "Build local sales force from scratch",
                "parameters": {"expected_return": 180.0},
                "estimated_cost": 120.0,
                "reversibility": "irreversible",
            },
        ],
        required_confidence=0.50,
    )

    assert decision.decision_id is not None
    assert decision.recommendation is not None
    rec_act_id = decision.recommendation.selected_action_id

    # Step 2: Explain decision
    explanation = client.explain(decision.decision_id)
    assert "# Strategic Decision Explanation" in explanation
    assert "Recommendation" in explanation
    assert "Uncertainty & Risk Profile" in explanation

    # Step 3: Request authorization
    action_to_exec = ActionDefinition(
        action_id=rec_act_id,
        name=decision.recommendation.action_name,
        description="Executing top recommendation",
        target_entity="market",
        estimated_cost=30.0,
        reversibility=Reversibility.REVERSIBLE,
    )

    auth_res = client.request_authorization(
        decision_id=decision.decision_id,
        action=action_to_exec,
        autonomy_level=AutonomyLevel.BOUNDED_AUTONOMOUS,
    )
    assert auth_res["approved"]
    grant_token = auth_res["grant_token"]

    # Step 4: Execute action
    exec_res = client.execute(action_to_exec, grant_token=grant_token)
    assert exec_res.status.value == "success"
    assert exec_res.output_payload["acknowledged"] is True


def test_aiva_rest_api_endpoints(api_client):
    # 1. Post Decision Request
    dec_payload = {
        "context": "Supply chain disruption in semiconductors",
        "goal": "Maintain factory production line continuity",
        "candidate_actions": [
            {
                "action_id": "act_multisource",
                "name": "Dual-source critical microcontrollers",
                "description": "Order buffer stock from secondary supplier",
                "parameters": {"expected_return": 200.0},
                "estimated_cost": 40.0,
                "reversibility": "reversible",
            }
        ],
        "required_confidence": 0.50,
    }

    res = api_client.post("/api/v1/decisions", json=dec_payload)
    assert res.status_code == 200
    data = res.json()
    assert "decision_id" in data
    assert data["recommendation"]["selected_action_id"] == "act_multisource"
    decision_id = data["decision_id"]

    # 2. Get Decision
    res_get = api_client.get(f"/api/v1/decisions/{decision_id}")
    assert res_get.status_code == 200
    assert res_get.json()["decision_id"] == decision_id

    # 3. Explain Decision
    res_exp = api_client.get(f"/api/v1/decisions/{decision_id}/explain")
    assert res_exp.status_code == 200
    assert "explanation" in res_exp.json()

    # 4. Authorize Decision
    auth_payload = {
        "action_id": "act_multisource",
        "requester_id": "aiva_supply_agent",
        "autonomy_level": 3,
        "scope": "execution_low_risk",
    }
    res_auth = api_client.post(f"/api/v1/decisions/{decision_id}/authorize", json=auth_payload)
    assert res_auth.status_code == 200
    auth_data = res_auth.json()
    assert auth_data["approved"]
    grant_token = auth_data["grant_token"]

    # 5. Execute Action
    exec_payload = {
        "action_id": "act_multisource",
        "grant_token": grant_token,
        "target_entity": "supplier_network",
        "parameters": {"units": 5000},
    }
    res_exec = api_client.post(f"/api/v1/decisions/{decision_id}/execute", json=exec_payload)
    assert res_exec.status_code == 200
    assert res_exec.json()["status"] == "success"

    # 6. Capture World Model Snapshot
    res_snap = api_client.post("/api/v1/world-model/snapshots")
    assert res_snap.status_code == 200
    assert "snapshot_id" in res_snap.json()
    assert "checksum" in res_snap.json()

    # 7. Emergency Stop
    res_stop = api_client.post("/api/v1/governance/emergency-stop", json={"reason": "Critical drill"})
    assert res_stop.status_code == 200
    assert res_stop.json()["emergency_stop_active"] is True


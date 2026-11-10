import pytest
from fastapi.testclient import TestClient

from sse.api.app import app


@pytest.fixture
def client():
    return TestClient(app)


def test_api_health(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"


def test_api_validate_model(client):
    payload = {
        "id": "pd",
        "name": "Prisoner's Dilemma",
        "players": ["A", "B"],
        "actions": {"A": ["C", "D"], "B": ["C", "D"]},
        "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
    }
    res = client.post("/api/v1/models/validate", json=payload)
    assert res.status_code == 200
    assert res.json()["status"] == "valid"


def test_api_solve_game(client):
    payload = {
        "game": {
            "id": "pd",
            "name": "PD",
            "players": ["A", "B"],
            "actions": {"A": ["C", "D"], "B": ["C", "D"]},
            "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
        },
        "solver": "pure_nash_enumeration",
        "tolerance": 0.0,
    }
    res = client.post("/api/v1/solvers/solve", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "solved"
    assert data["solution_count"] == 1


def test_api_list_domains_and_scenarios(client):
    res = client.get("/api/v1/domains/list")
    assert res.status_code == 200
    domains = res.json()["domains"]
    assert "cybersecurity" in domains

    scen_res = client.get("/api/v1/domains/cybersecurity/scenarios")
    assert scen_res.status_code == 200
    assert "simple_network_defense" in scen_res.json()["scenarios"]

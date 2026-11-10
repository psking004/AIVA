"""FastAPI route definitions for the SSE REST API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from sse.domains import DomainRegistry
from sse.models import FiniteNormalFormGame, GameValidationError
from sse.solvers.registry import registry as solver_registry

api_router = APIRouter()


class GamePayload(BaseModel):
    id: str
    name: str
    players: list[str]
    actions: dict[str, list[str]]
    payoffs: list[list[float]]


class ValidationResponse(BaseModel):
    status: str
    game_id: str
    players: int
    profiles: int


class SolveRequest(BaseModel):
    game: GamePayload
    solver: str = "pure_nash_enumeration"
    tolerance: float = 0.0


class SolverResultResponse(BaseModel):
    status: str
    solver: str
    solution_count: int
    diagnostics: dict[str, Any]
    details: dict[str, Any]


@api_router.get("/health")
def health_check() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": "Strategic Systems Engine REST API",
        "version": "0.1.0",
    }


@api_router.post("/models/validate", response_model=ValidationResponse)
def validate_model(payload: GamePayload) -> ValidationResponse:
    try:
        game = FiniteNormalFormGame.from_dict(payload.model_dump())
        return ValidationResponse(
            status="valid",
            game_id=game.id,
            players=len(game.players),
            profiles=game.profile_count,
        )
    except GameValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api_router.get("/solvers/list")
def list_solvers() -> dict[str, list[str]]:
    return {"solvers": solver_registry.list_solvers()}


@api_router.post("/solvers/solve", response_model=SolverResultResponse)
def solve_game(request: SolveRequest) -> SolverResultResponse:
    try:
        game = FiniteNormalFormGame.from_dict(request.game.model_dump())
        solver = solver_registry.get(request.solver)
        result = solver.solve(game, tolerance=request.tolerance)

        # Convert result attributes to dictionary
        details: dict[str, Any] = {}
        for attr in dir(result):
            if not attr.startswith("_") and attr not in {"status", "solution_count", "diagnostics", "metadata"}:
                val = getattr(result, attr)
                if not callable(val):
                    details[attr] = str(val) if not isinstance(val, (int, float, bool, list, dict)) else val

        return SolverResultResponse(
            status=result.status,
            solver=result.metadata.solver if result.metadata else request.solver,
            solution_count=result.solution_count,
            diagnostics=result.diagnostics,
            details=details,
        )
    except GameValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid game definition: {exc}") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Solver not found: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Solver failure: {exc}") from exc


# ---------------------------------------------------------------------------
# AIVA Strategic Intelligence Endpoints
# ---------------------------------------------------------------------------

from sse.contracts.action import ActionDefinition, Reversibility
from sse.contracts.authorization import AutonomyLevel, PermissionScope
from sse.gateway.client import StrategicIntelligenceClient

_aiva_client = StrategicIntelligenceClient()


class DecisionApiRequest(BaseModel):
    context: str
    goal: str
    candidate_actions: list[dict[str, Any]] = []
    required_confidence: float = 0.60
    max_risk_tolerance: float = 0.40


class AuthorizeApiRequest(BaseModel):
    action_id: str
    requester_id: str = "aiva_orchestrator"
    autonomy_level: int = 3  # BOUNDED_AUTONOMOUS
    scope: str = "execution_low_risk"
    timeout_seconds: float = 300.0


class ExecuteApiRequest(BaseModel):
    action_id: str
    grant_token: str
    target_entity: str = "environment"
    parameters: dict[str, Any] = {}
    reversibility: str = "reversible"


class EmergencyStopRequest(BaseModel):
    reason: str = "Manual emergency stop from API"


@api_router.post("/decisions")
def create_decision(req: DecisionApiRequest) -> dict[str, Any]:
    response = _aiva_client.analyse(
        context=req.context,
        goal=req.goal,
        candidate_actions=req.candidate_actions,
        required_confidence=req.required_confidence,
        max_risk_tolerance=req.max_risk_tolerance,
    )
    rec_dict = None
    if response.recommendation:
        rec_dict = {
            "selected_action_id": response.recommendation.selected_action_id,
            "action_name": response.recommendation.action_name,
            "justification": response.recommendation.justification,
            "reversibility": response.recommendation.reversibility,
            "execution_steps": response.recommendation.execution_steps,
        }

    return {
        "decision_id": response.decision_id,
        "request_id": response.request_id,
        "problem_type": response.problem_type.value,
        "state": response.state.value,
        "recommendation": rec_dict,
        "rationale": response.rationale,
        "assumptions": response.assumptions,
        "risks": response.risks,
        "confidence_score": response.uncertainty.confidence_score,
        "alternatives_count": len(response.alternatives),
        "is_executable": response.is_executable,
    }


@api_router.get("/decisions/{decision_id}")
def get_decision(decision_id: str) -> dict[str, Any]:
    decision = _aiva_client._decisions_cache.get(decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")
    return {
        "decision_id": decision.decision_id,
        "state": decision.state.value,
        "rationale": decision.rationale,
        "confidence_score": decision.uncertainty.confidence_score,
        "is_executable": decision.is_executable,
    }


@api_router.get("/decisions/{decision_id}/explain")
def explain_decision(decision_id: str) -> dict[str, str]:
    explanation = _aiva_client.explain(decision_id)
    if "not found" in explanation.lower():
        raise HTTPException(status_code=404, detail=explanation)
    return {"explanation": explanation}


@api_router.post("/decisions/{decision_id}/authorize")
def authorize_decision(decision_id: str, req: AuthorizeApiRequest) -> dict[str, Any]:
    decision = _aiva_client._decisions_cache.get(decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    action_def = ActionDefinition(
        action_id=req.action_id,
        name=f"Action {req.action_id}",
        description="Authorized action",
        target_entity="system",
        reversibility=Reversibility.REVERSIBLE,
    )

    try:
        autonomy = AutonomyLevel(req.autonomy_level)
    except ValueError:
        autonomy = AutonomyLevel.BOUNDED_AUTONOMOUS

    try:
        scope = PermissionScope(req.scope)
    except ValueError:
        scope = PermissionScope.EXECUTION_LOW_RISK

    result = _aiva_client.request_authorization(
        decision_id=decision_id,
        action=action_def,
        requester_id=req.requester_id,
        autonomy_level=autonomy,
        scope=scope,
        timeout_seconds=req.timeout_seconds,
    )
    return result


@api_router.post("/decisions/{decision_id}/execute")
def execute_decision(decision_id: str, req: ExecuteApiRequest) -> dict[str, Any]:
    rev = Reversibility.REVERSIBLE
    if req.reversibility == "irreversible":
        rev = Reversibility.IRREVERSIBLE

    action = ActionDefinition(
        action_id=req.action_id,
        name=f"Action {req.action_id}",
        description="Execution payload",
        target_entity=req.target_entity,
        parameters=req.parameters,
        reversibility=rev,
    )

    result = _aiva_client.execute(action, grant_token=req.grant_token)
    return {
        "execution_id": result.execution_id,
        "action_id": result.action_id,
        "status": result.status.value,
        "output": result.output_payload,
        "error": result.error_message,
    }


@api_router.post("/world-model/snapshots")
def capture_snapshot() -> dict[str, Any]:
    snap = _aiva_client.state_manager.capture_snapshot()
    return {
        "snapshot_id": snap.snapshot_id,
        "version": snap.version,
        "checksum": snap.calculate_checksum(),
        "entities_count": len(snap.entities),
        "resources_count": len(snap.resources),
    }


@api_router.post("/governance/emergency-stop")
def trigger_emergency_stop(req: EmergencyStopRequest) -> dict[str, Any]:
    revoked = _aiva_client.authorization_gate.trigger_emergency_stop(reason=req.reason)
    return {
        "emergency_stop_active": True,
        "revoked_grants_count": revoked,
        "reason": req.reason,
    }


@api_router.get("/domains/list")
def list_domains() -> dict[str, list[str]]:
    return {"domains": DomainRegistry.list_domains()}


@api_router.get("/domains/{domain_name}/scenarios")
def list_domain_scenarios(domain_name: str) -> dict[str, Any]:
    try:
        domain = DomainRegistry.get(domain_name)
        return {
            "domain": domain_name,
            "description": domain.description,
            "scenarios": domain.list_scenarios(),
        }
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api_router.get("/domains/{domain_name}/scenarios/{scenario_name}")
def get_domain_scenario(domain_name: str, scenario_name: str) -> dict[str, Any]:
    try:
        domain = DomainRegistry.get(domain_name)
        game = domain.get_scenario(scenario_name)
        return game.to_dict()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

"""Strategic Systems Engine - AIVA Tool & Action Router.

Exposes SSE strategic capabilities as callable tools for the parent AIVA agent
orchestrator, with error handling and fallback to air-gapped sovereign execution.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from sse.gateway.client import AivaStrategicIntelligenceClient

logger = logging.getLogger("sse.aiva.router")


class AivaToolRouter:
    """Standardized tool router exposing SSE game theory, governance, and swarm tools to AIVA."""

    def __init__(self, client: AivaStrategicIntelligenceClient | None = None) -> None:
        self.client = client or AivaStrategicIntelligenceClient()

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        """Return standardized OpenAI/Anthropic-compatible tool schemas for AIVA."""
        return [
            {
                "name": "sse_allocate_compute",
                "description": "Evaluate live cluster metrics and allocate compute between PC-A and PC-B, pruning OOM paths.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_vram_gb": {"type": "number", "description": "Required GPU VRAM in GB"},
                        "task_cpu_sec_a": {"type": "number", "description": "Estimated CPU time on Node A"},
                        "task_cpu_sec_b": {"type": "number", "description": "Estimated CPU time on Node B"},
                        "network_latency_sec": {"type": "number", "default": 0.12},
                    },
                    "required": ["task_vram_gb", "task_cpu_sec_a", "task_cpu_sec_b"],
                },
            },
            {
                "name": "sse_disambiguate_intent",
                "description": "Calculate Bayes Risk and EVPI to decide whether to clarify ambiguous instructions or execute frictionlessly.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "hypotheses_probs": {"type": "object", "description": "Intent hypothesis -> probability"},
                        "misclassification_penalties": {"type": "object", "description": "Intent hypothesis -> error penalty"},
                        "clarification_cost": {"type": "number", "default": 8.0},
                    },
                    "required": ["hypotheses_probs", "misclassification_penalties"],
                },
            },
            {
                "name": "sse_verify_governance",
                "description": "Verify 2-of-3 threshold quorum cryptographic signatures before executing high-impact or destructive actions.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action_name": {"type": "string", "description": "Name of action to execute"},
                        "target_entity": {"type": "string", "description": "Target entity or process ID"},
                        "signatures": {"type": "object", "description": "Mapping of NodeID -> HMAC signature"},
                        "timestamp": {"type": "number"},
                    },
                    "required": ["action_name", "target_entity", "signatures"],
                },
            },
            {
                "name": "sse_build_software",
                "description": "Dispatch complex software construction to the 6-agent autonomous swarm for closed-loop development.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_specification": {"type": "string", "description": "Detailed functional requirements"},
                        "export_directory": {"type": "string", "description": "Output path for generated verified project"},
                    },
                    "required": ["task_specification", "export_directory"],
                },
            },
        ]

    def sse_allocate_compute(
        self,
        task_vram_gb: float,
        task_cpu_sec_a: float,
        task_cpu_sec_b: float,
        network_latency_sec: float = 0.12,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Tool handler for cluster compute and VRAM allocation."""
        try:
            return self.client.resolve_compute_deadlock(
                task_vram_gb=float(task_vram_gb),
                task_cpu_sec_a=float(task_cpu_sec_a),
                task_cpu_sec_b=float(task_cpu_sec_b),
                network_latency_sec=float(network_latency_sec),
            )
        except Exception as exc:
            logger.error("Error in sse_allocate_compute: %s. Degrading to local fallback.", exc)
            return {
                "target": "LOCAL_PC_A",
                "expected_utility": -task_cpu_sec_a,
                "oom_risk": 0.0,
                "compact_payload": "DEADLOCK_FALLBACK|target=LOCAL_PC_A|util=-100|oom_risk=0",
                "status": "FALLBACK_LOCAL",
            }

    def sse_disambiguate_intent(
        self,
        hypotheses_probs: dict[str, float],
        misclassification_penalties: dict[str, float],
        clarification_cost: float = 8.0,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Tool handler for Bayesian EVPI intent disambiguation."""
        try:
            decision, detail = self.client.evaluate_intent_disambiguation(
                hypotheses_probs=hypotheses_probs,
                misclassification_penalties=misclassification_penalties,
                clarification_cost=clarification_cost,
            )
            return {
                "decision": decision,
                "detail": detail,
                "clarification_needed": decision == "CLARIFY",
            }
        except Exception as exc:
            logger.error("Error in sse_disambiguate_intent: %s. Defaulting to clarification.", exc)
            return {
                "decision": "CLARIFY",
                "detail": f"System encountered uncertainty parsing intent: {exc}",
                "clarification_needed": True,
            }

    def sse_verify_governance(
        self,
        action_name: str,
        target_entity: str,
        signatures: dict[str, str],
        timestamp: float | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Tool handler for multi-node threshold quorum verification."""
        try:
            approved, reason = self.client.verify_action_clearance(
                action_name=action_name,
                target_entity=target_entity,
                signatures=signatures,
                timestamp=timestamp,
            )
            return {
                "approved": approved,
                "status": reason,
                "action": action_name,
                "target": target_entity,
            }
        except Exception as exc:
            logger.error("Error in sse_verify_governance: %s. Quorum denied by policy.", exc)
            return {
                "approved": False,
                "status": f"GOVERNANCE_EXCEPTION_DENIED: {exc}",
                "action": action_name,
                "target": target_entity,
            }

    def sse_build_software(
        self,
        task_specification: str,
        export_directory: str | Path,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Tool handler for autonomous sub-agent swarm construction."""
        try:
            return self.client.dispatch_autonomous_swarm_build(
                task_specification=task_specification,
                export_directory=Path(export_directory),
            )
        except Exception as exc:
            logger.error("Error in sse_build_software: %s", exc)
            return {
                "status": "FAILED",
                "error": str(exc),
                "iterations": 0,
                "file_count": 0,
            }

    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Dynamically dispatch tool invocation by name with zero-crash guarantee."""
        tool_map = {
            "sse_allocate_compute": self.sse_allocate_compute,
            "sse_disambiguate_intent": self.sse_disambiguate_intent,
            "sse_verify_governance": self.sse_verify_governance,
            "sse_build_software": self.sse_build_software,
        }

        handler = tool_map.get(tool_name)
        if not handler:
            return {
                "status": "ERROR",
                "error": f"Tool '{tool_name}' is not recognized in SSE tool registry.",
            }

        return handler(**arguments)


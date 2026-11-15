"""AIVA Multi-Agent Swarm Engine Package.

Provides 14 specialist agents, SSE strategic planning coordination,
inter-agent communication bus, execution schedulers, model router,
checkpoints, independent verification, and visual telemetry.
"""

from packages.swarm.core.contracts import (
    ExecutionResult,
    ExecutionStrategy,
    MessageType,
    SwarmMessage,
    SwarmTask,
    TaskPriority,
    TaskStatus,
)
from packages.swarm.orchestrator.swarm_engine import SwarmOrchestrator
from packages.swarm.registry.agent_definitions import (
    AgentDefinition,
    get_specialist_agent_catalog,
)

__all__ = [
    "AgentDefinition",
    "ExecutionResult",
    "ExecutionStrategy",
    "MessageType",
    "SwarmMessage",
    "SwarmOrchestrator",
    "SwarmTask",
    "TaskPriority",
    "TaskStatus",
    "get_specialist_agent_catalog",
]


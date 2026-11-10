"""Strategic Systems Engine - Specialized Swarm Sub-Agents Package.

Coordinates the functional agent division: Architect, Builder, Runtime Supervisor,
Security Auditor, Adversarial Red Team, and Automated Healer.
"""

from sse.swarm.agents.architect import ArchitectAgent, ArchitectureBlueprint, ComponentSpec
from sse.swarm.agents.auditor import SecurityAuditorAgent
from sse.swarm.agents.builder import BuilderAgent
from sse.swarm.agents.healer import HealerAgent
from sse.swarm.agents.red_team import RedTeamAgent
from sse.swarm.agents.runtime import RuntimeSupervisorAgent

__all__ = [
    "ArchitectAgent",
    "ArchitectureBlueprint",
    "BuilderAgent",
    "ComponentSpec",
    "HealerAgent",
    "RedTeamAgent",
    "RuntimeSupervisorAgent",
    "SecurityAuditorAgent",
]


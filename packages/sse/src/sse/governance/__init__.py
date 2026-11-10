"""Strategic Systems Engine - Governance Package.

Exports authorization gate, policy engine, and bounded autonomy rules.
"""

from sse.governance.authorization import AuthorizationGate
from sse.governance.policies import PolicyEngine, PolicyRule

__all__ = [
    "AuthorizationGate",
    "PolicyEngine",
    "PolicyRule",
]


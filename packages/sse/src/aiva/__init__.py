"""AIVA - Autonomous Intelligent Virtual Agent Platform.

Models the 7 core pillars of production autonomous systems:
1. Connected Accounts (Zero-password OAuth broker)
2. Dedicated Compute Workspace (Isolated scratchpad execution on PC-B / worktrees)
3. Real Headless Browsers (DOM automation & direct-fill secret injection)
4. Zero-Leak Credential Vault (AES-256-GCM encrypted storage)
5. Structured Long-Term Memory (Biographical profile + episodic hash-chain ledger)
6. Proactive Background Daemon (Scheduled tasks & morning brief P2P push)
7. Cryptographic Guardrails (2-of-3 threshold quorum authorization for irreversible actions)
"""

from aiva.browser.controller import HeadlessBrowserSupervisor, VirtualDOMSession
from aiva.control_plane import AivaActionResponse, AivaAgentPlane
from aiva.governance.guardrails import AivaGuardrailGate, AutonomyTier
from aiva.governance.mobile_signer import MobileQuorumSignerDaemon, SignerPolicyRule
from aiva.integrations.oauth_broker import OAuthBroker
from aiva.memory.profile import AivaMemoryManager
from aiva.perception.voice_gateway import (
    VoiceIntentCandidate,
    VoiceIntentEvaluation,
    VoiceIntentGateway,
)
from aiva.proactive.daemon import ProactiveDaemon
from aiva.security.enrollment import EnrollmentManifest, HeadlessSecretEnrollment
from aiva.security.vault import SecureCredentialVault

__all__ = [
    "AivaActionResponse",
    "AivaAgentPlane",
    "AivaGuardrailGate",
    "AivaMemoryManager",
    "AutonomyTier",
    "EnrollmentManifest",
    "HeadlessBrowserSupervisor",
    "HeadlessSecretEnrollment",
    "MobileQuorumSignerDaemon",
    "OAuthBroker",
    "ProactiveDaemon",
    "SecureCredentialVault",
    "SignerPolicyRule",
    "VirtualDOMSession",
    "VoiceIntentCandidate",
    "VoiceIntentEvaluation",
    "VoiceIntentGateway",
]

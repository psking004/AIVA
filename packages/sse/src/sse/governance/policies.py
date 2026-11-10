"""Strategic Systems Engine - Governance Safety Policies.

Defines organizational safety policies, autonomy boundaries, and rule evaluators.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sse.contracts.action import ActionDefinition, Reversibility
from sse.contracts.authorization import AutonomyLevel, PolicyEvaluationResult


@dataclass
class PolicyRule:
    """An individual organizational or safety governance rule."""

    rule_id: str
    name: str
    description: str
    max_cost_autonomous: float = 1000.0  # Max cost allowed at AutonomyLevel 3 without human confirmation
    prohibit_irreversible_autonomous: bool = True
    blocked_actions: list[str] = field(default_factory=list)


class PolicyEngine:
    """Evaluates safety policies against candidate execution requests."""

    def __init__(self, rules: list[PolicyRule] | None = None) -> None:
        self.rules = rules or [
            PolicyRule(
                rule_id="DEFAULT_SAFETY",
                name="Default Organizational Safety Policy",
                description="Enforces standard autonomy boundaries and cost caps",
                max_cost_autonomous=1000.0,
                prohibit_irreversible_autonomous=True,
            )
        ]

    def evaluate(
        self,
        action: ActionDefinition,
        autonomy_level: AutonomyLevel,
    ) -> PolicyEvaluationResult:
        """Evaluates whether an action is permissible under the requested autonomy level."""
        evaluated_rules: list[str] = []
        violations: list[str] = []

        # Read-only or advisory level can never execute
        if autonomy_level in (AutonomyLevel.READ_ONLY, AutonomyLevel.ADVISORY):
            violations.append(f"Autonomy level {autonomy_level.name} cannot execute actions")
            return PolicyEvaluationResult(
                is_allowed=False,
                evaluated_rules=["AUTONOMY_LEVEL_CHECK"],
                violations=violations,
                required_autonomy_level=AutonomyLevel.HUMAN_CONFIRMED,
            )

        for rule in self.rules:
            evaluated_rules.append(rule.rule_id)

            # Check if action is globally blocked
            if action.action_id in rule.blocked_actions:
                violations.append(f"Action '{action.action_id}' is explicitly blacklisted by {rule.name}")

            # Check autonomy boundary for bounded autonomy (Level 3)
            if autonomy_level == AutonomyLevel.BOUNDED_AUTONOMOUS:
                if action.estimated_cost > rule.max_cost_autonomous:
                    violations.append(
                        f"Action cost {action.estimated_cost} exceeds bounded autonomy cap {rule.max_cost_autonomous}"
                    )
                if rule.prohibit_irreversible_autonomous and action.reversibility == Reversibility.IRREVERSIBLE:
                    violations.append("Irreversible action requires explicit human confirmation (Level 2/4)")

        is_allowed = len(violations) == 0
        req_level = AutonomyLevel.BOUNDED_AUTONOMOUS if is_allowed else AutonomyLevel.HUMAN_CONFIRMED

        return PolicyEvaluationResult(
            is_allowed=is_allowed,
            evaluated_rules=evaluated_rules,
            violations=violations,
            required_autonomy_level=req_level,
            notes="Passed safety policies" if is_allowed else "Policy violations detected",
        )

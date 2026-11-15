"""AIVA Swarm Engine - Specialist Agent Registry.

Defines the 14 foundational specialist agents with distinct roles,
least-privilege permission grants, tool registries, schemas, and resource budgets.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AgentDefinition:
    """Formal definition and permission boundaries for a Swarm Specialist Agent."""
    agent_id: str
    role: str
    description: str
    model_preference: List[str]
    available_tools: List[str]
    permissions: List[str]
    resource_requirements: Dict[str, Any]
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    memory_scope: str  # task_local, session, persistent
    timeout_seconds: int
    retry_policy: Dict[str, Any]
    checkpoint_policy: Dict[str, Any]
    verification_requirements: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "role": self.role,
            "description": self.description,
            "model_preference": self.model_preference,
            "available_tools": self.available_tools,
            "permissions": self.permissions,
            "resource_requirements": self.resource_requirements,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "memory_scope": self.memory_scope,
            "timeout_seconds": self.timeout_seconds,
            "retry_policy": self.retry_policy,
            "checkpoint_policy": self.checkpoint_policy,
            "verification_requirements": self.verification_requirements,
        }


def get_specialist_agent_catalog() -> Dict[str, AgentDefinition]:
    """Returns the 14 registered specialist agents in the AIVA Swarm Engine."""
    catalog = {}

    # 1. Strategic Planner
    catalog["agent_strategic_planner"] = AgentDefinition(
        agent_id="agent_strategic_planner",
        role="Strategic Planner",
        description="Analyzes high-level goals, decomposes tasks, formulates execution strategies and game-theoretic plans.",
        model_preference=["deepseek-r1", "qwen/qwen-2.5-72b-instruct", "qwen3:8b"],
        available_tools=["sse_plan_intent", "sse_evaluate_utility", "decompose_dag", "inspect_resources"],
        permissions=["read_system_state", "create_subtasks", "assign_agents"],
        resource_requirements={"min_ram_gb": 4, "vram_needed_gb": 0, "max_cpu_percent": 50},
        input_schema={"type": "object", "properties": {"objective": {"type": "string"}}, "required": ["objective"]},
        output_schema={"type": "object", "properties": {"strategy": {"type": "string"}, "steps": {"type": "array"}}, "required": ["strategy", "steps"]},
        memory_scope="session",
        timeout_seconds=45,
        retry_policy={"max_retries": 2, "backoff_factor": 1.5},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 30},
        verification_requirements=["acyclic_dag_check", "resource_feasibility_check"],
    )

    # 2. Research Agent
    catalog["agent_researcher"] = AgentDefinition(
        agent_id="agent_researcher",
        role="Research Agent",
        description="Performs broad or targeted codebase searches, documentation inspection, and technical synthesis.",
        model_preference=["qwen/qwen-2.5-72b-instruct", "gemini-flash-lite-latest", "llama3:latest"],
        available_tools=["read_file", "search_workspace", "list_dir", "web_search"],
        permissions=["read_workspace", "read_docs"],
        resource_requirements={"min_ram_gb": 2, "vram_needed_gb": 0, "max_cpu_percent": 30},
        input_schema={"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        output_schema={"type": "object", "properties": {"findings": {"type": "string"}, "citations": {"type": "array"}}, "required": ["findings"]},
        memory_scope="task_local",
        timeout_seconds=60,
        retry_policy={"max_retries": 2, "backoff_factor": 2.0},
        checkpoint_policy={"on_step_complete": False, "interval_sec": 60},
        verification_requirements=["source_existence_check"],
    )

    # 3. Architect Agent
    catalog["agent_architect"] = AgentDefinition(
        agent_id="agent_architect",
        role="Architect Agent",
        description="Designs modular abstractions, class hierarchies, API contracts, and validates system invariants.",
        model_preference=["deepseek-r1", "qwen/qwen-2.5-72b-instruct"],
        available_tools=["read_file", "sse_verify_invariants", "generate_interface_spec"],
        permissions=["read_workspace", "design_interfaces"],
        resource_requirements={"min_ram_gb": 4, "vram_needed_gb": 0, "max_cpu_percent": 40},
        input_schema={"type": "object", "properties": {"spec": {"type": "string"}}, "required": ["spec"]},
        output_schema={"type": "object", "properties": {"architecture_doc": {"type": "string"}, "interfaces": {"type": "array"}}, "required": ["architecture_doc"]},
        memory_scope="session",
        timeout_seconds=60,
        retry_policy={"max_retries": 1, "backoff_factor": 1.0},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 45},
        verification_requirements=["dependency_cycle_check", "interface_completeness_check"],
    )

    # 4. Coding Agent
    catalog["agent_coder"] = AgentDefinition(
        agent_id="agent_coder",
        role="Coding Agent",
        description="Implements clean, tested, and robust code adhering to architectural specifications and language idioms.",
        model_preference=["qwen2.5-coder", "qwen/qwen-2.5-coder-32b-instruct", "qwen3:8b"],
        available_tools=["create_file", "modify_file", "read_file", "format_code"],
        permissions=["read_workspace", "write_workspace"],
        resource_requirements={"min_ram_gb": 4, "vram_needed_gb": 2, "max_cpu_percent": 80},
        input_schema={"type": "object", "properties": {"file_path": {"type": "string"}, "task": {"type": "string"}}, "required": ["file_path", "task"]},
        output_schema={"type": "object", "properties": {"modified_file": {"type": "string"}, "diff": {"type": "string"}}, "required": ["modified_file"]},
        memory_scope="task_local",
        timeout_seconds=90,
        retry_policy={"max_retries": 3, "backoff_factor": 1.5},
        checkpoint_policy={"on_file_write": True, "interval_sec": 30},
        verification_requirements=["syntax_valid_check", "ast_parse_check"],
    )

    # 5. Debugging Agent
    catalog["agent_debugger"] = AgentDefinition(
        agent_id="agent_debugger",
        role="Debugging Agent",
        description="Analyzes stack traces, reproduces error conditions, isolates root causes, and applies targeted fixes.",
        model_preference=["qwen2.5-coder", "deepseek-r1"],
        available_tools=["read_file", "modify_file", "execute_shell", "inspect_logs"],
        permissions=["read_workspace", "write_workspace", "execute_workspace_scripts"],
        resource_requirements={"min_ram_gb": 4, "vram_needed_gb": 2, "max_cpu_percent": 75},
        input_schema={"type": "object", "properties": {"error_trace": {"type": "string"}}, "required": ["error_trace"]},
        output_schema={"type": "object", "properties": {"root_cause": {"type": "string"}, "patch": {"type": "string"}}, "required": ["root_cause"]},
        memory_scope="task_local",
        timeout_seconds=90,
        retry_policy={"max_retries": 2, "backoff_factor": 2.0},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 30},
        verification_requirements=["error_reproduction_clearance"],
    )

    # 6. Testing Agent
    catalog["agent_tester"] = AgentDefinition(
        agent_id="agent_tester",
        role="Testing Agent",
        description="Authors test suites, generates property-based tests, executes unit and integration test harnesses.",
        model_preference=["qwen/qwen-2.5-72b-instruct", "qwen3:8b"],
        available_tools=["execute_shell", "read_file", "create_file", "parse_test_results"],
        permissions=["read_workspace", "write_test_files", "execute_tests"],
        resource_requirements={"min_ram_gb": 4, "vram_needed_gb": 0, "max_cpu_percent": 70},
        input_schema={"type": "object", "properties": {"target_module": {"type": "string"}}, "required": ["target_module"]},
        output_schema={"type": "object", "properties": {"tests_passed": {"type": "integer"}, "tests_failed": {"type": "integer"}}, "required": ["tests_passed"]},
        memory_scope="task_local",
        timeout_seconds=120,
        retry_policy={"max_retries": 2, "backoff_factor": 1.5},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 45},
        verification_requirements=["exit_code_zero_check"],
    )

    # 7. Security Agent
    catalog["agent_security"] = AgentDefinition(
        agent_id="agent_security",
        role="Security Agent",
        description="Scans code and execution commands for privilege escalation, injection vectors, and invariant violations.",
        model_preference=["deepseek-r1", "qwen/qwen-2.5-72b-instruct"],
        available_tools=["audit_command_ast", "scan_secrets", "verify_threshold_quorum"],
        permissions=["read_workspace", "read_audit_logs"],
        resource_requirements={"min_ram_gb": 2, "vram_needed_gb": 0, "max_cpu_percent": 40},
        input_schema={"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]},
        output_schema={"type": "object", "properties": {"is_safe": {"type": "boolean"}, "risk_assessment": {"type": "string"}}, "required": ["is_safe"]},
        memory_scope="session",
        timeout_seconds=30,
        retry_policy={"max_retries": 1, "backoff_factor": 1.0},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 30},
        verification_requirements=["zero_privilege_leak_check"],
    )

    # 8. Desktop Automation Agent
    catalog["agent_desktop"] = AgentDefinition(
        agent_id="agent_desktop",
        role="Desktop Automation Agent",
        description="Drives native Windows desktop applications, interacts with UI automation elements, and manages workspaces.",
        model_preference=["llama-3.2", "qwen3:4b"],
        available_tools=["open_app", "close_app", "type_text", "snapshot_ui_tree", "click_element"],
        permissions=["execute_desktop_actions", "manage_local_windows"],
        resource_requirements={"min_ram_gb": 2, "vram_needed_gb": 0, "max_cpu_percent": 50},
        input_schema={"type": "object", "properties": {"action": {"type": "string"}, "app": {"type": "string"}}, "required": ["action"]},
        output_schema={"type": "object", "properties": {"success": {"type": "boolean"}, "window_status": {"type": "string"}}, "required": ["success"]},
        memory_scope="task_local",
        timeout_seconds=30,
        retry_policy={"max_retries": 2, "backoff_factor": 1.5},
        checkpoint_policy={"on_action_complete": True, "interval_sec": 15},
        verification_requirements=["process_status_check"],
    )

    # 9. Voice Agent
    catalog["agent_voice"] = AgentDefinition(
        agent_id="agent_voice",
        role="Voice Agent",
        description="Synthesizes warm conversational voice responses via Kokoro ONNX and manages audio pipeline routing.",
        model_preference=["llama-3.2", "kokoro-onnx"],
        available_tools=["synthesize_speech", "route_audio_focus", "switch_voice_profile"],
        permissions=["control_audio_hal", "stream_tts"],
        resource_requirements={"min_ram_gb": 2, "vram_needed_gb": 0, "max_cpu_percent": 40},
        input_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
        output_schema={"type": "object", "properties": {"audio_path": {"type": "string"}, "duration_sec": {"type": "number"}}, "required": ["audio_path"]},
        memory_scope="session",
        timeout_seconds=20,
        retry_policy={"max_retries": 2, "backoff_factor": 1.0},
        checkpoint_policy={"on_step_complete": False, "interval_sec": 30},
        verification_requirements=["audio_playable_check"],
    )

    # 10. Android Agent
    catalog["agent_android"] = AgentDefinition(
        agent_id="agent_android",
        role="Android Agent",
        description="Controls mobile integrations, dispatches intents to WhatsApp/Notes/Dialer, and manages mobile services.",
        model_preference=["qwen/qwen-2.5-72b-instruct", "llama-3.2"],
        available_tools=["adb_intent", "adb_broadcast", "inspect_logcat", "screencap"],
        permissions=["execute_adb", "read_mobile_logs"],
        resource_requirements={"min_ram_gb": 2, "vram_needed_gb": 0, "max_cpu_percent": 30},
        input_schema={"type": "object", "properties": {"intent": {"type": "string"}}, "required": ["intent"]},
        output_schema={"type": "object", "properties": {"dispatch_success": {"type": "boolean"}, "logcat_snip": {"type": "string"}}, "required": ["dispatch_success"]},
        memory_scope="task_local",
        timeout_seconds=30,
        retry_policy={"max_retries": 2, "backoff_factor": 2.0},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 30},
        verification_requirements=["logcat_acknowledgment_check"],
    )

    # 11. Infrastructure Agent
    catalog["agent_infra"] = AgentDefinition(
        agent_id="agent_infra",
        role="Infrastructure Agent",
        description="Monitors network topology, balances compute between PC-A and PC-B, and tests WinRM/SMB/ADB health.",
        model_preference=["qwen/qwen-2.5-72b-instruct", "qwen3:4b"],
        available_tools=["ping_node", "inspect_winrm", "inspect_smb", "measure_latency"],
        permissions=["read_network_telemetry", "execute_connectivity_probes"],
        resource_requirements={"min_ram_gb": 2, "vram_needed_gb": 0, "max_cpu_percent": 25},
        input_schema={"type": "object", "properties": {"node": {"type": "string"}}, "required": ["node"]},
        output_schema={"type": "object", "properties": {"is_online": {"type": "boolean"}, "latency_ms": {"type": "number"}}, "required": ["is_online"]},
        memory_scope="persistent",
        timeout_seconds=25,
        retry_policy={"max_retries": 2, "backoff_factor": 1.5},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 45},
        verification_requirements=["tcp_socket_open_check"],
    )

    # 12. Deployment Agent
    catalog["agent_deployment"] = AgentDefinition(
        agent_id="agent_deployment",
        role="Deployment Agent",
        description="Builds production binaries, compiles Android APKs, executes git operations, and verifies remote pushes.",
        model_preference=["qwen/qwen-2.5-72b-instruct", "qwen3:8b"],
        available_tools=["git_commit", "git_push", "run_gradle_build", "verify_release_bin"],
        permissions=["write_git", "execute_build_tools"],
        resource_requirements={"min_ram_gb": 8, "vram_needed_gb": 0, "max_cpu_percent": 90},
        input_schema={"type": "object", "properties": {"build_target": {"type": "string"}}, "required": ["build_target"]},
        output_schema={"type": "object", "properties": {"commit_hash": {"type": "string"}, "status": {"type": "string"}}, "required": ["status"]},
        memory_scope="persistent",
        timeout_seconds=300,
        retry_policy={"max_retries": 1, "backoff_factor": 2.0},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 60},
        verification_requirements=["clean_working_tree_check", "remote_tracking_check"],
    )

    # 13. Independent Reviewer
    catalog["agent_reviewer"] = AgentDefinition(
        agent_id="agent_reviewer",
        role="Independent Reviewer",
        description="Performs adversarial independent verification of task results, confirming evidence before final completion.",
        model_preference=["deepseek-r1", "qwen/qwen-2.5-72b-instruct"],
        available_tools=["verify_file_disk", "verify_checksum", "verify_test_logs", "verify_sse_invariants"],
        permissions=["read_workspace", "read_telemetry", "read_all_evidence"],
        resource_requirements={"min_ram_gb": 4, "vram_needed_gb": 0, "max_cpu_percent": 40},
        input_schema={"type": "object", "properties": {"task_id": {"type": "string"}, "evidence": {"type": "object"}}, "required": ["task_id", "evidence"]},
        output_schema={"type": "object", "properties": {"verified": {"type": "boolean"}, "audit_findings": {"type": "string"}}, "required": ["verified"]},
        memory_scope="persistent",
        timeout_seconds=45,
        retry_policy={"max_retries": 1, "backoff_factor": 1.0},
        checkpoint_policy={"on_step_complete": True, "interval_sec": 30},
        verification_requirements=["physical_evidence_presence_check"],
    )

    # 14. Memory and Knowledge Agent
    catalog["agent_memory"] = AgentDefinition(
        agent_id="agent_memory",
        role="Memory and Knowledge Agent",
        description="Maintains biographical identity profiles, logs episodic hash chains, and extracts long-term learnings.",
        model_preference=["qwen/qwen-2.5-72b-instruct", "gemini-flash-lite-latest"],
        available_tools=["query_knowledge_store", "append_ledger_record", "extract_learnings", "summarize_session"],
        permissions=["read_memory", "write_memory", "append_ledger"],
        resource_requirements={"min_ram_gb": 2, "vram_needed_gb": 0, "max_cpu_percent": 30},
        input_schema={"type": "object", "properties": {"event": {"type": "string"}, "data": {"type": "object"}}, "required": ["event"]},
        output_schema={"type": "object", "properties": {"stored_key": {"type": "string"}, "hash": {"type": "string"}}, "required": ["stored_key"]},
        memory_scope="persistent",
        timeout_seconds=30,
        retry_policy={"max_retries": 2, "backoff_factor": 1.5},
        checkpoint_policy={"on_append": True, "interval_sec": 30},
        verification_requirements=["cryptographic_hash_validity_check"],
    )

    return catalog

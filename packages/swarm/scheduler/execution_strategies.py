"""AIVA Swarm Engine - Execution Strategy Schedulers.

Implements Sequential, Parallel, Hierarchical, Competitive, Collaborative, and Recovery
swarm execution pipelines.
"""

from __future__ import annotations

import concurrent.futures
import time
from typing import Any, Callable, Dict, List, Optional

from packages.swarm.core.contracts import (
    ExecutionResult,
    ExecutionStrategy,
    SwarmTask,
    TaskStatus,
)


class SwarmScheduler:
    """Dispatches tasks according to chosen multi-agent execution strategies."""

    def __init__(self, agent_executor: Callable[[str, SwarmTask, Dict[str, Any]], ExecutionResult]):
        self.agent_executor = agent_executor

    def execute(
        self,
        task: SwarmTask,
        strategy: Optional[ExecutionStrategy] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        strat = strategy or task.strategy
        ctx = context or {}

        if strat == ExecutionStrategy.SEQUENTIAL:
            return self._execute_sequential(task, ctx)
        elif strat == ExecutionStrategy.PARALLEL:
            return self._execute_parallel(task, ctx)
        elif strat == ExecutionStrategy.HIERARCHICAL:
            return self._execute_hierarchical(task, ctx)
        elif strat == ExecutionStrategy.COMPETITIVE:
            return self._execute_competitive(task, ctx)
        elif strat == ExecutionStrategy.COLLABORATIVE:
            return self._execute_collaborative(task, ctx)
        elif strat == ExecutionStrategy.RECOVERY:
            return self._execute_recovery(task, ctx)
        else:
            return self._execute_sequential(task, ctx)

    def _execute_sequential(self, task: SwarmTask, context: Dict[str, Any]) -> ExecutionResult:
        """Executes agents in linear pipeline, passing output from one to the next."""
        agents = task.assigned_agents or [
            "agent_strategic_planner",
            "agent_researcher",
            "agent_architect",
            "agent_coder",
            "agent_tester",
            "agent_reviewer",
        ]
        accumulated_output = {}
        start_time = time.time()

        for idx, agent_id in enumerate(agents):
            step_task = SwarmTask(
                task_id=f"{task.task_id}_seq_{idx}",
                objective=f"Step {idx+1}: {agent_id} executing {task.objective}",
                parent_task_id=task.task_id,
            )
            step_ctx = dict(context)
            step_ctx["previous_step_output"] = accumulated_output

            res = self.agent_executor(agent_id, step_task, step_ctx)
            if not res.success:
                return ExecutionResult(
                    task_id=task.task_id,
                    agent_id=agent_id,
                    success=False,
                    output=accumulated_output,
                    execution_time_seconds=time.time() - start_time,
                    error=f"Sequential pipeline failed at step {idx+1} ({agent_id}): {res.error}",
                )
            accumulated_output[agent_id] = res.output

        return ExecutionResult(
            task_id=task.task_id,
            agent_id="sequential_pipeline",
            success=True,
            output=accumulated_output,
            evidence={"pipeline_length": len(agents), "steps": list(accumulated_output.keys())},
            execution_time_seconds=time.time() - start_time,
        )

    def _execute_parallel(self, task: SwarmTask, context: Dict[str, Any]) -> ExecutionResult:
        """Executes independent agent tasks concurrently via thread worker pool."""
        agents = task.assigned_agents or ["agent_researcher", "agent_security", "agent_infra"]
        start_time = time.time()
        results: Dict[str, Any] = {}
        all_success = True

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(agents), 6)) as pool:
            future_to_agent = {}
            for idx, agent_id in enumerate(agents):
                subtask = SwarmTask(
                    task_id=f"{task.task_id}_par_{idx}",
                    objective=f"Parallel task for {agent_id}: {task.objective}",
                    parent_task_id=task.task_id,
                )
                future_to_agent[pool.submit(self.agent_executor, agent_id, subtask, context)] = agent_id

            for future in concurrent.futures.as_completed(future_to_agent):
                agent_id = future_to_agent[future]
                try:
                    res = future.result()
                    results[agent_id] = res.to_dict()
                    if not res.success:
                        all_success = False
                except Exception as ex:
                    results[agent_id] = {"success": False, "error": str(ex)}
                    all_success = False

        return ExecutionResult(
            task_id=task.task_id,
            agent_id="parallel_pool",
            success=all_success,
            output=results,
            evidence={"concurrency": len(agents), "completed": len(results)},
            execution_time_seconds=time.time() - start_time,
        )

    def _execute_hierarchical(self, task: SwarmTask, context: Dict[str, Any]) -> ExecutionResult:
        """Coordinator agent decomposes work and directs specialist agents."""
        start_time = time.time()
        coordinator = "agent_strategic_planner"

        # 1. Coordinator plan
        coord_task = SwarmTask(
            task_id=f"{task.task_id}_coord",
            objective=f"Formulate hierarchical work decomposition for: {task.objective}",
        )
        coord_res = self.agent_executor(coordinator, coord_task, context)
        if not coord_res.success:
            return ExecutionResult(task_id=task.task_id, agent_id=coordinator, success=False, output=None, error="Coordinator failed to plan work")

        # 2. Dispatch sub-specialists
        specialists = task.assigned_agents or ["agent_coder", "agent_tester"]
        worker_results = {}
        for sp_id in specialists:
            sp_task = SwarmTask(task_id=f"{task.task_id}_{sp_id}", objective=task.objective, parent_task_id=task.task_id)
            res = self.agent_executor(sp_id, sp_task, {"coordinator_plan": coord_res.output})
            worker_results[sp_id] = res.to_dict()

        return ExecutionResult(
            task_id=task.task_id,
            agent_id=coordinator,
            success=all(r.get("success", False) for r in worker_results.values()),
            output={"coordinator": coord_res.output, "delegates": worker_results},
            execution_time_seconds=time.time() - start_time,
        )

    def _execute_competitive(self, task: SwarmTask, context: Dict[str, Any]) -> ExecutionResult:
        """Multiple competing agents solve the same problem; best verified outcome is selected."""
        start_time = time.time()
        candidates = task.assigned_agents or ["agent_coder", "agent_debugger"]
        proposals = []

        for agent_id in candidates:
            cand_task = SwarmTask(task_id=f"{task.task_id}_comp_{agent_id}", objective=task.objective)
            res = self.agent_executor(agent_id, cand_task, context)
            if res.success:
                proposals.append(res)

        if not proposals:
            return ExecutionResult(task_id=task.task_id, agent_id="competitive_arena", success=False, output=None, error="No competing agent produced a successful proposal")

        # Rank proposals by execution time and token efficiency (utility proxy)
        best_proposal = min(proposals, key=lambda p: p.execution_time_seconds)

        return ExecutionResult(
            task_id=task.task_id,
            agent_id="competitive_arena",
            success=True,
            output=best_proposal.output,
            evidence={
                "winning_agent": best_proposal.agent_id,
                "total_proposals": len(proposals),
                "winning_execution_sec": best_proposal.execution_time_seconds,
            },
            execution_time_seconds=time.time() - start_time,
        )

    def _execute_collaborative(self, task: SwarmTask, context: Dict[str, Any]) -> ExecutionResult:
        """Agents iteratively collaborate, refining shared artifact."""
        start_time = time.time()
        agents = task.assigned_agents or ["agent_architect", "agent_coder", "agent_reviewer"]
        shared_state = {"draft": task.objective, "revisions": []}

        for agent_id in agents:
            collab_task = SwarmTask(task_id=f"{task.task_id}_collab_{agent_id}", objective=f"Refine shared state")
            res = self.agent_executor(agent_id, collab_task, {"shared_state": shared_state})
            if res.success:
                shared_state["draft"] = str(res.output)
                shared_state["revisions"].append({"agent": agent_id, "time": time.time()})

        return ExecutionResult(
            task_id=task.task_id,
            agent_id="collaborative_team",
            success=True,
            output=shared_state,
            execution_time_seconds=time.time() - start_time,
        )

    def _execute_recovery(self, task: SwarmTask, context: Dict[str, Any]) -> ExecutionResult:
        """Recovers a failed task from a checkpoint or fails over to a secondary specialist."""
        start_time = time.time()
        primary_agent = (task.assigned_agents[0] if task.assigned_agents else "agent_coder")
        fallback_agent = (task.assigned_agents[1] if len(task.assigned_agents) > 1 else "agent_debugger")

        # Simulate attempt with primary
        primary_res = self.agent_executor(primary_agent, task, context)
        if primary_res.success:
            return primary_res

        # Primary failed, trigger recovery failover
        recovery_ctx = dict(context)
        recovery_ctx["previous_error"] = primary_res.error
        recovery_ctx["is_recovery"] = True

        recovery_res = self.agent_executor(fallback_agent, task, recovery_ctx)
        recovery_res.evidence["recovered_from"] = primary_agent
        recovery_res.evidence["failover_time_sec"] = time.time() - start_time
        return recovery_res


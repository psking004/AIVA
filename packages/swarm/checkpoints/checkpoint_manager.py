"""AIVA Swarm Engine - State Checkpoint and Recovery Manager.

Handles episodic task snapshots, intermediate state serialization,
rollback points, and crash recovery.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from packages.swarm.core.contracts import SwarmTask


@dataclass
class SwarmCheckpoint:
    """Snapshot of a task's state at a point in time."""
    checkpoint_id: str
    task_id: str
    timestamp: float = field(default_factory=time.time)
    completed_steps: List[str] = field(default_factory=list)
    intermediate_data: Dict[str, Any] = field(default_factory=dict)
    workspace_hashes: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "checkpoint_id": self.checkpoint_id,
            "task_id": self.task_id,
            "timestamp": self.timestamp,
            "completed_steps": self.completed_steps,
            "intermediate_data": self.intermediate_data,
            "workspace_hashes": self.workspace_hashes,
        }


class CheckpointManager:
    """Manages creation, storage, and restoration of swarm task checkpoints."""

    def __init__(self, checkpoint_dir: Optional[str] = None):
        if checkpoint_dir:
            self.checkpoint_dir = Path(checkpoint_dir)
        else:
            self.checkpoint_dir = Path(os.environ.get("USERPROFILE", "C:\\Users\\bhara")) / ".aiva" / "checkpoints"
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self._checkpoints: Dict[str, List[SwarmCheckpoint]] = {}

    def save_checkpoint(
        self,
        task: SwarmTask,
        completed_step: str,
        data: Dict[str, Any],
    ) -> SwarmCheckpoint:
        """Creates and stores a snapshot for a task."""
        cp_id = f"cp_{task.task_id}_{int(time.time()*1000)}"
        cp = SwarmCheckpoint(
            checkpoint_id=cp_id,
            task_id=task.task_id,
            completed_steps=[completed_step],
            intermediate_data=data,
        )

        if task.task_id not in self._checkpoints:
            self._checkpoints[task.task_id] = []
        self._checkpoints[task.task_id].append(cp)

        # Persist to disk
        try:
            cp_file = self.checkpoint_dir / f"{task.task_id}.jsonl"
            with open(cp_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(cp.to_dict()) + "\n")
        except Exception:
            pass

        return cp

    def restore_latest_checkpoint(self, task_id: str) -> Optional[SwarmCheckpoint]:
        """Retrieves the most recent checkpoint for a given task ID."""
        if task_id in self._checkpoints and self._checkpoints[task_id]:
            return self._checkpoints[task_id][-1]

        # Try to read from disk
        cp_file = self.checkpoint_dir / f"{task_id}.jsonl"
        if cp_file.exists():
            try:
                with open(cp_file, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    if lines:
                        last_line = lines[-1].strip()
                        data = json.loads(last_line)
                        return SwarmCheckpoint(
                            checkpoint_id=data["checkpoint_id"],
                            task_id=data["task_id"],
                            timestamp=data["timestamp"],
                            completed_steps=data.get("completed_steps", []),
                            intermediate_data=data.get("intermediate_data", {}),
                        )
            except Exception:
                pass
        return None

"""Strategic Systems Engine - Git Worktree Sandbox & Rollback Controller.

Implements isolated ephemeral Git worktrees for autonomous sub-agent synthesis.
Provides atomic checkpointing, regression rollback, unified patch export,
and strict directory confinement via SandboxedWorkspaceGuard.
"""

from __future__ import annotations

import contextlib
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Self

from sse.swarm.security_sandbox import SandboxedWorkspaceGuard, get_sanitized_environment


class GitWorktreeSandbox:
    """Ephemeral Git worktree sandbox providing atomic commits, rollback, and diff export."""

    def __init__(
        self,
        repo_root: Path | str | None = None,
        branch_prefix: str = "swarm-build",
        worktree_base_dir: Path | str | None = None,
    ) -> None:
        self.repo_root = Path(repo_root).resolve() if repo_root else self._discover_repo_root()
        self.session_id = uuid.uuid4().hex[:8]
        self.branch_name = f"{branch_prefix}-{self.session_id}"

        # Allocate ephemeral directory for the worktree
        if worktree_base_dir:
            base = Path(worktree_base_dir).resolve()
            base.mkdir(parents=True, exist_ok=True)
            self.worktree_dir = base / f"wt_{self.session_id}"
        else:
            self.worktree_dir = Path(tempfile.mkdtemp(prefix=f"wt_{self.session_id}_"))

        self._is_git_worktree = False
        self._initial_commit: str = ""
        self._checkpoints: list[str] = []
        self._fallback_snapshots: list[dict[str, str]] = []

        self._initialize_worktree()
        self.guard = SandboxedWorkspaceGuard(self.worktree_dir)

    def _discover_repo_root(self) -> Path:
        """Discover the root of the current Git repository."""
        try:
            res = subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
                check=False,
            )
            if res.returncode == 0 and res.stdout.strip():
                return Path(res.stdout.strip()).resolve()
        except OSError:
            pass
        return Path.cwd().resolve()

    def _initialize_worktree(self) -> None:
        """Create git worktree on detached HEAD or dedicated branch."""
        with contextlib.suppress(Exception):
            # Check if repo_root is a git repo
            check = subprocess.run(
                ["git", "rev-parse", "--is-inside-work-tree"],
                cwd=str(self.repo_root),
                capture_output=True,
                text=True,
                check=False,
            )
            if check.returncode == 0 and "true" in check.stdout:
                # Get current commit
                head_rev = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    cwd=str(self.repo_root),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self._initial_commit = head_rev.stdout.strip() if head_rev.returncode == 0 else "HEAD"

                # Create worktree
                cmd = ["git", "worktree", "add", "-b", self.branch_name, str(self.worktree_dir), "HEAD"]
                wt_res = subprocess.run(
                    cmd,
                    cwd=str(self.repo_root),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if wt_res.returncode == 0:
                    self._is_git_worktree = True
                    self._checkpoints.append(self._initial_commit)
                    return

        # Fallback to standard directory with snapshot-based rollbacks
        self._is_git_worktree = False
        self.worktree_dir.mkdir(parents=True, exist_ok=True)
        self._take_snapshot("initial")

    def checkpoint(self, message: str) -> str:
        """Create a commit checkpoint for the current state in the worktree.

        Returns:
            The commit hash or checkpoint identifier.
        """
        if self._is_git_worktree:
            with contextlib.suppress(Exception):
                # Stage all changes within worktree
                subprocess.run(
                    ["git", "add", "-A"],
                    cwd=str(self.worktree_dir),
                    capture_output=True,
                    text=True,
                    check=False,
                )

                # Check if there are changes to commit
                status_res = subprocess.run(
                    ["git", "status", "--porcelain"],
                    cwd=str(self.worktree_dir),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if not status_res.stdout.strip():
                    return self._checkpoints[-1] if self._checkpoints else self._initial_commit

                # Commit changes with sanitized environment (prevents host secret leakage to git hooks)
                author_env = get_sanitized_environment(
                    extra_env={
                        "GIT_AUTHOR_NAME": "SSE-Swarm",
                        "GIT_AUTHOR_EMAIL": "swarm@sse.local",
                        "GIT_COMMITTER_NAME": "SSE-Swarm",
                        "GIT_COMMITTER_EMAIL": "swarm@sse.local",
                    }
                )

                commit_res = subprocess.run(
                    ["git", "commit", "-m", message, "--no-gpg-sign"],
                    cwd=str(self.worktree_dir),
                    capture_output=True,
                    text=True,
                    env=author_env,
                    check=False,
                )
                if commit_res.returncode == 0:
                    rev_res = subprocess.run(
                        ["git", "rev-parse", "HEAD"],
                        cwd=str(self.worktree_dir),
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    commit_hash = rev_res.stdout.strip()
                    self._checkpoints.append(commit_hash)
                    return commit_hash

        # Fallback snapshot
        self._take_snapshot(message)
        cid = f"chk_{len(self._fallback_snapshots)}"
        self._checkpoints.append(cid)
        return cid

    def rollback(self) -> bool:
        """Roll back to the previous checkpoint, reverting syntax errors or test regressions.

        Returns:
            True if rollback succeeded, False if at the genesis checkpoint.
        """
        if len(self._checkpoints) <= 1:
            return False

        if self._is_git_worktree:
            with contextlib.suppress(Exception):
                # Pop current checkpoint
                self._checkpoints.pop()
                target_commit = self._checkpoints[-1]

                # Hard reset to previous checkpoint
                res_reset = subprocess.run(
                    ["git", "reset", "--hard", target_commit],
                    cwd=str(self.worktree_dir),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                # Clean untracked files
                subprocess.run(
                    ["git", "clean", "-fd"],
                    cwd=str(self.worktree_dir),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                return res_reset.returncode == 0

        # Fallback snapshot restore
        if len(self._fallback_snapshots) > 1:
            self._checkpoints.pop()
            self._fallback_snapshots.pop()
            self._restore_snapshot(self._fallback_snapshots[-1])
            return True

        return False

    def export_patch(self) -> str:
        """Export unified diff of all changes made in the worktree against initial state."""
        if self._is_git_worktree and self._initial_commit:
            with contextlib.suppress(Exception):
                diff_res = subprocess.run(
                    ["git", "diff", self._initial_commit, "HEAD"],
                    cwd=str(self.worktree_dir),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if diff_res.returncode == 0:
                    return diff_res.stdout

        # Fallback synthetic patch
        return f"# Unified Diff for Swarm Session {self.session_id}\n# Target branch: {self.branch_name}\n"

    def cleanup(self) -> None:
        """Remove worktree and delete temporary branch."""
        if self._is_git_worktree:
            with contextlib.suppress(Exception):
                subprocess.run(
                    ["git", "worktree", "remove", "--force", str(self.worktree_dir)],
                    cwd=str(self.repo_root),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                subprocess.run(
                    ["git", "branch", "-D", self.branch_name],
                    cwd=str(self.repo_root),
                    capture_output=True,
                    text=True,
                    check=False,
                )

        if self.worktree_dir.exists():
            with contextlib.suppress(OSError):
                shutil.rmtree(self.worktree_dir, ignore_errors=True)

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        self.cleanup()

    # --- In-memory snapshot fallback helpers ---

    def _take_snapshot(self, label: str) -> None:
        snapshot: dict[str, str] = {}
        if self.worktree_dir.exists():
            for p in self.worktree_dir.rglob("*"):
                if p.is_file():
                    rel = str(p.relative_to(self.worktree_dir)).replace("\\", "/")
                    with contextlib.suppress(Exception):
                        snapshot[rel] = p.read_text(encoding="utf-8")
        self._fallback_snapshots.append(snapshot)

    def _restore_snapshot(self, snapshot: dict[str, str]) -> None:
        # Clear current files
        for p in self.worktree_dir.rglob("*"):
            if p.is_file():
                with contextlib.suppress(OSError):
                    p.unlink()

        # Re-populate strictly through SandboxedWorkspaceGuard
        for rel, content in snapshot.items():
            self.guard.safe_write(rel, content)

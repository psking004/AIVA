"""AIVA 2.0 - File & Productivity Intelligence Engine.

Performs structured document analysis, tabular data parsing (CSV, JSON),
accurate mathematical calculations, and verified report generation.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("DocumentEngine")


class DocumentEngine:
    """Real file productivity and data analysis engine."""

    def __init__(self, workspace_root: Optional[str] = None):
        self.workspace_root = Path(workspace_root or r"C:\Users\bhara\AIVA").resolve()

    def parse_csv(self, file_path: str) -> Dict[str, Any]:
        """Parses a CSV file and computes summary statistics on numeric columns."""
        target = (self.workspace_root / file_path).resolve()
        if not target.exists():
            return {"success": False, "error": f"File {file_path} not found"}

        try:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                headers = reader.fieldnames or []

            # Compute column statistics
            stats = {}
            for col in headers:
                numeric_vals = []
                for r in rows:
                    raw_val = r.get(col, "").strip().replace("$", "").replace(",", "")
                    try:
                        numeric_vals.append(float(raw_val))
                    except ValueError:
                        pass
                if numeric_vals:
                    stats[col] = {
                        "count": len(numeric_vals),
                        "sum": round(sum(numeric_vals), 2),
                        "mean": round(sum(numeric_vals) / len(numeric_vals), 2),
                        "min": min(numeric_vals),
                        "max": max(numeric_vals),
                    }

            return {
                "success": True,
                "file": file_path,
                "row_count": len(rows),
                "headers": headers,
                "numeric_statistics": stats,
                "rows_sample": rows[:5],
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def generate_csv_report(self, file_path: str, headers: List[str], rows: List[List[Any]]) -> Dict[str, Any]:
        """Generates a structured CSV file with verifiable rows."""
        target = (self.workspace_root / file_path).resolve()
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            with open(target, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(headers)
                writer.writerows(rows)
            return {
                "success": True,
                "file": file_path,
                "path": str(target),
                "rows_written": len(rows),
                "bytes": target.stat().st_size,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def generate_markdown_report(self, file_path: str, title: str, sections: Dict[str, str]) -> Dict[str, Any]:
        """Generates a structured Markdown report file."""
        target = (self.workspace_root / file_path).resolve()
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            lines = [f"# {title}\n", f"**Generated:** {Path(file_path).name}\n\n"]
            for sec_title, content in sections.items():
                lines.append(f"## {sec_title}\n\n{content}\n\n")
            target.write_text("".join(lines), encoding="utf-8")
            return {
                "success": True,
                "file": file_path,
                "path": str(target),
                "bytes": target.stat().st_size,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

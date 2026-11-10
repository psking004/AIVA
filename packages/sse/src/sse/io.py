"""Input/output helpers for game documents."""

from __future__ import annotations

import json
from pathlib import Path

from sse.models import FiniteNormalFormGame


def load_game(path: str | Path) -> FiniteNormalFormGame:
    source = Path(path)
    with source.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("The game document root must be a JSON object.")
    return FiniteNormalFormGame.from_dict(data)


def dump_json(data: object) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False)

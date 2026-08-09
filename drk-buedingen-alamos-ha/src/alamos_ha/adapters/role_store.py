"""Speichert die aktuelle Rolle in einer kleinen JSON-Datei, damit sie einen Neustart des
Programms bzw. des Rechners übersteht."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from alamos_ha.models import NodeRole


class JsonFileRoleStateStore:
    def __init__(self, file_path: str | Path) -> None:
        self._file_path = Path(file_path)

    def load_role(self) -> NodeRole:
        try:
            data = json.loads(self._file_path.read_text(encoding="utf-8"))
            return NodeRole(data["role"])
        except (FileNotFoundError, json.JSONDecodeError, KeyError, ValueError):
            return NodeRole.UNKNOWN

    def save_role(self, role: NodeRole) -> None:
        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        data = {"role": role.value, "updated_at_utc": datetime.now(timezone.utc).isoformat()}
        self._file_path.write_text(json.dumps(data), encoding="utf-8")

"""Persistent download history stored as JSON.

History entries are lightweight serialized task dicts for terminal states
(completed / error / cancelled). They survive app restarts and are merged
with live tasks when serving ``/api/tasks``.
"""
from __future__ import annotations

import json
import os
import threading
from typing import Any, Dict, List

HERE = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(HERE, os.pardir, "data", "history.json")

TERMINAL = {"completed", "error", "cancelled"}


class HistoryStore:
    def __init__(self, path: str = HISTORY_FILE, max_entries: int = 200) -> None:
        self.path = path
        self._max_entries = max_entries
        self._lock = threading.Lock()
        self._entries: List[Dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        try:
            if os.path.exists(self.path):
                with open(self.path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, list):
                    self._entries = [e for e in data if isinstance(e, dict)]
        except (json.JSONDecodeError, OSError):
            self._entries = []

    def append(self, entry: Dict[str, Any]) -> None:
        with self._lock:
            self._entries = [e for e in self._entries if e.get("id") != entry.get("id")]
            self._entries.append(entry)
            if len(self._entries) > self._max_entries:
                self._entries = self._entries[-self._max_entries :]
            self._save_locked()

    def all(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._entries)

    def _save_locked(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(self._entries, fh, indent=2, ensure_ascii=False)

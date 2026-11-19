"""Persistent user settings stored as JSON alongside the app."""
from __future__ import annotations

import json
import os
from typing import Any, Dict

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(HERE, os.pardir, "data", "settings.json")

DEFAULTS: Dict[str, Any] = {
    "default_quality": "best",
    "default_format": "video",
    "default_output_dir": "",
    "subtitles": True,
    "thumbnail": True,
    "max_simultaneous_downloads": 3,
    "language": "en",
    "theme": "dark",
    "ffmpeg_path": "",
    "proxy": "",
    "cookies_file": "",
}


class SettingsStore:
    def __init__(self, path: str = SETTINGS_FILE) -> None:
        self.path = path
        self._data: Dict[str, Any] = dict(DEFAULTS)
        self._load()

    def _load(self) -> None:
        try:
            if os.path.exists(self.path):
                with open(self.path, "r", encoding="utf-8") as fh:
                    loaded = json.load(fh)
                self._data.update({k: v for k, v in loaded.items() if k in DEFAULTS})
        except (json.JSONDecodeError, OSError):
            pass

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default if default is not None else DEFAULTS.get(key))

    def all(self) -> Dict[str, Any]:
        return dict(self._data)

    def update(self, values: Dict[str, Any]) -> Dict[str, Any]:
        for key, value in values.items():
            if key in DEFAULTS:
                self._data[key] = value
        self._save()
        return self.all()

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(self._data, fh, indent=2, ensure_ascii=False)

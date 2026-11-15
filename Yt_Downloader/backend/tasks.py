"""Thread-safe in-memory task registry for active downloads.

A task holds the live state of a single download so that the API can
expose progress, speed, ETA and status without the UI ever touching
yt-dlp directly.
"""
from __future__ import annotations

import threading
import time
import uuid
from enum import Enum
from typing import Any, Optional


class Status(str, Enum):
    QUEUED = "queued"
    ANALYZING = "analyzing"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


class Task:
    """A single download task."""

    def __init__(self, url: str, options: dict[str, Any]) -> None:
        self.id: str = uuid.uuid4().hex[:12]
        self.url: str = url
        self.options: dict[str, Any] = options
        self.status: Status = Status.QUEUED
        self.title: Optional[str] = None
        self.thumbnail: Optional[str] = None
        self.channel: Optional[str] = None
        self.duration: Optional[float] = None
        self.percent: float = 0.0
        self.downloaded_bytes: float = 0.0
        self.total_bytes: Optional[float] = None
        self.speed: Optional[str] = None
        self.eta: Optional[str] = None
        self.filepath: Optional[str] = None
        self.filesize: Optional[str] = None
        self.error: Optional[str] = None
        self.created_at: float = time.time()
        self.finished_at: Optional[float] = None
        self._cancelled = threading.Event()
        self._lock = threading.Lock()

    # -- thread-safe setters -------------------------------------------------
    def set_status(self, status: Status) -> None:
        with self._lock:
            self.status = status
            if status in (Status.COMPLETED, Status.ERROR, Status.CANCELLED):
                self.finished_at = time.time()

    def update_progress(self, **kwargs: Any) -> None:
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self, key):
                    setattr(self, key, value)

    def request_cancel(self) -> None:
        self._cancelled.set()

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()

    # -- serialization -------------------------------------------------------
    def to_dict(self, include_options: bool = False) -> dict[str, Any]:
        with self._lock:
            data: dict[str, Any] = {
                "id": self.id,
                "url": self.url,
                "status": self.status.value,
                "title": self.title,
                "thumbnail": self.thumbnail,
                "channel": self.channel,
                "duration": self.duration,
                "percent": round(self.percent, 1),
                "downloaded_bytes": self.downloaded_bytes,
                "total_bytes": self.total_bytes,
                "speed": self.speed,
                "eta": self.eta,
                "filepath": self.filepath,
                "filesize": self.filesize,
                "error": self.error,
                "created_at": self.created_at,
                "finished_at": self.finished_at,
            }
            if include_options:
                data["options"] = self.options
            return data


class TaskRegistry:
    """Holds all tasks (active + finished) for the process lifetime."""

    def __init__(self, max_history: int = 100) -> None:
        self._tasks: dict[str, Task] = {}
        self._lock = threading.Lock()
        self._max_history = max_history

    def create(self, url: str, options: dict[str, Any]) -> Task:
        task = Task(url, options)
        with self._lock:
            self._tasks[task.id] = task
            completed_ids = [
                tid
                for tid, t in self._tasks.items()
                if t.status != Status.QUEUED
            ]
            if len(completed_ids) > self._max_history:
                for tid in completed_ids[: -self._max_history]:
                    self._tasks.pop(tid, None)
        return task

    def get(self, task_id: str) -> Optional[Task]:
        with self._lock:
            return self._tasks.get(task_id)

    def all(self) -> list[Task]:
        with self._lock:
            return list(self._tasks.values())

    def queued(self) -> list[Task]:
        with self._lock:
            return [t for t in self._tasks.values() if t.status == Status.QUEUED]

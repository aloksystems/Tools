"""Flask application for YT Downloader (Obsidian Violet design).

This is the single web backend shared by both the browser-based web app
and the pywebview desktop wrapper.
"""
from __future__ import annotations

import json
import os

from flask import Flask, jsonify, render_template, request

from backend.downloader import DownloadErrorWithMessage, DownloadManager
from backend.history import HistoryStore
from backend.settings import SettingsStore
from backend.tasks import Status

HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

settings = SettingsStore()
history = HistoryStore()
manager = DownloadManager(on_complete=lambda task: history.append(task.to_dict()))


def _task_payload(task, include_options: bool = False):
    return task.to_dict(include_options=include_options)


def _download_options(data):
    return {
        "quality": data.get("quality", settings.get("default_quality")),
        "format": data.get("format", settings.get("default_format")),
        "output_dir": data.get("output_dir") or settings.get("default_output_dir"),
        "subtitles": bool(data.get("subtitles", settings.get("subtitles"))),
        "thumbnail": bool(data.get("thumbnail", settings.get("thumbnail"))),
        "playlist": bool(data.get("playlist", True)),
    }


@app.get("/")
def home():
    return render_template("home.html")


@app.get("/downloads")
def downloads_page():
    return render_template("downloads.html")


@app.get("/settings")
def settings_page():
    return render_template("settings.html")


@app.get("/history")
def history_page():
    return render_template("history.html")


@app.get("/about")
def about_page():
    return render_template("about.html")


# ------------------------------------------------------------- API routes --
@app.post("/api/analyze")
def api_analyze():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 400
    try:
        info = manager.analyze(url)
        return jsonify({"ok": True, "info": info})
    except DownloadErrorWithMessage as exc:
        return jsonify({"ok": False, "error": str(exc)}), 422


@app.post("/api/download")
def api_download():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 400

    task = manager.start_download(url, _download_options(data))
    return jsonify({"ok": True, "task": _task_payload(task, include_options=True)})


@app.post("/api/download_batch")
def api_download_batch():
    data = request.get_json(silent=True) or {}
    urls = [u.strip() for u in data.get("urls", []) if isinstance(u, str) and u.strip()]
    if not urls:
        return jsonify({"error": "At least one URL is required"}), 400

    options = _download_options(data)
    queued = []
    for url in urls[:50]:  # cap batch size to avoid abuse
        task = manager.start_download(url, dict(options))
        queued.append(_task_payload(task, include_options=True))
    return jsonify({"ok": True, "queued": queued})


@app.get("/api/tasks")
def api_tasks():
    status = request.args.get("status")
    live = [t.to_dict() for t in manager.registry.all()]
    live_ids = {t["id"] for t in live}
    # Merge persisted terminal history (older runs) with live tasks.
    merged = live + [h for h in history.all() if h.get("id") not in live_ids]
    if status:
        merged = [t for t in merged if t.get("status") == status]
    merged.sort(key=lambda t: t.get("created_at", 0), reverse=True)
    return jsonify({"ok": True, "tasks": merged})


@app.post("/api/tasks/<task_id>/cancel")
def api_cancel(task_id):
    task = manager.registry.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    task.request_cancel()
    return jsonify({"ok": True})


@app.get("/api/settings")
def api_get_settings():
    return jsonify({"ok": True, "settings": settings.all()})


@app.post("/api/settings")
def api_update_settings():
    data = request.get_json(silent=True) or {}
    values = {k: v for k, v in data.items() if v is not None}
    return jsonify({"ok": True, "settings": settings.update(values)})


@app.get("/api/health")
def api_health():
    return jsonify({"ok": True, "status": "healthy"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)

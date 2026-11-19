"""Flask application for YT Downloader (Obsidian Violet design).

This is the single web backend shared by both the browser-based web app
and the pywebview desktop wrapper.
"""
from __future__ import annotations

import json
import os
import urllib.parse

from flask import Flask, abort, jsonify, render_template, request, send_file

from backend.downloader import DEFAULT_OUTPUT_DIR, DownloadErrorWithMessage, DownloadManager
from backend.history import HistoryStore
from backend.settings import SettingsStore
from backend.tasks import Status

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
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
        "cookies_file": settings.get("cookies_file"),
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
        info = manager.analyze(url, _download_options(data))
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


@app.post("/api/cookies")
def api_upload_cookies():
    """Accept an uploaded Netscape-format cookies.txt and store it for yt-dlp."""
    uploaded = request.files.get("file")
    if uploaded is None or not uploaded.filename:
        abort(400, description="No file provided")
    os.makedirs(DATA_DIR, exist_ok=True)
    dest = os.path.join(DATA_DIR, "cookies.txt")
    uploaded.save(dest)
    settings.update({"cookies_file": dest})
    return jsonify({"ok": True, "settings": settings.all()})


@app.get("/api/health")
def api_health():
    return jsonify({"ok": True, "status": "healthy"})


# ------------------------------------------------------- saved files (serving) --
# Media extensions we recognize as completed downloads.
SAVED_MEDIA_EXTS = (".mp4", ".mkv", ".webm", ".mp3", ".flac", ".m4a", ".mov", ".opus")


def _saved_roots():
    """Directories we are willing to list/serve files from."""
    roots = []
    default = DEFAULT_OUTPUT_DIR
    configured = settings.get("default_output_dir")
    for d in (default, configured):
        if d and os.path.isdir(d):
            roots.append(os.path.realpath(d))
    # De-duplicate while preserving order.
    seen = set()
    unique = []
    for r in roots:
        if r not in seen:
            seen.add(r)
            unique.append(r)
    return unique


@app.get("/api/files")
def api_files():
    """List completed download files across the known output directories."""
    files = []
    for root in _saved_roots():
        try:
            for name in os.listdir(root):
                full = os.path.join(root, name)
                if not os.path.isfile(full):
                    continue
                if not name.lower().endswith(SAVED_MEDIA_EXTS):
                    continue
                stat = os.stat(full)
                files.append(
                    {
                        "name": name,
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                        "dir": os.path.basename(root),
                        "url": apiUrl_for_download(name),
                    }
                )
        except OSError:
            continue
    files.sort(key=lambda f: f["modified"], reverse=True)
    return jsonify({"ok": True, "files": files})


def apiUrl_for_download(name: str) -> str:
    """Build the absolute (or relative) download URL for a saved file."""
    encoded = urllib.parse.quote(name)
    return f"{request.script_root}/api/files/download?path={encoded}"


@app.get("/api/files/download")
def api_file_download():
    """Serve a saved media file as an attachment (device download).

    Only files living directly inside a known output directory are served;
    any path traversal is rejected.
    """
    name = request.args.get("path", "")
    if not name or os.path.basename(name) != name:
        abort(400, description="Invalid file path")
    for root in _saved_roots():
        candidate = os.path.realpath(os.path.join(root, name))
        if candidate.startswith(root + os.sep) and os.path.isfile(candidate):
            return send_file(
                candidate,
                as_attachment=True,
                download_name=name,
                conditional=True,
            )
    abort(404, description="File not found")


if __name__ == "__main__":
    # Bind to all interfaces and honor $PORT (Railway/Render) for hosting.
    port = int(os.environ.get("PORT", "5001"))
    # Use a single process; the task registry is in-memory/thread-based.
    # For production, run with gunicorn: gunicorn app:app --workers 1 --threads 8
    app.run(host="0.0.0.0", port=port, debug=False)

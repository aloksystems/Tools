"""yt-dlp orchestration for YT Downloader.

This module ports the download logic from the original ``main.py`` (a
customtkinter desktop app) into a reusable, framework-agnostic layer that
both the Flask web app and the pywebview desktop wrapper can share.

Supported features:
  * Video download (best video+audio, optionally capped by resolution).
  * Audio extraction to MP3 (via FFmpeg).
  * Playlist handling.
  * Subtitles (English + auto-generated).
  * Thumbnail download + embedding.
  * Metadata embedding.
  * Live progress / speed / ETA via a task registry.
"""
from __future__ import annotations

import os
import re
import threading
from typing import Any, Dict, Optional

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from backend.tasks import Status, Task, TaskRegistry

# ---------------------------------------------------------------- constants --
DEFAULT_OUTPUT_DIR = os.path.join(
    os.path.expanduser("~"), "Downloads", "YouTube"
)

BAD_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*]')

# Resolution heights supported for quality caps (best is keyed as "best").
RESOLUTIONS = ["best", "4320p", "2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"]


class DownloadErrorWithMessage(Exception):
    pass


class CancelledException(Exception):
    """Raised from the progress hook to abort an active download."""


def sanitize_extension(name: str, ext: str) -> str:
    return BAD_FILENAME_CHARS.sub("", name)[:200] + "." + ext


def clean_url(url: str) -> str:
    return url.strip().strip("'\" ,")


def build_ydl_opts(task: Task, progress_hook: Any) -> Dict[str, Any]:
    """Translate task options into a yt-dlp option dict."""
    options = task.options
    output_dir = options.get("output_dir") or DEFAULT_OUTPUT_DIR
    is_audio = options.get("format") == "mp3"
    noplaylist = not options.get("playlist", True)

    postprocessors: list[Dict[str, Any]] = []

    base: Dict[str, Any] = {
        "outtmpl": os.path.join(output_dir, "%(uploader)s - %(title)s.%(ext)s"),
        "progress_hooks": [progress_hook],
        "noplaylist": noplaylist,
        "extract_flat": False,
        "writesubtitles": options.get("subtitles", False),
        "writeautomaticsub": options.get("subtitles", False),
        "subtitleslangs": ["en"],
        "writethumbnail": options.get("thumbnail", True),
    }

    # Optional cookie file (e.g. exported browser cookies) to defeat YouTube's
    # "Sign in to confirm you're not a bot" check, especially from datacenter IPs.
    cookies_file = options.get("cookies_file") or ""
    if cookies_file and os.path.isfile(cookies_file):
        base["cookiefile"] = cookies_file

    if is_audio:
        format_selector = "bestaudio/best"
        postprocessors.append(
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        )
    else:
        quality = options.get("quality", "best")
        if quality == "best":
            format_selector = "bestvideo+bestaudio/best"
        else:
            height = quality.replace("p", "")
            format_selector = (
                f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
            )
        postprocessors.append({"key": "FFmpegMetadata"})
        if options.get("thumbnail", True):
            postprocessors.append(
                {"key": "EmbedThumbnail", "already_have_thumbnail": False}
            )

    return {
        **base,
        "format": format_selector,
        "postprocessors": postprocessors,
    }


def _format_duration(seconds: Optional[float]) -> str:
    if not seconds:
        return "—"
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


class DownloadManager:
    """Coordinates analysis and downloads across web/desktop."""

    def __init__(
        self,
        registry: Optional[TaskRegistry] = None,
        on_complete: Optional[Any] = None,
    ) -> None:
        self.registry = registry or TaskRegistry()
        self._lock = threading.Lock()
        self.on_complete = on_complete

    # --------------------------------------------------------------- analyze --
    def analyze(self, url: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Extract metadata for a URL without downloading (best effort)."""
        opts = build_ydl_opts_raw(options or {})
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return self._normalize_info(info, url)
        except DownloadError as exc:
            raise DownloadErrorWithMessage(str(exc)) from exc

    def _normalize_info(self, info: Dict[str, Any], url: str) -> Dict[str, Any]:
        is_playlist = info.get("_type") == "playlist"
        formats = info.get("formats") or []
        heights = sorted(
            {
                f.get("height")
                for f in formats
                if f.get("height") and f.get("vcodec") != "none"
            },
            reverse=True,
        )
        resolutions = []
        for h in heights[:4]:
            resolutions.append({"height": h, "label": f"{h}p"})

        has_audio = any(
            f.get("acodec") and f.get("acodec") != "none" for f in formats
        )

        thumb = info.get("thumbnail") or info.get("thumbnails", [{}])[0].get("url")

        entries = None
        if is_playlist:
            entries = []
            for e in (info.get("entries") or [])[:200]:
                if not e:
                    continue
                eid = e.get("id")
                eurl = e.get("url")
                if eid and not eurl:
                    eurl = f"https://www.youtube.com/watch?v={eid}"
                entries.append(
                    {
                        "id": eid,
                        "url": eurl or url,
                        "title": e.get("title") or f"Video {eid}" if eid else "Untitled",
                        "duration": e.get("duration"),
                        "duration_display": _format_duration(e.get("duration")),
                        "thumbnail": e.get("thumbnail")
                        or (e.get("thumbnails") or [{}])[0].get("url"),
                    }
                )

        return {
            "url": url,
            "type": "playlist" if is_playlist else "video",
            "title": info.get("title"),
            "thumbnail": thumb,
            "channel": info.get("uploader") or info.get("channel"),
            "duration": info.get("duration"),
            "duration_display": _format_duration(info.get("duration")),
            "uploader": info.get("uploader"),
            "view_count": info.get("view_count"),
            "is_playlist": is_playlist,
            "playlist_count": len(entries) if entries is not None else None,
            "entries": entries,
            "resolutions": resolutions,
            "has_audio": has_audio,
            "ext": info.get("ext"),
        }

    # ------------------------------------------------------------- download --
    def start_download(
        self, url: str, options: Dict[str, Any]
    ) -> Task:
        """Queue a download and start its worker thread."""
        task = self.registry.create(url, options)
        thread = threading.Thread(
            target=self._run, args=(task,), daemon=True
        )
        thread.start()
        return task

    def _run(self, task: Task) -> None:
        task.set_status(Status.ANALYZING)
        try:
            ydl_opts = build_ydl_opts(task, lambda d: self._progress_hook(d, task))
            with YoutubeDL(ydl_opts) as ydl:
                task.set_status(Status.DOWNLOADING)
                ydl.download([task.url])
            self._resolve_final_file(task)
            task.set_status(Status.COMPLETED)
        except CancelledException:
            task.set_status(Status.CANCELLED)
        except DownloadError as exc:
            task.set_status(Status.ERROR)
            task.update_progress(error=str(exc))
        except Exception as exc:  # noqa: BLE001 - surface any backend failure
            task.set_status(Status.ERROR)
            task.update_progress(error=str(exc))

        if self.on_complete is not None and task.status in (
            Status.COMPLETED,
            Status.ERROR,
            Status.CANCELLED,
        ):
            self.on_complete(task)

    def _progress_hook(self, data: Dict[str, Any], task: Task) -> None:
        if task.cancelled:
            raise CancelledException()

        status = data.get("status")
        info = data.get("info_dict") or {}

        if info:
            task.update_progress(
                title=info.get("title") or task.title,
                thumbnail=info.get("thumbnail") or task.thumbnail,
                channel=info.get("uploader") or info.get("channel") or task.channel,
                duration=info.get("duration") or task.duration,
            )

        if status == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate")
            downloaded = data.get("downloaded_bytes") or 0.0
            percent = (downloaded / total) * 100 if total else 0.0
            task.update_progress(
                status=Status.DOWNLOADING,
                percent=percent,
                downloaded_bytes=downloaded,
                total_bytes=total,
                speed=data.get("speed"),
                eta=data.get("eta"),
            )
        elif status == "finished":
            task.update_progress(filepath=data.get("filename"))
            task.set_status(Status.PROCESSING)
        elif status == "post_process":
            task.update_progress(filepath=data.get("filename"))

    def _resolve_final_file(self, task: Task) -> None:
        """Find the real output file after post-processing.

        The progress hook's ``filepath`` can point at an interim merged
        fragment, so after download completes we scan the output directory
        for the newest media file instead.
        """
        if task.filepath and os.path.exists(task.filepath):
            task.update_progress(filesize=os.path.getsize(task.filepath))
            return

        output_dir = task.options.get("output_dir") or DEFAULT_OUTPUT_DIR
        ext_flags = (".mp4", ".mkv", ".webm", ".mp3", ".flac", ".m4a", ".mov")
        try:
            media = [
                os.path.join(output_dir, name)
                for name in os.listdir(output_dir)
                if os.path.isfile(os.path.join(output_dir, name))
                and name.lower().endswith(ext_flags)
            ]
        except OSError:
            media = []
        if media:
            latest = max(media, key=os.path.getmtime)
            try:
                size = os.path.getsize(latest)
            except OSError:
                size = None
            task.update_progress(filepath=latest, filesize=size)

    # -------------------------------------------------------------- helpers --
    @staticmethod
    def list_resolutions() -> list[str]:
        return RESOLUTIONS


def build_ydl_opts_raw(options: Dict[str, Any]) -> Dict[str, Any]:
    """Minimal yt-dlp options for metadata-only extraction."""
    return {
        "noplaylist": not options.get("playlist", True),
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
    }

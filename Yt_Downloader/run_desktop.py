"""Desktop launcher for YT Downloader.

Wraps the Flask web app in a native pywebview window so the same
codebase powers both the web and desktop experiences.

Usage:
    python run_desktop.py
"""
from __future__ import annotations

import os
import threading
import webbrowser

import webview

from app import app

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("YTDL_PORT", "5001"))


def start_server() -> None:
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)


class DesktopApi:
    """Exposed to the JS layer via pywebview.api.

    History/“Open” buttons call these to open files/folders in the OS.
    """

    def open_file(self, path: str) -> None:
        try:
            os.startfile(path)
        except OSError:
            pass

    def open_folder(self, path: str) -> None:
        try:
            os.startfile(os.path.dirname(path))
        except OSError:
            pass


def main() -> None:
    thread = threading.Thread(target=start_server, daemon=True)
    thread.start()

    webview.create_window(
        "YT Downloader",
        f"http://127.0.0.1:{PORT}/",
        width=1100,
        height=800,
        min_size=(420, 700),
        js_api=DesktopApi(),
        background_color="#10131e",
    )
    webview.start()


if __name__ == "__main__":
    main()

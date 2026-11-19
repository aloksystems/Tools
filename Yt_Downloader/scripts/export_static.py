"""Export the web UI to a static bundle for Capacitor (Android APK) builds.

Templates are pure static HTML (no Jinja placeholders; rendering is client-side JS),
so they are copied verbatim. Navigation links that use absolute routes (/downloads,
/history, /settings, /about) are rewritten to the equivalent relative filenames
(downloads.html, ...) so they work when the app is served from the local file
scheme by Capacitor. home.html becomes index.html. /api/* calls are left as-is
--- they are turned into absolute URLs at runtime by static/js/api.js via the
configurable backend server URL.
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
OUT = ROOT / "build" / "www"

ROUTE_MAP = {
    "": "index.html",
    "/": "index.html",
    "/index": "index.html",
    "/downloads": "downloads.html",
    "/history": "history.html",
    "/settings": "settings.html",
    "/about": "about.html",
}

_TEMPLATE_FILES = [
    "home.html", "downloads.html", "history.html",
    "settings.html", "about.html",
]


def rewrite_assets(text: str) -> str:
    # Absolute /static/ asset refs -> relative static/ for file-scheme hosting.
    text = text.replace('"/static/', '"static/')
    text = text.replace("'/static/", "'static/")
    return text


def rewrite_nav(text: str) -> str:
    text = rewrite_assets(text)
    for route, filename in ROUTE_MAP.items():
        if route == "":
            continue
        text = text.replace(f'href="{route}"', f'href="{filename}"')
        text = text.replace(f"href='{route}'", f"href='{filename}'")
        text = text.replace(f"window.location.href = '{route}'",
                            f"window.location.href = '{filename}'")
        text = text.replace(f'window.location.href = "{route}"',
                            f'window.location.href = "{filename}"')
        text = text.replace(f"window.location.href='{route}'",
                            f"window.location.href='{filename}'")
    return text


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    for name in _TEMPLATE_FILES:
        src = TEMPLATES / name
        if not src.exists():
            raise SystemExit(f"missing template: {src}")
        text = src.read_text(encoding="utf-8")
        text = rewrite_nav(text)
        out_name = "index.html" if name == "home.html" else name
        (OUT / out_name).write_text(text, encoding="utf-8")
        print(f"  exported {name} -> {out_name}")

    shutil.copytree(STATIC, OUT / "static")
    print(f"  copied static/ -> {OUT}/static")

    print(f"\nStatic export complete: {OUT}")


if __name__ == "__main__":
    main()

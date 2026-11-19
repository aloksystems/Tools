## Ultimate YouTube Downloader (GUI)

Modern, fast, and easy-to-use desktop app to download YouTube videos, playlists, or audio with best quality using `yt-dlp` and a sleek `customtkinter` UI. Supports up to 8K/4320p, merges best video+audio, embeds metadata and thumbnails, and optionally downloads subtitles.

> **New in v2.4**: the app now also ships as a responsive web + desktop app sharing one codebase (Flask backend + Obsidian Violet front-end). See [Web + Desktop App](#web--desktop-app) below. The original `customtkinter` GUI (`main.py`) remains available.

### Web + Desktop App

A single Flask backend (`app.py`) serves the UI and downloads, reused by:
- **Web**: any browser (`http://127.0.0.1:5001/`)
- **Desktop**: a native window via `pywebview` (`python run_desktop.py`)

Same `yt-dlp` logic from `main.py` was ported into `backend/downloader.py` (analysis, download queue with live progress/speed/ETA, error handling). Screens replicate the Gemini-generated **Obsidian Violet** design system.

#### Run the web app

```bash
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python app.py
# open http://127.0.0.1:5001/
```

#### Run the desktop app

```bash
.\.venv\Scripts\python run_desktop.py
```

Requires the **Microsoft Edge WebView2 Runtime** (preinstalled on Win10/11). `ffmpeg` must be on PATH for video merge / MP3 conversion.

#### Android (PWA)

The web app is a **Progressive Web App** (`static/manifest.webmanifest` + `static/sw.js`). Open `http://<host>:5001/` in Chrome on Android and choose **"Add to Home screen" / Install** — it installs as a standalone app with its own icon, works offline (cached shell), and reuses the same backend. The LV is fully responsive with bottom navigation for one-handed use.

##### Native Android APK (Capacitor)

A native Android APK is built with **Capacitor** (bundles the UI in a WebView shell). The API is **not** bundled — the app talks to the backend running on your PC via a configurable server URL.

Build steps:

```bash
# 1. Export the static UI bundle (writes build/www, rewrites nav links to relative files)
python scripts/export_static.py

# 2. Sync web assets into the Android project
npx cap copy android

# 3. Build the debug APK (set JAVA_HOME to Android Studio's bundled JBR)
cd android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

The APK is produced at `android\app\build\outputs\apk\debug\app-debug.apk`.

**First run on the phone:** open **Settings → Connection**, set the **Backend Server URL** to your PC's address (e.g. `http://192.168.1.10:5001`), and tap Save. The backend must run on your PC with `python app.py` (default port 5001). The manifest allows cleartext HTTP so the phone can reach a non-TLS server on your LAN. Both devices must be on the same network.

#### API

- `POST /api/analyze` — extract metadata for a URL (`{ "url": "..." }`; playlists return `entries` list for per-video selection)
- `POST /api/download` — queue a download (`{ "url", "format": "video"|"audio", "quality": "1080p", "playlist" }`)
- `POST /api/download_batch` — queue many downloads (`{ "urls": ["..."], "format", "quality" }`, max 50)
- `GET /api/tasks?status=` — list tasks (queue, progress, history)
- `POST /api/tasks/<id>/cancel` — cancel a running task
- `GET|POST /api/settings` — read/update persisted settings (`data/settings.json`)
- `GET /api/files` — list completed media files in the output directories (`{ files: [{ name, size, modified, dir, url }] }`)
- `GET /api/files/download?path=<name>` — download a saved file as an attachment. Only files directly inside a known output directory are served; path traversal is rejected (400). Used by the "Saved on Device" tab for desktop, web, and Android (Capacitor) — the phone downloads the file straight to its device storage.
- `POST /api/cookies` — upload a Netscape-format `cookies.txt` (multipart form field `file`). Stored to `data/cookies.txt` and wired into yt-dlp as `cookiefile`. Use this when YouTube returns **"Sign in to confirm you're not a bot"** (common from datacenter/hosted IPs). Upload from the **Settings → YouTube Cookies** section.

**Cloud/datacenter IPs (e.g. Railway):** YouTube may serve a restricted format listing that surfaces as *"Requested format is not available"*. If no (or a fake) cookie is present, analyze/download automatically retry with the **Android player client**, which still yields a playable (up to ~360p) stream. A **real logged-in `cookies.txt`** restores full quality.

#### Deploy on Railway

The app ships with a Dockerfile so it runs out of the box on Railway (or Render/Fly.io/Koyeb).

**Prerequisites for a public host:**
- FFmpeg is installed in the image (`apt-get install ffmpeg`) — required for video merging/MP3 extraction.
- `yt-dlp` is upgraded at build time to the latest release (YouTube changes often break stale versions).
- The server must be reachable over the internet, so **HTTPS** is used. On the Android APK, set the Backend Server URL to the `https://...` Railway URL (cleartext is only allowed for your LAN).
- **Note:** the task registry is in-memory, so the app must run with a **single worker** (the Dockerfile does this). Multi-worker deployments would have separate queues/history.

**Railway steps:**
1. Push this folder to a GitHub repo (e.g. `Yt_Downloader`).
2. In Railway, create a **New Project → Deploy from GitHub repo** and select that repo.
3. Railway auto-detects the `Dockerfile`. It will build and run `gunicorn` on `$PORT` (Railway sets it automatically).
4. (Optional) Set a **Start Command** of `gunicorn app:app --workers 1 --threads 8 --bind 0.0.0.0:$PORT --timeout 180` if you prefer not to rely on the Dockerfile CMD.
5. Open the generated **Public Domain** URL (e.g. `https://ytdownloader-production.up.railway.app`) and it will be live.
6. Downloads are written to the container's `~/Downloads/YouTube` (or the configured output dir). Use the **Saved on Device** tab to grab them.
7. To keep downloaded files across deploys, attach a **Volume** mounted at `/root/Downloads` (or your output dir) in the service settings.

**Production file serving on a host:** the `/api/files` and `/api/files/download` endpoints work over HTTPS exactly as on your LAN. On the phone, set the Backend Server URL to the Railway public URL.

#### Settings

Stored in `data/settings.json` (created on first save): default quality/format, output dir, subtitles, thumbnail embedding, max simultaneous downloads, theme, language.

### Features
- **Best quality video**: smart format selection via `yt-dlp` (bestvideo+bestaudio, or limit by resolution)
- **High quality audio**: extract to MP3 (FFmpeg) with metadata
- **Playlists**: download entire playlists or single videos
- **Subtitles**: English + auto-generated (optional)
- **Thumbnails**: download and embed artwork/thumbnail (optional)
- **Progress UI**: live percent, speed and ETA, per-URL overall progress
- **Output templating**: saves as `%(uploader)s - %(title)s.%(ext)s` into your chosen folder
- **Dark, modern UI**: `customtkinter` styling and scrollable layout

---

### Requirements
- Python 3.9+ recommended
- `yt-dlp`
- `customtkinter`
- `Pillow`
- **FFmpeg** installed and available in PATH

Install Python dependencies:

```bash
pip install yt-dlp customtkinter Pillow
```

Install FFmpeg:
- **Windows**: Download a static build and add `bin` to PATH (e.g., `ffmpeg.exe` available in PATH). A popular source is `https://www.gyan.dev/ffmpeg/builds/`.
- **macOS**: `brew install ffmpeg`
- **Linux (Debian/Ubuntu)**: `sudo apt update && sudo apt install ffmpeg`

Verify FFmpeg:

```bash
ffmpeg -version
```

---

### Quick Start (Run from source)
1. Ensure Python deps and FFmpeg are installed (see Requirements).
2. From the project root, run:

```bash
python main.py
```

3. Paste one or more YouTube URLs (one per line). Playlists are supported.
4. Choose format: Video (MP4) or Audio (MP3).
5. Optionally set resolution, enable subtitles, and thumbnail embedding.
6. Choose an output directory.
7. Click “Start Epic Download”.

Downloads default to your `~/Downloads/YouTube` folder unless you change it.

---

### Controls and Options
- **URLs box**: One YouTube URL per line. Playlists supported.
- **Download Format**: `Video (MP4)` merges best video+audio; `Audio (MP3)` extracts audio.
- **Quality/Resolution**: `best` or a specific cap like `1080p`, `720p`, etc.
- **Advanced Options**:
  - `Download Playlists (if detected)`
  - `Download Subtitles (English + Auto-generated)`
  - `Download & Embed Thumbnails (for metadata)`
- **Output Directory**: Choose where files are saved. Filenames are sanitized and limited to safe characters.

Progress shows overall status across multiple URLs with percent, speed, and ETA. Post-processing (muxing, metadata, thumbnails, audio extract) is handled by FFmpeg via `yt-dlp` postprocessors.

---

### Build a Standalone Executable (PyInstaller)
This repo includes a PyInstaller spec (`main.spec`). You can build a Windows `.exe` locally.

Basic build command:

```bash
pyinstaller --noconfirm --clean main.spec
```

Outputs:
- `dist/main.exe`: the packaged GUI application
- `build/`: intermediate build artifacts

Notes:
- `console=False` is configured for a windowed app.
- UPX compression is enabled if UPX is installed.
- If you modify imports or add data files, you may need to tweak `hiddenimports` or `datas` in `main.spec`.

---

### Folder Structure

```text
Yt_Downloader/
├─ app.py               # Flask web app (shared backend)
├─ run_desktop.py       # pywebview desktop launcher
├─ backend/
│  ├─ downloader.py     # yt-dlp orchestration (analyze/download/progress)
│  ├─ tasks.py          # thread-safe task + registry
│  └─ settings.py       # persisted JSON settings
├─ templates/           # Obsidian Violet screens (home/downloads/history/settings)
├─ data/                # settings.json (runtime)
├─ main.py              # Legacy customtkinter GUI
├─ main.spec            # PyInstaller build spec
├─ requirements.txt     # flask, yt-dlp, pywebview
├─ requirements-server.txt # + gunicorn (for Railway/Render hosting)
├─ Dockerfile            # containerized deployment (FFmpeg + gunicorn)
├─ .dockerignore         # keeps build/runtime junk out of the image
├─ dist/                # Built artifacts (e.g., main.exe)
└─ build/               # PyInstaller build cache
```

---

### Troubleshooting
- **FFmpeg not found**: Ensure `ffmpeg` is in PATH. Reopen terminal after changes.
- **Permissions**: Pick an output directory you can write to.
- **Download fails**: Some videos may be region-locked, age-restricted, or require cookies. `yt-dlp` supports cookies; integrating cookie support would require extending `main.py` with `cookiefile` options.
- **Subtitles not downloading**: Only English is requested (`en`). Auto-generated enabled when selected; not all videos have them.
- **Slow speeds/ETA inaccurate**: Network-dependent; try again later or check firewall/VPN.

Logs shown in the UI include percent, speed, and ETA. Errors for individual URLs display as message boxes while the app continues with the next item.

---

### How It Works (High-level)
- UI built with `customtkinter` in `YouTubeDownloader` class inside `main.py`.
- For each URL, options are converted into `yt_dlp` config:
  - Video: `format = bestvideo+bestaudio/best` or capped by selected height
  - Audio: `FFmpegExtractAudio` to MP3 (192 kbps)
  - Metadata: `FFmpegMetadata`, and `EmbedThumbnail` if enabled
  - Subtitles: English (`en`), normal + auto-generated if enabled
- Progress hook updates a global progress bar across all URLs.
- Long-running downloads run in a background thread to keep the UI responsive.

---

### Privacy and Disclaimer
This tool downloads content from YouTube. Ensure you have the rights to download and use the content. Respect YouTube’s Terms of Service and local laws.

---

### License
Add your preferred license here (e.g., MIT). If omitted, the project is proprietary by default.

---

### Credits
- Built with `yt-dlp` and `FFmpeg`
- UI by `customtkinter` and `Pillow`



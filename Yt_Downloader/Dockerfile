# python:3.12-slim
FROM python:3.12-slim

# ffmpeg is required by yt-dlp for video merging / MP3 extraction
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for better layer caching
COPY requirements-server.txt .
RUN pip install --no-cache-dir -r requirements-server.txt

# Pin yt-dlp to latest (YouTube changes break stale versions)
RUN pip install --no-cache-dir -U yt-dlp

COPY . .

ENV PYTHONUNBUFFERED=1

# Railway sets $PORT; expose it so health checks work
EXPOSE 5001

# Single worker: the task registry is in-memory/thread-based (gunicorn sync w/ threads)
# Exec form (no shell) with an explicit port - this avoids $PORT shell-expansion
# pitfalls and matches the Railway domain target port (5001).
CMD ["gunicorn", "app:app", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:5001", "--timeout", "180"]

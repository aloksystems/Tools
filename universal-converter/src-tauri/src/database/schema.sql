PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- One row per attempted conversion, successful or not. The queue writes here
-- when a job settles, which is what the History page reads.
CREATE TABLE IF NOT EXISTS conversion_history (
    id              TEXT    PRIMARY KEY,
    input_path      TEXT    NOT NULL,
    output_path     TEXT    NOT NULL,
    input_format    TEXT    NOT NULL,
    output_format   TEXT    NOT NULL,
    engine          TEXT    NOT NULL,
    status          TEXT    NOT NULL,
    input_bytes     INTEGER NOT NULL DEFAULT 0,
    output_bytes    INTEGER,
    error           TEXT,
    error_kind      TEXT,
    created_at_ms   INTEGER NOT NULL,
    finished_at_ms  INTEGER
);

CREATE INDEX IF NOT EXISTS history_created_idx
    ON conversion_history (created_at_ms DESC);

CREATE INDEX IF NOT EXISTS history_status_idx
    ON conversion_history (status);

-- Preferences, stored as JSON per key so adding a setting needs no migration.
CREATE TABLE IF NOT EXISTS app_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- Most recent inputs, for the Home page shortcuts.
CREATE TABLE IF NOT EXISTS recent_files (
    path          TEXT    PRIMARY KEY,
    format        TEXT    NOT NULL,
    last_used_ms  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS recent_used_idx
    ON recent_files (last_used_ms DESC);

-- Files the user pinned. Favourites survive a history clear; forgetting a file
-- removes its pin too, because that action means "drop everything about it".
CREATE TABLE IF NOT EXISTS favorite_files (
    path          TEXT    PRIMARY KEY,
    format        TEXT    NOT NULL,
    added_at_ms   INTEGER NOT NULL
);

-- Jobs accepted by the queue but not yet settled. Deleting a row as the job
-- finishes means anything left here after a crash or forced shutdown is a real
-- interruption; startup turns those rows into honest failed history entries.
CREATE TABLE IF NOT EXISTS pending_jobs (
    id           TEXT PRIMARY KEY,
    job          TEXT NOT NULL,
    submitted_ms INTEGER NOT NULL
);

-- Reusable conversion configurations.
CREATE TABLE IF NOT EXISTS presets (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL UNIQUE,
    engine         TEXT NOT NULL,
    output_format  TEXT NOT NULL,
    settings       TEXT NOT NULL,
    created_at_ms  INTEGER NOT NULL
);

-- Which engine build was seen last, so a silent FFmpeg upgrade is visible.
CREATE TABLE IF NOT EXISTS engine_versions (
    engine       TEXT    PRIMARY KEY,
    version      TEXT,
    unavailable  INTEGER NOT NULL DEFAULT 0,
    detected_ms  INTEGER NOT NULL
);

-- Folder watchers. The watcher reads these rows; every change is followed by a
-- reload signal, so there is a single source of truth for automation rules.
CREATE TABLE IF NOT EXISTS automation_rules (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    input_dir     TEXT    NOT NULL,
    output_dir    TEXT    NOT NULL,
    input_formats TEXT    NOT NULL DEFAULT '[]',
    output_format TEXT    NOT NULL,
    mode          TEXT    NOT NULL DEFAULT 'convert',
    settings      TEXT    NOT NULL DEFAULT '{}',
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id       TEXT,
    level         TEXT    NOT NULL,
    message       TEXT    NOT NULL,
    path          TEXT,
    created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS automation_log_created_idx
    ON automation_log (created_at_ms DESC);

-- Multi-step workflows. Steps are stored as JSON so adding a step type does not
-- need a schema migration; the Rust type validates the shape on every read.
CREATE TABLE IF NOT EXISTS workflows (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    steps         TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
);


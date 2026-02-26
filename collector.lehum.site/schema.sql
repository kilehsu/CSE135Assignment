-- CSE 135 HW3 – Analytics Database Schema (PostgreSQL)
-- Run once on the server:
--   psql -U cse135 -d analytics -f schema.sql

-- ─── Sessions ────────────────────────────────────────────────────────────────
-- One row per browser tab session, keyed on the sessionStorage _col_sid value.
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Pageviews ────────────────────────────────────────────────────────────────
-- One row per page load; carries flattened static + performance data.
CREATE TABLE IF NOT EXISTS pageviews (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    url         TEXT,
    page        TEXT,
    referrer    TEXT,
    entered_at  TIMESTAMPTZ,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Static data
    user_agent      TEXT,
    language        TEXT,
    cookies_enabled BOOLEAN,
    js_enabled      BOOLEAN,
    images_enabled  BOOLEAN,
    css_enabled     BOOLEAN,
    screen_width    INTEGER,
    screen_height   INTEGER,
    window_width    INTEGER,
    window_height   INTEGER,
    pixel_ratio     NUMERIC(5,2),
    color_scheme    TEXT,
    timezone        TEXT,
    network         JSONB,

    -- Performance data
    page_started       TIMESTAMPTZ,
    page_ended         TIMESTAMPTZ,
    total_load_ms      NUMERIC(10,2),
    ttfb_ms            NUMERIC(10,2),
    dns_ms             NUMERIC(10,2),
    tcp_ms             NUMERIC(10,2),
    tls_ms             NUMERIC(10,2),
    download_ms        NUMERIC(10,2),
    dom_interactive_ms NUMERIC(10,2),
    dom_complete_ms    NUMERIC(10,2),
    transfer_size      BIGINT,
    perf_raw           JSONB
);

-- ─── Activity Events ──────────────────────────────────────────────────────────
-- One row per individual event inside an activity batch.
CREATE TABLE IF NOT EXISTS activity_events (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    url         TEXT,
    page        TEXT,
    batch_ts    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_kind  TEXT        NOT NULL,   -- mousemove|click|scroll|keydown|keyup|idle-start|idle-end
    event_data  JSONB       NOT NULL
);

-- ─── Page Exits ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_exits (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    url         TEXT,
    page        TEXT,
    entered_at  TIMESTAMPTZ,
    exited_at   TIMESTAMPTZ,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Errors ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS errors (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    url         TEXT,
    page        TEXT,
    error_type  TEXT,
    message     TEXT,
    source      TEXT,
    line        INTEGER,
    col         INTEGER,
    stack       TEXT,
    raw         JSONB,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pageviews_session  ON pageviews(session_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_ts       ON pageviews(ts);
CREATE INDEX IF NOT EXISTS idx_activity_session   ON activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_kind      ON activity_events(event_kind);
CREATE INDEX IF NOT EXISTS idx_page_exits_session ON page_exits(session_id);
CREATE INDEX IF NOT EXISTS idx_errors_session     ON errors(session_id);

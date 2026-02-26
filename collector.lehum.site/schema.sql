-- CSE 135 HW3 – Analytics Database Schema (PostgreSQL)
-- Run once on the server:
--   psql -U cse135 -d analytics -f schema.sql

-- ─── Sessions ────────────────────────────────────────────────────────────────
-- One row per browser tab session, keyed on the sessionStorage _col_sid value.
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,                                  -- Module 08: collector.identify()
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

    -- Performance data (navigation timing)
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
    perf_raw           JSONB,

    -- Module 05: Resource timing aggregation
    resource_count          INTEGER,
    resource_total_transfer BIGINT,
    resource_total_duration NUMERIC(10,2),
    resource_by_type        JSONB,           -- { "script": { count, totalTransfer, totalDuration }, ... }
    resource_slowest        JSONB            -- top 5 slowest resources array
);

-- ─── Web Vitals ──────────────────────────────────────────────────────────────
-- Module 06: One row per vitals report (sent on page exit for best accuracy).
CREATE TABLE IF NOT EXISTS web_vitals (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    url         TEXT,
    page        TEXT,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Core Web Vitals
    lcp_ms      NUMERIC(10,2),       -- Largest Contentful Paint (ms)
    lcp_rating  TEXT,                 -- good | needs-improvement | poor | unknown
    cls_score   NUMERIC(8,4),        -- Cumulative Layout Shift (unitless)
    cls_rating  TEXT,
    inp_ms      NUMERIC(10,2),       -- Interaction to Next Paint (ms)
    inp_rating  TEXT,
    overall     TEXT                  -- good | needs-improvement | poor | incomplete
);

-- ─── Custom Events ───────────────────────────────────────────────────────────
-- Module 08: collector.track(eventName, properties) rows.
CREATE TABLE IF NOT EXISTS custom_events (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id     TEXT,
    url         TEXT,
    page        TEXT,
    event_name  TEXT        NOT NULL,
    properties  JSONB,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Activity Events ──────────────────────────────────────────────────────────
-- One row per individual event inside an activity batch.
-- event_kind now also includes: click-enriched, scroll-depth, scroll-depth-max (Module 09)
CREATE TABLE IF NOT EXISTS activity_events (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    url         TEXT,
    page        TEXT,
    batch_ts    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_kind  TEXT        NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_pageviews_session    ON pageviews(session_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_ts         ON pageviews(ts);
CREATE INDEX IF NOT EXISTS idx_activity_session     ON activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_kind        ON activity_events(event_kind);
CREATE INDEX IF NOT EXISTS idx_page_exits_session   ON page_exits(session_id);
CREATE INDEX IF NOT EXISTS idx_errors_session       ON errors(session_id);
-- New indexes
CREATE INDEX IF NOT EXISTS idx_web_vitals_session   ON web_vitals(session_id);
CREATE INDEX IF NOT EXISTS idx_web_vitals_ts        ON web_vitals(ts);
CREATE INDEX IF NOT EXISTS idx_custom_events_session ON custom_events(session_id);
CREATE INDEX IF NOT EXISTS idx_custom_events_name   ON custom_events(event_name);
CREATE INDEX IF NOT EXISTS idx_custom_events_ts     ON custom_events(ts);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id     ON sessions(user_id);

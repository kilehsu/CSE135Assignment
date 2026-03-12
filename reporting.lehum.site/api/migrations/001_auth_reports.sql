-- Migration 001: Auth users, saved reports, and analyst comments
-- Run on the server:
--   psql -U cse135 -d analytics -f migrations/001_auth_reports.sql

-- ─── App Users ────────────────────────────────────────────────────────────────
-- Dashboard users with role-based access control.
-- roles: super_admin | analyst | viewer
-- sections_allowed: array of section names for analyst role
--   valid values: 'traffic', 'performance', 'behavior', 'errors'
--   super_admin and viewer ignore this field

CREATE TABLE IF NOT EXISTS app_users (
    id               SERIAL PRIMARY KEY,
    email            TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    display_name     TEXT,
    role             TEXT NOT NULL DEFAULT 'viewer'
                         CHECK (role IN ('super_admin', 'analyst', 'viewer')),
    sections_allowed TEXT[] NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       INTEGER REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);

-- ─── Saved Reports ────────────────────────────────────────────────────────────
-- Snapshot configs saved by analysts; viewers can only read these.

CREATE TABLE IF NOT EXISTS saved_reports (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    section     TEXT NOT NULL CHECK (section IN ('traffic','performance','behavior','errors')),
    config      JSONB NOT NULL DEFAULT '{}',   -- date range, filters, etc.
    created_by  INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_section    ON saved_reports(section);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created_at ON saved_reports(created_at);

-- ─── Analyst Comments ─────────────────────────────────────────────────────────
-- Text annotations written by analysts to decode data in a section or report.

CREATE TABLE IF NOT EXISTS analyst_comments (
    id           SERIAL PRIMARY KEY,
    section      TEXT NOT NULL CHECK (section IN ('traffic','performance','behavior','errors')),
    report_id    INTEGER REFERENCES saved_reports(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    author_id    INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analyst_comments_section   ON analyst_comments(section);
CREATE INDEX IF NOT EXISTS idx_analyst_comments_report_id ON analyst_comments(report_id);

-- ─── Seed Users ───────────────────────────────────────────────────────────────
-- Passwords are bcrypt hashes (cost 12).
-- superadmin@lehum.site / admin123
-- analyst@lehum.site    / analyst123   (all sections)
-- viewer@lehum.site     / viewer123

INSERT INTO app_users (email, display_name, password_hash, role, sections_allowed) VALUES
  ('superadmin@lehum.site',
   'Super Admin',
   '$2b$12$GvhMz7RdpsPGF68Pct3DD.g2abmP8JcrcMDfc3QI3.AqaSB9qF0Tu',
   'super_admin',
   '{}'),
  ('analyst@lehum.site',
   'Analyst',
   '$2b$12$5HQlNju.6Hz9oip4s/iA3uvaicHfBivZh0WGeVCcPtDo7WAIxVPmC',
   'analyst',
   '{traffic,performance,behavior,errors}'),
  ('viewer@lehum.site',
   'Viewer',
   '$2b$12$W66Ws6noWcWtPI4tqxeOCep6yJ05OZOlJyv3RaOCR8ZNmKoxN16HC',
   'viewer',
   '{}')
ON CONFLICT (username) DO NOTHING;

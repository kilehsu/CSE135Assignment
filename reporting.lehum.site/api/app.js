"use strict";

/**
 * app.js — CSE 135 HW3 Reporting REST API + Dashboard
 *
 * Provides authenticated dashboard at /login and /dashboard
 * and GET / POST / PUT / DELETE for:
 *   /api/sessions, /api/pageviews, /api/activity, /api/exits, /api/errors
 *
 * Apache ProxyPass (add to reporting.lehum.site vhost):
 *   ProxyPass        /api       http://127.0.0.1:3002/api
 *   ProxyPassReverse /api       http://127.0.0.1:3002/api
 *   ProxyPass        /login     http://127.0.0.1:3002/login
 *   ProxyPassReverse /login     http://127.0.0.1:3002/login
 *   ProxyPass        /dashboard http://127.0.0.1:3002/dashboard
 *   ProxyPassReverse /dashboard http://127.0.0.1:3002/dashboard
 */

require("dotenv").config();
const path    = require("path");
const express = require("express");
const session = require("express-session");
const cors    = require("cors");
const pool    = require("./db");

const app  = express();
const PORT = process.env.PORT || 3002;

const DASHBOARD_USER = process.env.DASHBOARD_USER || "admin";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "cse135";
const PUBLIC_HTML    = path.join(__dirname, "../public_html");

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret:            process.env.SESSION_SECRET || "cse135-reporting-secret",
  resave:            false,
  saveUninitialized: false,
  cookie:            { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
}));

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // API requests get 401; browser requests get redirect
  if (req.accepts("html")) return res.redirect("/login");
  return res.status(401).json({ error: "Unauthorized" });
}

// ─── Auth routes (public) ─────────────────────────────────────────────────────

app.get("/login", (_req, res) => {
  res.sendFile(path.join(PUBLIC_HTML, "login.html"));
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (username === DASHBOARD_USER && password === DASHBOARD_PASS) {
    req.session.user = username;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  return res.status(401).json({ error: "Not logged in" });
});

// ─── Dashboard (protected page) ───────────────────────────────────────────────

app.get("/dashboard", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_HTML, "dashboard.html"));
});

// ─── Health (public) ──────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ─── Generic CRUD builder ────────────────────────────────────────────────────

function crud(router, table, columns) {
  router.get("/", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ${table} ORDER BY id DESC LIMIT 500`,
      );
      res.json(rows);
    } catch (err) {
      console.error(`[GET /${table}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE id = $1`,
        [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err) {
      console.error(`[GET /${table}/:id]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const vals         = columns.map((c) => req.body[c] ?? null);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const colNames     = columns.join(", ");
      const { rows }     = await pool.query(
        `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) RETURNING *`,
        vals,
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(`[POST /${table}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const sets = columns
        .filter((c) => req.body[c] !== undefined)
        .map((c, i) => `${c} = $${i + 1}`);
      const vals = columns
        .filter((c) => req.body[c] !== undefined)
        .map((c) => req.body[c]);
      if (!sets.length)
        return res.status(400).json({ error: "No fields to update" });
      vals.push(req.params.id);
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
        vals,
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err) {
      console.error(`[PUT /${table}/:id]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM ${table} WHERE id = $1`,
        [req.params.id],
      );
      if (!rowCount) return res.status(404).json({ error: "Not found" });
      res.json({ deleted: true });
    } catch (err) {
      console.error(`[DELETE /${table}/:id]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// ─── Protected API routes ─────────────────────────────────────────────────────

// Sessions
const sessionsRouter = express.Router();

sessionsRouter.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM sessions ORDER BY last_seen DESC LIMIT 500",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

sessionsRouter.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM sessions WHERE id = $1", [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

sessionsRouter.post("/", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    const { rows } = await pool.query(
      `INSERT INTO sessions (id) VALUES ($1)
       ON CONFLICT (id) DO UPDATE SET last_seen = NOW()
       RETURNING *`,
      [id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

sessionsRouter.put("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE sessions SET last_seen = NOW() WHERE id = $1 RETURNING *",
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

sessionsRouter.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM sessions WHERE id = $1",
      [req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use("/api/sessions", requireAuth, sessionsRouter);

app.use("/api/pageviews", requireAuth, crud(express.Router(), "pageviews", [
  "session_id", "url", "page", "referrer", "entered_at",
  "user_agent", "language", "cookies_enabled", "js_enabled", "images_enabled",
  "css_enabled", "screen_width", "screen_height", "window_width", "window_height",
  "pixel_ratio", "color_scheme", "timezone", "network",
  "page_started", "page_ended", "total_load_ms", "ttfb_ms",
  "dns_ms", "tcp_ms", "tls_ms", "download_ms",
  "dom_interactive_ms", "dom_complete_ms", "transfer_size", "perf_raw",
]));

app.use("/api/activity", requireAuth, crud(express.Router(), "activity_events", [
  "session_id", "url", "page", "batch_ts", "event_kind", "event_data",
]));

app.use("/api/exits", requireAuth, crud(express.Router(), "page_exits", [
  "session_id", "url", "page", "entered_at", "exited_at",
]));

app.use("/api/errors", requireAuth, crud(express.Router(), "errors", [
  "session_id", "url", "page", "error_type",
  "message", "source", "line", "col", "stack", "raw",
]));

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[reporting-api] listening on http://127.0.0.1:${PORT}`);
});

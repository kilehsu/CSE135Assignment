"use strict";

/**
 * app.js — CSE 135 HW3 Reporting REST API
 *
 * Provides GET / POST / PUT / DELETE for:
 *   /api/sessions, /api/pageviews, /api/activity, /api/exits, /api/errors
 *
 * Apache ProxyPass (add to reporting.lehum.site vhost):
 *   ProxyPass        /api  http://127.0.0.1:3002/api
 *   ProxyPassReverse /api  http://127.0.0.1:3002/api
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// ─── Generic CRUD builder ────────────────────────────────────────────────────
// Builds GET (all), GET (by id), POST, PUT, DELETE for a given table + columns.

function crud(router, table, columns) {
  // GET all
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

  // GET by id
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

  // POST (create)
  router.post("/", async (req, res) => {
    try {
      const vals = columns.map((c) => req.body[c] ?? null);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = columns.join(", ");
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) RETURNING *`,
        vals,
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(`[POST /${table}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT (update)
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

  // DELETE
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

// ─── Routes ──────────────────────────────────────────────────────────────────

// Sessions (id is TEXT not SERIAL, handle separately) Api test
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

app.use("/api/sessions", sessionsRouter);

// Pageviews
app.use(
  "/api/pageviews",
  crud(express.Router(), "pageviews", [
    "session_id",
    "url",
    "page",
    "referrer",
    "entered_at",
    "user_agent",
    "language",
    "cookies_enabled",
    "js_enabled",
    "images_enabled",
    "css_enabled",
    "screen_width",
    "screen_height",
    "window_width",
    "window_height",
    "pixel_ratio",
    "color_scheme",
    "timezone",
    "network",
    "page_started",
    "page_ended",
    "total_load_ms",
    "ttfb_ms",
    "dns_ms",
    "tcp_ms",
    "tls_ms",
    "download_ms",
    "dom_interactive_ms",
    "dom_complete_ms",
    "transfer_size",
    "perf_raw",
  ]),
);

// Activity events
app.use(
  "/api/activity",
  crud(express.Router(), "activity_events", [
    "session_id",
    "url",
    "page",
    "batch_ts",
    "event_kind",
    "event_data",
  ]),
);

// Page exits
app.use(
  "/api/exits",
  crud(express.Router(), "page_exits", [
    "session_id",
    "url",
    "page",
    "entered_at",
    "exited_at",
  ]),
);

// Errors
app.use(
  "/api/errors",
  crud(express.Router(), "errors", [
    "session_id",
    "url",
    "page",
    "error_type",
    "message",
    "source",
    "line",
    "col",
    "stack",
    "raw",
  ]),
);

// Health
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[reporting-api] listening on http://127.0.0.1:${PORT}`);
});

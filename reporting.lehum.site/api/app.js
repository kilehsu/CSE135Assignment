"use strict";

/**
 * app.js — CSE 135 Final Reporting API
 *
 * Auth:   DB-backed (app_users table), bcrypt, express-session
 * Roles:  super_admin | analyst (sections_allowed[]) | viewer
 *
 * Apache ProxyPass (reporting.lehum.site vhost):
 *   ProxyPass        /api        http://127.0.0.1:3002/api
 *   ProxyPassReverse /api        http://127.0.0.1:3002/api
 *   ProxyPass        /login      http://127.0.0.1:3002/login
 *   ProxyPassReverse /login      http://127.0.0.1:3002/login
 *   ProxyPass        /dashboard  http://127.0.0.1:3002/dashboard
 *   ProxyPassReverse /dashboard  http://127.0.0.1:3002/dashboard
 *   ProxyPass        /admin      http://127.0.0.1:3002/admin
 *   ProxyPassReverse /admin      http://127.0.0.1:3002/admin
 *   ProxyPass        /reports    http://127.0.0.1:3002/reports
 *   ProxyPassReverse /reports    http://127.0.0.1:3002/reports
 *   ProxyPass        /exports    http://127.0.0.1:3002/exports
 *   ProxyPassReverse /exports    http://127.0.0.1:3002/exports
 */

require("dotenv").config();
const path    = require("path");
const fs      = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt  = require("bcryptjs");
const cors    = require("cors");
const pool    = require("./db");

const app        = express();
const PORT       = process.env.PORT || 3002;
const PUBLIC_HTML = path.join(__dirname, "../public_html");
const EXPORTS_DIR = path.join(PUBLIC_HTML, "exports");

// Ensure exports directory exists
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(session({
  secret:            process.env.SESSION_SECRET || "cse135-reporting-secret",
  resave:            false,
  saveUninitialized: false,
  cookie:            { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 },
}));

// Serve exports directory as static files
app.use("/exports", express.static(EXPORTS_DIR));

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.accepts("html")) return res.redirect("/login");
  return res.status(401).json({ error: "Unauthorized" });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user)
      return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.session.user.role))
      return res.status(403).json({ error: "Forbidden" });
    return next();
  };
}

// Analyst must have the section in their sections_allowed array.
// super_admin always passes; viewer always fails.
function requireSection(section) {
  return (req, res, next) => {
    if (!req.session || !req.session.user)
      return res.status(401).json({ error: "Unauthorized" });
    const { role, sections_allowed } = req.session.user;
    if (role === "super_admin") return next();
    if (role === "analyst" && sections_allowed.includes(section)) return next();
    return res.status(403).json({ error: "Forbidden" });
  };
}

// ─── Auth routes (public) ─────────────────────────────────────────────────────

app.get("/login", (_req, res) => {
  res.sendFile(path.join(PUBLIC_HTML, "login.html"));
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  try {
    const { rows } = await pool.query(
      "SELECT * FROM app_users WHERE email = $1",
      [email],
    );
    // Same error for missing user and wrong password — prevents email enumeration
    if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    req.session.user = {
      id:               user.id,
      email:            user.email,
      display_name:     user.display_name,
      role:             user.role,
      sections_allowed: user.sections_allowed || [],
    };
    return res.json({ ok: true, role: user.role });
  } catch (err) {
    console.error("[POST /api/auth/login]", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", (req, res) => {
  if (req.session && req.session.user) {
    const { id, email, display_name, role, sections_allowed } = req.session.user;
    return res.json({ id, user: display_name || email, email, role, sections_allowed });
  }
  return res.status(401).json({ error: "Not logged in" });
});

// ─── Page routes (protected) ──────────────────────────────────────────────────

app.get("/dashboard", requireAuth, (req, res) => {
  // Viewers go to saved reports
  if (req.session.user.role === "viewer")
    return res.redirect("/reports");
  res.sendFile(path.join(PUBLIC_HTML, "dashboard.html"));
});

app.get("/admin", requireAuth, requireRole("super_admin"), (_req, res) => {
  res.sendFile(path.join(PUBLIC_HTML, "admin.html"));
});

app.get("/reports", requireAuth, (_req, res) => {
  res.sendFile(path.join(PUBLIC_HTML, "reports.html"));
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ─── Real-time: live visitor SSE ─────────────────────────────────────────────

app.get("/api/live", requireAuth, async (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const send = async () => {
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*) AS active FROM sessions WHERE last_seen > NOW() - INTERVAL '5 minutes'",
      );
      res.write(`data: ${JSON.stringify({ active: parseInt(rows[0].active, 10) })}\n\n`);
    } catch { res.write("data: {\"active\":0}\n\n"); }
  };

  await send();
  const interval = setInterval(send, 5000);
  req.on("close", () => clearInterval(interval));
});

// ─── Analytics data endpoints ─────────────────────────────────────────────────

// Generic CRUD builder (kept for existing tables)
function crud(router, table, columns) {
  router.get("/", async (req, res) => {
    try {
      const { from, to, limit = 500 } = req.query;
      let q = `SELECT * FROM ${table}`;
      const params = [];
      if (from || to) {
        const conditions = [];
        if (from) { params.push(from); conditions.push(`ts >= $${params.length}`); }
        if (to)   { params.push(to);   conditions.push(`ts <= $${params.length}`); }
        q += " WHERE " + conditions.join(" AND ");
      }
      q += ` ORDER BY id DESC LIMIT $${params.length + 1}`;
      params.push(Math.min(Number(limit), 2000));
      const { rows } = await pool.query(q, params);
      res.json(rows);
    } catch (err) {
      console.error(`[GET /${table}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post("/", async (req, res) => {
    try {
      const vals         = columns.map((c) => req.body[c] ?? null);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const { rows }     = await pool.query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals,
      );
      res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put("/:id", async (req, res) => {
    try {
      const cols = columns.filter((c) => req.body[c] !== undefined);
      const vals = cols.map((c) => req.body[c]);
      if (!cols.length) return res.status(400).json({ error: "No fields to update" });
      vals.push(req.params.id);
      const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals,
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: "Not found" });
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

// Sessions
const sessionsRouter = express.Router();
sessionsRouter.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = "SELECT * FROM sessions";
    const params = [];
    if (from || to) {
      const conds = [];
      if (from) { params.push(from); conds.push(`last_seen >= $${params.length}`); }
      if (to)   { params.push(to);   conds.push(`last_seen <= $${params.length}`); }
      q += " WHERE " + conds.join(" AND ");
    }
    q += " ORDER BY last_seen DESC LIMIT 500";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
sessionsRouter.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
sessionsRouter.post("/", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { rows } = await pool.query(
      "INSERT INTO sessions (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET last_seen = NOW() RETURNING *",
      [id],
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
sessionsRouter.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM sessions WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.use("/api/sessions", requireAuth, sessionsRouter);

app.use("/api/pageviews", requireAuth, requireSection("traffic"), crud(express.Router(), "pageviews", [
  "session_id","url","page","referrer","entered_at","user_agent","language",
  "cookies_enabled","js_enabled","images_enabled","css_enabled",
  "screen_width","screen_height","window_width","window_height",
  "pixel_ratio","color_scheme","timezone","network",
  "page_started","page_ended","total_load_ms","ttfb_ms",
  "dns_ms","tcp_ms","tls_ms","download_ms","dom_interactive_ms","dom_complete_ms",
  "transfer_size","perf_raw",
]));

app.use("/api/activity", requireAuth, requireSection("behavior"), crud(express.Router(), "activity_events", [
  "session_id","url","page","batch_ts","event_kind","event_data",
]));

app.use("/api/exits", requireAuth, requireSection("behavior"), crud(express.Router(), "page_exits", [
  "session_id","url","page","entered_at","exited_at",
]));

app.use("/api/errors", requireAuth, requireSection("errors"), crud(express.Router(), "errors", [
  "session_id","url","page","error_type","message","source","line","col","stack","raw",
]));

// Web vitals
app.use("/api/vitals", requireAuth, requireSection("performance"), crud(express.Router(), "web_vitals", [
  "session_id","url","page","lcp_ms","lcp_rating","cls_score","cls_rating","inp_ms","inp_rating","overall",
]));

// ─── Summary endpoints ────────────────────────────────────────────────────────

// Activity summary: aggregated event counts per kind + heatmap data
app.get("/api/activity-summary", requireAuth, requireSection("behavior"), async (req, res) => {
  try {
    const { from, to, url } = req.query;
    const params = [];
    const where = [];
    if (from) { params.push(from); where.push(`batch_ts >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`batch_ts <= $${params.length}`); }
    if (url)  { params.push(url);  where.push(`url = $${params.length}`); }
    const w = where.length ? "WHERE " + where.join(" AND ") : "";

    const [kinds, scrolls, clicks] = await Promise.all([
      pool.query(`SELECT event_kind, COUNT(*) AS cnt FROM activity_events ${w} GROUP BY event_kind ORDER BY cnt DESC`, params),
      pool.query(`SELECT event_data->>'depth' AS depth, COUNT(*) AS cnt FROM activity_events ${w ? w + " AND" : "WHERE"} event_kind = 'scroll-depth' GROUP BY event_data->>'depth' ORDER BY (event_data->>'depth')::int`, params),
      pool.query(`SELECT event_data->>'x' AS x, event_data->>'y' AS y, url FROM activity_events ${w ? w + " AND" : "WHERE"} event_kind = 'click-enriched' LIMIT 2000`, params),
    ]);

    res.json({
      event_kinds: kinds.rows,
      scroll_depths: scrolls.rows,
      click_points: clicks.rows,
    });
  } catch (err) {
    console.error("[GET /api/activity-summary]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Heatmap: click points for a specific URL
app.get("/api/heatmap", requireAuth, requireSection("behavior"), async (req, res) => {
  try {
    const { url, from, to } = req.query;
    const params = [];
    const where = ["event_kind = 'click-enriched'"];
    if (url)  { params.push(url);  where.push(`url = $${params.length}`); }
    if (from) { params.push(from); where.push(`batch_ts >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`batch_ts <= $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT event_data->>'x' AS x, event_data->>'y' AS y,
              event_data->>'vw' AS vw, event_data->>'vh' AS vh,
              event_data->>'selector' AS selector
       FROM activity_events WHERE ${where.join(" AND ")} LIMIT 3000`,
      params,
    );
    // Aggregate by bucketed coords (20px grid)
    const buckets = {};
    rows.forEach(r => {
      const x = Math.round(Number(r.x) / 20) * 20;
      const y = Math.round(Number(r.y) / 20) * 20;
      const key = `${x},${y}`;
      buckets[key] = (buckets[key] || 0) + 1;
    });
    const points = Object.entries(buckets).map(([k, count]) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y, count };
    });
    res.json({ points, total: rows.length });
  } catch (err) {
    console.error("[GET /api/heatmap]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Exits summary: avg time on page per URL
app.get("/api/exits-summary", requireAuth, requireSection("behavior"), async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    const where = ["entered_at IS NOT NULL", "exited_at IS NOT NULL"];
    if (from) { params.push(from); where.push(`ts >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`ts <= $${params.length}`); }
    const w = "WHERE " + where.join(" AND ");
    const { rows } = await pool.query(
      `SELECT page,
              COUNT(*) AS visits,
              ROUND(AVG(EXTRACT(EPOCH FROM (exited_at - entered_at))), 1) AS avg_time_sec,
              ROUND(MIN(EXTRACT(EPOCH FROM (exited_at - entered_at))), 1) AS min_time_sec,
              ROUND(MAX(EXTRACT(EPOCH FROM (exited_at - entered_at))), 1) AS max_time_sec
       FROM page_exits ${w}
       GROUP BY page ORDER BY visits DESC LIMIT 50`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error("[GET /api/exits-summary]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Session journey: page path for a single session
app.get("/api/journey/:sessionId", requireAuth, requireSection("traffic"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pv.page, pv.url, pv.page_started,
              pe.exited_at,
              ROUND(EXTRACT(EPOCH FROM (pe.exited_at - pv.page_started))) AS time_sec
       FROM pageviews pv
       LEFT JOIN page_exits pe ON pe.session_id = pv.session_id AND pe.page = pv.page
       WHERE pv.session_id = $1
       ORDER BY pv.page_started ASC`,
      [req.params.sessionId],
    );
    res.json(rows);
  } catch (err) {
    console.error("[GET /api/journey]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Top page transitions
app.get("/api/transitions", requireAuth, requireSection("traffic"), async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    const where = [];
    if (from) { params.push(from); where.push(`a.page_started >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`a.page_started <= $${params.length}`); }
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT a.page AS from_page, b.page AS to_page, COUNT(*) AS cnt
       FROM pageviews a
       JOIN pageviews b ON a.session_id = b.session_id
         AND b.page_started > a.page_started
         AND NOT EXISTS (
           SELECT 1 FROM pageviews c
           WHERE c.session_id = a.session_id
             AND c.page_started > a.page_started
             AND c.page_started < b.page_started
         )
       ${w}
       GROUP BY a.page, b.page
       ORDER BY cnt DESC LIMIT 20`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error("[GET /api/transitions]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── User management (super_admin only) ──────────────────────────────────────

app.get("/api/users", requireAuth, requireRole("super_admin"), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, display_name, role, sections_allowed, created_at FROM app_users ORDER BY id",
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/users", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { email, display_name, password, role, sections_allowed = [] } = req.body;
  if (!email || !password || !role)
    return res.status(400).json({ error: "email, password, role required" });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO app_users (email, display_name, password_hash, role, sections_allowed, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, display_name, role, sections_allowed, created_at`,
      [email, display_name || null, hash, role, sections_allowed, req.session.user.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { email, display_name, password, role, sections_allowed } = req.body;
  try {
    const sets = [];
    const vals = [];
    if (email)            { vals.push(email);            sets.push(`email = $${vals.length}`); }
    if (display_name)     { vals.push(display_name);     sets.push(`display_name = $${vals.length}`); }
    if (role)             { vals.push(role);             sets.push(`role = $${vals.length}`); }
    if (sections_allowed) { vals.push(sections_allowed); sets.push(`sections_allowed = $${vals.length}`); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      vals.push(hash);
      sets.push(`password_hash = $${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE app_users SET ${sets.join(", ")} WHERE id = $${vals.length}
       RETURNING id, email, display_name, role, sections_allowed`,
      vals,
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/users/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  if (String(req.params.id) === String(req.session.user.id))
    return res.status(400).json({ error: "Cannot delete yourself" });
  try {
    const { rowCount } = await pool.query("DELETE FROM app_users WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "User not found" });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Saved reports ────────────────────────────────────────────────────────────

app.get("/api/reports", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.section, r.config, r.created_at,
              COALESCE(u.display_name, u.email) AS author
       FROM saved_reports r
       LEFT JOIN app_users u ON u.id = r.created_by
       ORDER BY r.created_at DESC LIMIT 100`,
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, COALESCE(u.display_name, u.email) AS author FROM saved_reports r
       LEFT JOIN app_users u ON u.id = r.created_by WHERE r.id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/reports", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const { name, section, config = {} } = req.body;
  if (!name || !section) return res.status(400).json({ error: "name and section required" });
  try {
    const { rows } = await pool.query(
      "INSERT INTO saved_reports (name, section, config, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, section, config, req.session.user.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/reports/:id", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM saved_reports WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Analyst comments ─────────────────────────────────────────────────────────

app.get("/api/comments", requireAuth, async (req, res) => {
  try {
    const { section, report_id } = req.query;
    const params = [];
    const where  = [];
    if (section)   { params.push(section);   where.push(`c.section = $${params.length}`); }
    if (report_id) { params.push(report_id); where.push(`c.report_id = $${params.length}`); }
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT c.id, c.section, c.report_id, c.comment_text, c.created_at, c.updated_at,
              COALESCE(u.display_name, u.email) AS author
       FROM analyst_comments c
       LEFT JOIN app_users u ON u.id = c.author_id
       ${w} ORDER BY c.created_at ASC`,
      params,
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/comments", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const { section, comment_text, report_id } = req.body;
  if (!section || !comment_text) return res.status(400).json({ error: "section and comment_text required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO analyst_comments (section, comment_text, report_id, author_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [section, comment_text, report_id || null, req.session.user.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/comments/:id", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const { comment_text } = req.body;
  if (!comment_text) return res.status(400).json({ error: "comment_text required" });
  try {
    const { rows } = await pool.query(
      `UPDATE analyst_comments SET comment_text = $1, updated_at = NOW()
       WHERE id = $2 AND author_id = $3 RETURNING *`,
      [comment_text, req.params.id, req.session.user.id],
    );
    if (!rows.length) return res.status(404).json({ error: "Not found or not yours" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/comments/:id", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM analyst_comments WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Export: generate static HTML snapshot ───────────────────────────────────

app.post("/api/export", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const { section, title, html_content } = req.body;
  if (!section || !html_content) return res.status(400).json({ error: "section and html_content required" });
  try {
    const ts       = Date.now();
    const filename = `report-${section}-${ts}.html`;
    const filepath = path.join(EXPORTS_DIR, filename);
    const author   = req.session.user.display_name || req.session.user.email;
    const wrapped  = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title || section} — Analytics Report</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#0f172a; color:#e2e8f0; padding:32px; max-width:1100px; margin:0 auto; }
    h1 { color:#f1f5f9; margin-bottom:4px; }
    .meta { color:#64748b; font-size:13px; margin-bottom:32px; }
    img { max-width:100%; border-radius:8px; }
  </style>
</head>
<body>
  <h1>${title || section.charAt(0).toUpperCase() + section.slice(1)} Report</h1>
  <div class="meta">Generated ${new Date().toLocaleString()} · by ${author}</div>
  ${html_content}
</body>
</html>`;
    fs.writeFileSync(filepath, wrapped, "utf8");
    res.json({ url: `/exports/${filename}`, filename });
  } catch (err) {
    console.error("[POST /api/export]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PDF export ───────────────────────────────────────────────────────────────

app.post("/api/export-pdf", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const { pdf_base64, section, title, chart_snapshots = [] } = req.body;
  if (!pdf_base64 || !section) return res.status(400).json({ error: "pdf_base64 and section required" });
  try {
    const ts       = Date.now();
    const filename = `report-${section}-${ts}.pdf`;
    const filepath = path.join(EXPORTS_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(pdf_base64, "base64"));

    // Also save to saved_reports DB
    const { rows } = await pool.query(
      `INSERT INTO saved_reports (name, section, config, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [title || section, section, JSON.stringify({ chart_snapshots, pdf_url: `/exports/${filename}` }), req.session.user.id],
    );

    res.json({ url: `/exports/${filename}`, filename, report_id: rows[0].id });
  } catch (err) {
    console.error("[POST /api/export-pdf]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── 403 / 404 handlers ───────────────────────────────────────────────────────

app.use((req, res) => {
  if (req.accepts("html")) return res.status(404).sendFile(path.join(PUBLIC_HTML, "404.html"));
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error("[unhandled error]", err.message);
  if (err.status === 403) {
    if (req.accepts("html")) return res.status(403).sendFile(path.join(PUBLIC_HTML, "403.html"));
    return res.status(403).json({ error: "Forbidden" });
  }
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[reporting-api] listening on http://127.0.0.1:${PORT}`);
});

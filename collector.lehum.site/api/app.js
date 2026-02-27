'use strict';

/**
 * app.js — CSE 135 HW3 Analytics Ingest Server
 *
 * Listens for POST /collect from collector.js (running on test.lehum.site)
 * and stores each beacon in the PostgreSQL analytics database.
 *
 * Start:  node app.js
 * Dev:    node --watch app.js
 *
 * Apache vhost ProxyPass (add to collector.lehum.site vhost config):
 *   ProxyPass        /collect  http://127.0.0.1:3001/collect
 *   ProxyPassReverse /collect  http://127.0.0.1:3001/collect
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const pool    = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      process.env.ALLOWED_ORIGIN || 'https://test.lehum.site',
      'http://test.lehum.site',
    ];
    // Allow requests with no origin (curl, sendBeacon on some browsers)
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

// sendBeacon sends text/plain; fetch sends application/json — accept both
app.use(express.text({ type: '*/*', limit: '1mb' }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely parse the request body regardless of Content-Type. */
function parseBody(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return null;
  }
}

/** Upsert the session row so every table's FK is satisfied. */
async function upsertSession(client, sessionId, userId) {
  if (userId) {
    await client.query(
      `INSERT INTO sessions (id, user_id, first_seen, last_seen)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET last_seen = NOW(), user_id = COALESCE($2, sessions.user_id)`,
      [sessionId, userId]
    );
  } else {
    await client.query(
      `INSERT INTO sessions (id, first_seen, last_seen)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET last_seen = NOW()`,
      [sessionId]
    );
  }
}

// ─── Route: POST /collect ─────────────────────────────────────────────────────

app.post('/collect', async (req, res) => {
  const data = parseBody(req);
  if (!data || !data.sessionId || !data.type) {
    return res.sendStatus(400);
  }

  const { type, sessionId } = data;
  const client = await pool.connect();

  try {
    await upsertSession(client, sessionId, data.userId || null);

    switch (type) {

      // ── pageview ──────────────────────────────────────────────────────────
      case 'pageview': {
        const s = data.static      || {};
        const p = data.performance || {};

        const r = data.resources || {};
        await client.query(
          `INSERT INTO pageviews (
            session_id, url, page, referrer, entered_at,
            user_agent, language, cookies_enabled, js_enabled,
            images_enabled, css_enabled,
            screen_width, screen_height, window_width, window_height,
            pixel_ratio, color_scheme, timezone, network,
            page_started, page_ended, total_load_ms,
            ttfb_ms, dns_ms, tcp_ms, tls_ms, download_ms,
            dom_interactive_ms, dom_complete_ms,
            transfer_size, perf_raw,
            resource_count, resource_total_transfer, resource_total_duration,
            resource_by_type, resource_slowest
          ) VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,
            $10,$11,
            $12,$13,$14,$15,
            $16,$17,$18,$19,
            $20,$21,$22,
            $23,$24,$25,$26,$27,
            $28,$29,
            $30,$31,
            $32,$33,$34,
            $35,$36
          )`,
          [
            sessionId,
            data.url     || null,
            data.page    || null,
            data.referrer || null,
            data.enteredAt || null,
            s.userAgent  || null,
            s.language   || null,
            s.cookiesEnabled ?? null,
            s.jsEnabled      ?? null,
            s.imagesEnabled  ?? null,
            s.cssEnabled     ?? null,
            s.screenWidth    ?? null,
            s.screenHeight   ?? null,
            s.windowWidth    ?? null,
            s.windowHeight   ?? null,
            s.pixelRatio     ?? null,
            s.colorScheme    || null,
            s.timezone       || null,
            s.network        ? JSON.stringify(s.network) : null,
            p.pageStarted    || null,
            p.pageEnded      || null,
            p.totalLoadMs    ?? null,
            p.ttfb           ?? null,
            p.dnsLookup      ?? null,
            p.tcpConnect     ?? null,
            p.tlsHandshake   ?? null,
            p.download       ?? null,
            p.domInteractive ?? null,
            p.domComplete    ?? null,
            p.transferSize   ?? null,
            p.raw            ? JSON.stringify(p.raw) : null,
            r.count          ?? null,
            r.totalTransfer  ?? null,
            r.totalDuration  ?? null,
            r.byType         ? JSON.stringify(r.byType) : null,
            r.slowest        ? JSON.stringify(r.slowest) : null,
          ]
        );
        break;
      }

      // ── activity ──────────────────────────────────────────────────────────
      case 'activity': {
        const events  = data.events || [];
        const url     = data.url    || null;
        const page    = data.page   || null;
        const batchTs = data.timestamp || new Date().toISOString();

        for (const event of events) {
          if (!event.kind) continue;
          await client.query(
            `INSERT INTO activity_events
               (session_id, url, page, batch_ts, event_kind, event_data)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [sessionId, url, page, batchTs, event.kind, JSON.stringify(event)]
          );
        }
        break;
      }

      // ── page-exit ─────────────────────────────────────────────────────────
      case 'page-exit': {
        await client.query(
          `INSERT INTO page_exits
             (session_id, url, page, entered_at, exited_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            sessionId,
            data.url       || null,
            data.page      || null,
            data.enteredAt || null,
            data.exitedAt  || null,
          ]
        );
        break;
      }

      // ── error ─────────────────────────────────────────────────────────────
      case 'error': {
        const e = data.error || {};
        await client.query(
          `INSERT INTO errors
             (session_id, url, page, error_type, message, source, line, col, stack, raw)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            sessionId,
            data.url    || null,
            data.page   || null,
            e.type      || null,
            e.message   || null,
            e.source    || null,
            e.lineno    ?? e.line   ?? null,
            e.colno     ?? e.column ?? null,
            e.stack     || null,
            JSON.stringify(e),
          ]
        );
        break;
      }

      // ── web-vitals ──────────────────────────────────────────────────────
      case 'web-vitals': {
        const v = data.vitals || {};
        await client.query(
          `INSERT INTO web_vitals
             (session_id, url, page, lcp_ms, lcp_rating, cls_score, cls_rating,
              inp_ms, inp_rating, overall)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            sessionId,
            data.url  || null,
            data.page || null,
            v.lcp ? v.lcp.value : null,
            v.lcp ? v.lcp.rating : null,
            v.cls ? v.cls.value : null,
            v.cls ? v.cls.rating : null,
            v.inp ? v.inp.value : null,
            v.inp ? v.inp.rating : null,
            v.overall || null,
          ]
        );
        break;
      }

      // ── custom-event ────────────────────────────────────────────────────
      case 'custom-event': {
        await client.query(
          `INSERT INTO custom_events
             (session_id, user_id, url, page, event_name, properties)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            sessionId,
            data.userId || null,
            data.url    || null,
            data.page   || null,
            data.event  || 'unknown',
            data.properties ? JSON.stringify(data.properties) : null,
          ]
        );
        break;
      }

      default:
        break;
    }

    res.sendStatus(204);
  } catch (err) {
    console.error('[collect] error:', err.message);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

// ─── Tracking pixel ───────────────────────────────────────────────────────────

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

app.get('/collect/pixel.gif', (req, res) => {
  res.set({
    'Content-Type':  'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma':        'no-cache',
    'Expires':       '0',
  });
  res.end(PIXEL);
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[collector-api] listening on http://127.0.0.1:${PORT}`);
});

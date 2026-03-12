# Analytics Platform — Final Submission

## Team Members

- Kile Hsu
- Varun Sharma
- Aaron Chiuwei

## Live URLs

- **Dashboard:** https://reporting.lehum.site/dashboard
- **Login:** https://reporting.lehum.site/login
- **Saved Reports:** https://reporting.lehum.site/reports
- **Admin:** https://reporting.lehum.site/admin
- **Collector:** https://collector.lehum.site/collector.js
- **Test site:** https://test.lehum.site

## Repository

https://github.com/[your-repo-link-here]

---

## Architecture Overview

Three collaborating sites hosted on a single DigitalOcean VPS:

| Site | Purpose |
|---|---|
| `collector.lehum.site` | Ingest API (Express, port 3001) — receives analytics beacons from instrumented pages |
| `reporting.lehum.site` | Reporting dashboard (Express, port 3002) — authenticated multi-user analytics platform |
| `test.lehum.site` | Target site instrumented with the collector SDK |

Both Express services run behind Apache reverse proxy. PostgreSQL (`analytics` database, user `cse135`) is the shared data store.

---

## Authentication System

Three-tier role-based access control backed by the `app_users` PostgreSQL table:

| Role | Capabilities |
|---|---|
| `super_admin` | Full access to all sections + user management (`/admin`) |
| `analyst` | Access to a defined subset of sections (traffic, performance, behavior, errors), can write analyst comments and save reports |
| `viewer` | Read-only access to saved reports only; lands on `/reports` after login |

Passwords are stored as bcrypt hashes (cost 12). Sessions are managed with `express-session`. The dashboard HTML is never served as a static file — it is gated server-side by `requireAuth` middleware, preventing forceful browsing.

---

## Report Categories

Four report sections accessible from the tabbed dashboard:

### Traffic
- Pageviews over time (daily line chart with optional prior-period comparison)
- Browser and device breakdowns (doughnut charts)
- Top pages table with percentage of total
- Session Journey Explorer — reconstruct any session's page path with time-on-page
- Top page transition pairs table

### Performance
- Core Web Vitals summary cards (LCP, CLS, INP with ratings)
- TTFB distribution histogram
- Web Vitals ratings mix stacked bar chart (good / needs-improvement / poor)
- Slowest pages table (avg TTFB + load time)
- Full navigation timing table with search

### Behavior
- Scroll depth reach bar chart (25/50/75/100%)
- Event type breakdown doughnut
- **Click heatmap** (extra credit) — canvas visualization of click density from `click-enriched` activity events, filterable by URL
- Avg time on page per URL table

### Errors
- Error stat cards by type
- Errors over time line chart (with prior-period comparison)
- Error type doughnut chart
- Searchable error log table with type, message, page, and line number

All sections include an **Analyst Comments** panel where analysts can post, and viewers can read, freeform text annotations.

---

## Extra Credit Features

- **Click Heatmap** — `GET /api/heatmap?url=` aggregates `click-enriched` events from `activity_events`, rendered as radial-gradient density overlays on a canvas
- **Session Journey Flow** — `GET /api/journey/:sessionId` reconstructs a session's page path from `pageviews` + `page_exits`; rendered as a horizontal step-by-step flow with time-on-page
- **Date Range Picker with Period Comparison** — all data endpoints accept `?from=&to=`; enabling "Compare to prior period" overlays a dashed line for the prior equivalent window on all time-series charts
- **Real-Time Live Visitor Counter** — `GET /api/live` SSE endpoint streams active session count (sessions with `last_seen > NOW() - 5 minutes`) every 5 seconds; displayed as a pulsing green indicator in the nav bar

---

## Export System

Each report section has an **Export** button. Clicking it:
1. Sends `POST /api/export` with the section name and current HTML content
2. The server wraps it in a self-contained HTML template and saves to `public_html/exports/`
3. Returns an accessible URL (e.g. `/exports/report-traffic-1234567890.html`) and opens it in a new tab

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Collector API | Express 4, `cors`, `dotenv`, `pg` |
| Reporting API | Express 4, `express-session`, `bcryptjs`, `cors`, `dotenv`, `pg` |
| Database | PostgreSQL — single `analytics` DB |
| Client SDK | Vanilla JS (ES6 IIFE), no build step |
| Dashboard frontend | Vanilla JS + Chart.js 4.4.4 (CDN) |
| Proxy | Apache reverse proxy |

---

## AI Usage

AI (Claude via Cursor) was used extensively for this project:

- Scaffolding the Express API structure and CRUD route builder
- Writing the client-side analytics SDK (`collector.js`) including Web Vitals, activity tracking, and retry queue
- Generating the dashboard HTML/CSS/JS, including Chart.js configuration
- Designing the RBAC middleware and database migration
- Writing the click heatmap canvas renderer and SSE live counter

**Observed value:** AI was most useful for boilerplate-heavy work (route definitions, form validation, CSS layout) and for translating ideas directly into working code without context-switching. It was less reliable for subtle SQL queries (required manual correction) and for understanding the full system state across many files. Human review and testing remained essential throughout.

---

## Roadmap / Future Work

- **Persistent session store** — replace in-memory `express-session` with `connect-pg-simple` so sessions survive server restarts
- **Email report delivery** — `nodemailer` integration to send HTML export snapshots to specified addresses
- **Scheduled reports** — cron job to automatically save and email weekly reports
- **Markdown in analyst comments** — render comments as Markdown using `marked.js`
- **Alert system** — detect and badge sections when error rate or TTFB spikes above a rolling average threshold
- **Geographic distribution** — IP geolocation lookup on ingest to add country/region to pageviews
- **Custom event visualization** — dedicated panel for `custom_events` fired via `collector.track()`

# Analytics Platform — Final Submission

## Team Members

- Kile Hsu
- Varun Sharma
- Aaron Chiuwei

## Live URLs

| Site | URL |
|---|---|
| Dashboard | https://reporting.lehum.site/dashboard |
| Login | https://reporting.lehum.site/login |
| Saved Reports | https://reporting.lehum.site/reports |
| Admin Panel | https://reporting.lehum.site/admin |
| Collector SDK | https://collector.lehum.site/collector.js |
| Test Site | https://test.lehum.site |

## Repository

https://github.com/kilehsu/CSE135Assignment/tree/main/reporting.lehum.site

---


## Authentication System

Three-tier role-based access control backed by the `app_users` PostgreSQL table:

| Role | Capabilities |
|---|---|
| `super_admin` | Full access to all dashboard sections + user management (`/admin`) |
| `analyst` | Access to assigned sections (any combination of traffic, performance, behavior, errors); can write analyst comments and save reports |
| `viewer` | Read-only access to saved reports only; redirected to `/reports` after login; dashboard link hidden from nav |

Passwords are stored as bcrypt hashes (cost 12). Sessions are managed with `express-session`. The dashboard is gated server-side by `requireAuth` middleware. HTML is never served as a static file, preventing forceful browsing. Unauthorized access attempts redirect to a styled `/403` page. Non-super-admin users who try to access `/admin` are also redirected to `/403`. A custom `/404` page handles unknown routes.

All pages include `<noscript>` fallback messaging for users with JavaScript disabled.

---

## Report Categories

Four report sections accessible from the tabbed dashboard:

### Traffic
- Pageviews over time (daily line chart with optional prior-period comparison)
- Browser and device breakdowns (doughnut charts)
- Top pages table with percentage of total and filter/search
- Session Journey Explorer — reconstruct any session's page path with time-on-page
- Top page transition pairs table

### Performance
- Core Web Vitals summary cards (LCP, CLS, INP with good/needs-improvement/poor ratings)
- TTFB distribution histogram
- Web Vitals ratings mix stacked bar chart
- Slowest pages table (avg TTFB + load time)
- Full navigation timing table with search/filter

### Behavior
- Scroll depth reach bar chart (25/50/75/100%)
- Event type breakdown doughnut
- Click heatmap — canvas visualization of click density, filterable by URL with density legend
- Avg time on page per URL table

### Errors
- Error stat cards by type (JS errors, resource errors, unhandled rejections)
- Errors over time line chart (with prior-period comparison)
- Error type doughnut chart
- Searchable error log table with type, message, page, and line number

**Analyst Comments**: analysts and super admins can post and delete freeform text annotations under saved reports and Viewers can read these.

---

## Export System

Each report section has a **Save & Export** button that:
1. Prompts the user for a report name
2. Captures all Chart.js canvases as JPEG snapshots via `canvas.toDataURL()`
3. Builds a landscape A4 PDF using jsPDF with a styled header, report metadata, and chart images
4. Sends the PDF to the server via `POST /api/export-pdf` for permanent storage
5. Returns an accessible URL and opens the PDF in a new tab

---

## Extra Credit Features

- **Click Heatmap** — `GET /api/heatmap?url=` aggregates `click-enriched` events from `activity_events`, rendered as radial-gradient density overlays on a canvas with a color legend
- **Session Journey Flow** — `GET /api/journey/:sessionId` reconstructs a session's page path from `pageviews` + `page_exits`; displayed as a horizontal step-by-step flow with time-on-page (copy sessionid from the Navigation Timing Table in the Performance Tab and paste it into the Session Jouney Exploere in the Traffic Tab)
- **Date Range Picker with Period Comparison** — all data endpoints accept `?from=&to=`; enabling "Compare to prior period" overlays a dashed line for the prior equivalent window on time-series charts
- **Real-Time Live Visitor Counter** — `GET /api/live` SSE endpoint streams active session count (sessions with `last_seen > NOW() - 5 minutes`) every 5 seconds; displayed as a pulsing green indicator in the nav bar

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Collector API | Express 4, `cors`, `dotenv`, `pg` |
| Reporting API | Express 4, `express-session`, `bcryptjs`, `cors`, `dotenv`, `pg` |
| Database | PostgreSQL — single `analytics` DB |
| Client SDK | Vanilla JS (ES6 IIFE), no build step |
| Dashboard Frontend | Vanilla JS + Chart.js 4.4.4 (CDN) + jsPDF 2.5.1 (CDN) |
| Proxy | Apache reverse proxy |

---

## AI Usage

AI (Claude via Cursor) was used for this project:

- Scaffolding the Express API structure and CRUD route builder
- Writing the client-side analytics SDK (`collector.js`) including Web Vitals, activity tracking, and retry queue
- Generating the dashboard HTML/CSS/JS, including Chart.js configuration
- Designing the RBAC middleware and database migration
- Writing the click heatmap canvas renderer and SSE live counter

**Observed value:** AI was most useful for heavy work (route definitions, form validation, CSS layout) and for translating ideas directly into working code without context-switching. However, it had a hard time understanding the full system state across many files and created many bugs. Human review and testing was essential throughout the project and for finding and fixing bugs.

---

## Future Work

- **Scheduled reports** — cron job to automatically save and email weekly reports
- **Automatic analyst comments** — create automatic comments based on the data
- **Alert system** — detect and badge sections when error rate or TTFB spikes above a rolling average threshold
- **Email report delivery** — `nodemailer` integration to send PDF export snapshots to specified addresses
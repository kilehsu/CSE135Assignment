# HW4 — Derisk Checkpoint

## Team Members

- Kile Hsu
- Varun Sharma
- Aaron Chiuwei

## Live URL

**Dashboard:** https://reporting.lehum.site/dashboard
**Login page:** https://reporting.lehum.site/login

## Credentials (grader)

- Username: `admin`
- Password: `VarunSharma12345!`

## Part 1 — Authentication (MVC + Login/Logout)

**How it works:**

- `GET /login` serves `login.html` — a styled login form
- `POST /api/auth/login` validates credentials from `.env` (`DASHBOARD_USER` / `DASHBOARD_PASS`), sets an `express-session` cookie on success
- `POST /api/auth/logout` destroys the session and redirects to `/login`
- `requireAuth` middleware guards both `/dashboard` and all `/api/*` routes
- Forceful browsing is blocked server-side: navigating directly to `https://reporting.lehum.site/dashboard` without a session returns a 302 redirect to `/login` — the HTML is never sent

No client-side-only auth check that could be bypassed. The dashboard HTML is served by Node (`res.sendFile`), not as a static Apache file.

## Part 2 — Data Table

The dashboard at `/dashboard` loads `GET /api/pageviews` and renders a live HTML table with:

| Column    | Description                                                                  |
| --------- | ---------------------------------------------------------------------------- |
| #         | Row ID from database                                                         |
| Timestamp | When the page was loaded (`page_started`)                                    |
| URL       | Page path visited                                                            |
| Session   | First 12 chars of session ID                                                 |
| TTFB (ms) | Time to first byte, color-coded (green < 200ms, yellow < 500ms, red ≥ 500ms) |
| Load (ms) | Total page load time                                                         |
| Browser   | Parsed from user agent string                                                |

A live filter input lets you search by URL or session ID without a page reload.

## Part 3 — Charts (ChartJS)

Two charts rendered using Chart.js:

**Chart 1 — Pageviews per hour (bar chart)**

- Shows the distribution of pageviews across the last 24 hours
- Data is aggregated client-side from the `/api/pageviews` response

**Chart 2 — Error type breakdown (doughnut chart)**

- Shows counts of `js-error`, `resource-error`, `promise-rejection` etc. from `/api/errors`
- Shows "No errors recorded yet" if the errors table is empty

## Tech Stack

- **Runtime:** Node.js / Express
- **Auth:** `express-session` (in-memory store, server-side session)
- **Charts:** Chart.js 4.4 (CDN)
- **Database:** PostgreSQL via `pg` (node-postgres)
- **Proxy:** Apache reverse proxy

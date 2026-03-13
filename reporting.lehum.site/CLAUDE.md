# Reporting Site Context - CSE 135 Assignment

## Project Overview
This is an analytics reporting dashboard at `reporting.lehum.site` with:
- **Backend**: Node.js/Express API (`/api/app.js`) on port 3002
- **Frontend**: Static HTML pages in `/public_html/`
- **Database**: PostgreSQL (`postgresql://cse135:cse135pass@localhost:5432/analytics`)
- **Proxy**: Apache reverse proxy handles routing to Node.js

## User Roles
- **super_admin**: Full access to all sections and admin panel
- **analyst**: Access only to specific sections in `sections_allowed` array (e.g., `["traffic", "performance"]`)
- **viewer**: Can only see saved reports at `/reports`, redirected there after login

## Recent Changes Made

### 1. Authentication & Authorization
- `requireRole()` and `requireSection()` now show `403.html` for HTML requests (not just JSON)
- Login redirects viewers to `/reports`, others to `/dashboard`
- Added `/403` and `/404` direct routes for testing error pages
- `POST /api/users`: validates role is one of `super_admin|analyst|viewer`, enforces 8-char min password, clears `sections_allowed` for non-analyst roles
- `PUT /api/users/:id`: same role + password validation; always recomputes `sections_allowed` based on effective role (non-analysts always get `[]`)
- `DELETE /api/comments/:id`: analysts can only delete their own comments; super_admin can delete any
- `GET /api/sessions`: now requires `traffic` section (was open to all authenticated users)
- `admin.html` edit modal: sends `sections_allowed: []` for non-analyst roles; password field has `minlength="8"`

### 2. Admin Page (`admin.html`)
- Removed Edit button for super_admin users in the users table (cleaner UI)

### 3. Reports Page (`reports.html`)
- Fixed duplicate `cfg` variable declaration that was breaking JS
- Added PDF download link when `config.pdf_url` exists in saved reports
- Dashboard link now visible for all users (was hidden for viewers)
- Removed "Save Current Dashboard State as Report" manual form — reports are now only created via the export flow in the dashboard (PDF export saves to `saved_reports` automatically)

### 4. Dashboard (`dashboard.html`)
- **Default date range**: Changed from last 7 days to last 1 month (both on initial load and the Reset button)
- **Chart Management**: Added `createChart()` and `destroyChart()` helpers to prevent "Canvas already in use" errors when date filters change
- **Overview tab**: Hidden for analysts — fixed by using direct DOM manipulation instead of `click()` to switch to the first allowed section tab (avoids event-bubbling race conditions). If analyst has no sections at all, overview panel is also hidden.
- **Performance tab**: TTFB Distribution, Slowest Pages, and Navigation Timing cards are hidden if user lacks "traffic" permission (these use pageview data)
- **Behavior tab**:
  - Heatmap API updated to look for both `click` and `click-enriched` events
  - Scroll depth query updated to use `milestone` field (not `depth`) since that's what the tracking script sends
  - Fixed string comparison for scroll depth matching

### 5. API Changes (`app.js`)
- `/api/heatmap`: Now queries `event_kind IN ('click-enriched', 'click')` and filters for events with x/y coordinates
- `/api/activity-summary`: Scroll depths query now uses `COALESCE(event_data->>'depth', event_data->>'milestone')` to support both field names

### 6. Scroll Depth Bug Fix (`collector.lehum.site/public_html/collector.js`)
- **Root cause 1**: `ScrollTracker` was calling `this._api.track("scroll_depth", { threshold: t })` which sends a standalone beacon with `type: "scroll_depth"`. The collector server has no handler for this type → events were silently dropped.
- **Root cause 2**: No tracked pages call `collector.use(ScrollTracker)`, so the extension was never active. Confirmed by README: "we chose to keep these trackers in the main collector file rather than using a plugin system."
- **Fix**: Moved scroll depth milestone tracking directly into `initActivityTracking()` (inline, like clicks and basic scroll). Also exposed `pushEvent` in the extension API and fixed `ScrollTracker` to use `pushEvent("scroll-depth", { milestone: t })` for consistency.
- Events stored as: `event_kind = 'scroll-depth'`, `event_data = { kind: "scroll-depth", milestone: 25|50|75|100, maxDepth: N, timestamp: "..." }`
- **Deploy**: `scp collector.lehum.site/public_html/collector.js varun@reporting.lehum.site:/var/www/collector.lehum.site/public_html/collector.js`

## Database Schema Notes
The `activity_events` table stores behavior data:
- **Click events**: `event_kind = 'click'`, `event_data` contains `{"x": 560, "y": 294, "kind": "click", "button": 0}`
- **Scroll events**: `event_kind = 'scroll-depth'`, `event_data` contains `{"milestone": 50, "currentPct": 100}` (note: uses `milestone` not `depth`)

## Apache Config
Required ProxyPass directives:
```apache
ProxyPass        /api        http://127.0.0.1:3002/api
ProxyPassReverse /api        http://127.0.0.1:3002/api
ProxyPass        /login      http://127.0.0.1:3002/login
ProxyPassReverse /login      http://127.0.0.1:3002/login
ProxyPass        /dashboard  http://127.0.0.1:3002/dashboard
ProxyPassReverse /dashboard  http://127.0.0.1:3002/dashboard
ProxyPass        /admin      http://127.0.0.1:3002/admin
ProxyPassReverse /admin      http://127.0.0.1:3002/admin
ProxyPass        /reports    http://127.0.0.1:3002/reports
ProxyPassReverse /reports    http://127.0.0.1:3002/reports
ProxyPass        /exports    http://127.0.0.1:3002/exports
ProxyPassReverse /exports    http://127.0.0.1:3002/exports
ProxyPass        /403        http://127.0.0.1:3002/403
ProxyPassReverse /403        http://127.0.0.1:3002/403
ProxyPass        /404        http://127.0.0.1:3002/404
ProxyPassReverse /404        http://127.0.0.1:3002/404

ErrorDocument 403 /403.html
ErrorDocument 404 /404.html
```

## Known Issues / TODO
1. **Date filtering**: Default date range changed from 7 days to 1 month (uses `setMonth(month.getMonth() - 1)` for accurate calendar-month subtraction). Both the initial page load and the "Reset" button now default to the past month.
2. **Avg Time on Page**: Shows "No exit data" - may need to check if `page_exits` table has data within the date range
3. **Behavior tab charts**: Only show data if events exist in `activity_events` table with proper fields

## Useful SQL Commands
```sql
-- Check click events structure
SELECT event_kind, event_data FROM activity_events WHERE event_kind LIKE '%click%' LIMIT 5;

-- Check scroll events structure
SELECT event_kind, event_data FROM activity_events WHERE event_kind = 'scroll-depth' LIMIT 5;

-- Check date ranges for scroll data
SELECT batch_ts FROM activity_events WHERE event_kind = 'scroll-depth' ORDER BY batch_ts DESC LIMIT 5;

-- See all unique event kinds
SELECT DISTINCT event_kind FROM activity_events;
```

## File Structure
```
reporting.lehum.site/
├── api/
│   ├── app.js          # Main Express server
│   ├── db.js           # PostgreSQL connection pool
│   └── .env            # Environment variables (DATABASE_URL, SESSION_SECRET, etc.)
└── public_html/
    ├── dashboard.html  # Main analytics dashboard
    ├── reports.html    # Saved reports viewer
    ├── admin.html      # User management (super_admin only)
    ├── login.html      # Login page
    ├── 403.html        # Forbidden error page
    ├── 404.html        # Not found error page
    └── exports/        # Generated PDF/HTML report exports
```

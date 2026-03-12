# GRADER.md

## Credentials

All accounts are seeded by `migrations/001_auth_reports.sql`.

| Role | Email | Password | Access |
|---|---|---|---|
| Super Admin | `superadmin@lehum.site` | `admin123` | Full access, user management |
| Analyst (all sections) | `analyst@lehum.site` | `analyst123` | Traffic, Performance, Behavior, Errors |
| Viewer | `viewer@lehum.site` | `viewer123` | Saved Reports only |

> **Note:** These credentials are seeded by `migrations/001_auth_reports.sql`. The migration must be run on the server before these logins work.

---

## Grader Walkthrough Scenario

This scenario demonstrates all three user roles, the report categories, analyst comments, the export system, and the extra credit features in about 10 minutes.

### Step 1 — Log in as Super Admin

1. Navigate to https://reporting.lehum.site/login
2. Log in with `superadmin@lehum.site` / `admin123`
3. You will land on `/dashboard`

### Step 2 — Explore the Dashboard

1. Notice the **live visitor counter** in the top-right nav bar (pulsing green dot)
2. Set the **date range** to the last 30 days using the date inputs at the top, then click **Apply**
3. Click the **Traffic** tab — observe the pageviews over time line chart, browser/device doughnuts, and top pages table
4. Click the **Performance** tab — observe the Web Vitals cards (LCP/CLS/INP), TTFB histogram, and slowest pages
5. Click the **Behavior** tab — click **Load** on the heatmap after selecting a page from the dropdown to see the click density visualization
6. Click the **Errors** tab — observe the error rate chart and error log

### Step 3 — Analyst Comments

1. On the **Performance** tab, scroll to the **Analyst Comments** panel at the bottom
2. Type a comment like "TTFB is elevated on /quiz — likely due to heavy DOM on initial load" and click **Post Comment**
3. The comment appears immediately

### Step 4 — Save a Report

1. Navigate to https://reporting.lehum.site/reports
2. In the "Save Current Dashboard State" form, name the report "Weekly Performance Review", select "Performance", and click **Save Report**
3. The report appears in the grid

### Step 5 — Export a Report

1. Return to the dashboard (`/dashboard`) and go to the **Errors** tab
2. Click the **⬇ Export** button in the top-right of the section
3. A new tab opens with a self-contained HTML snapshot of the section, saved at `/exports/report-errors-....html`

### Step 6 — User Management (Super Admin)

1. Navigate to https://reporting.lehum.site/admin (also accessible via the Admin link in the nav)
2. Observe the users table — all four seeded users are listed
3. Click **Edit** on `sam` — change their sections to include `traffic` and click **Save Changes**
4. Create a new viewer user: fill in a username, password, select "Viewer", click **Create User**

### Step 7 — Log in as Analyst

1. Log out (top-right button)
2. Log in as `analyst@lehum.site` / `analyst123`
3. Observe that all four section tabs are visible (Traffic, Performance, Behavior, Errors) but the **Admin** link is gone from the nav
4. Attempting to access `/admin` will redirect to `/403`

### Step 8 — Log in as Viewer

1. Log out
2. Log in as `viewer` / `Viewer1!`
3. You are automatically redirected to `/reports` — the dashboard is inaccessible
4. Open the "Weekly Performance Review" report saved in Step 4 — the analyst comment from Step 3 is visible

### Step 9 — Session Journey (Traffic tab, as admin)

1. Log back in as `superadmin@lehum.site` / `admin123`
2. Go to the **Traffic** tab
3. Copy a session ID from the Top Pages table or from the Performance tab's pageviews table
4. Paste it into the **Session Journey Explorer** input and click **Load Journey**
5. A horizontal flow diagram shows the pages visited in order with time spent on each

### Step 10 — Period Comparison (extra credit)

1. On any section, check **Compare to prior period** in the date bar
2. Time-series charts will show a dashed line for the prior equivalent period overlaid on the current period

---

## Known Issues and Concerns

### Architecture

- **In-memory session store:** `express-session` uses an in-memory store by default. If the Node.js process restarts (e.g. server reboot, `pm2 restart`), all active sessions are invalidated and users are logged out. This is acceptable for a course project but would require `connect-pg-simple` in production.

- **Seeded password hashes:** The bcrypt hashes in `migrations/001_auth_reports.sql` were pre-generated for the specified plaintext passwords. If they don't match on the server (e.g. due to a Node.js bcrypt version difference), login for seeded users will fail. In that case, temporarily fall back to the `.env` credentials (`admin` / `cse135`) and re-seed via psql.

- **Export HTML snapshots:** The export system captures the current section's inner HTML including Chart.js canvas elements. Canvas charts will appear as blank boxes in the saved HTML because canvas pixel data is not serialized by `innerHTML`. The snapshot is best used as a readable text/table record rather than a pixel-perfect chart capture. A future improvement would use `canvas.toDataURL()` before capturing.

### Features

- **Click heatmap coordinate normalization:** The heatmap normalizes click coordinates against the max X/Y in the dataset, not against a fixed viewport size. If users have significantly different screen sizes, the density map may shift. A future improvement would normalize against the page's actual rendered dimensions.

- **CORS on the collector:** The collector API (`collector.lehum.site`) only accepts beacons from `https://test.lehum.site`. If the grader wants to instrument a different page, the `ALLOWED_ORIGIN` environment variable on the collector server would need to be updated and the server restarted.

- **No pagination on data endpoints:** All data routes return up to 500 rows (2000 with explicit limit parameter). For a production system with millions of rows, proper pagination would be required. Current data volumes on the test site are well within this limit.

- **Sections not enforced on overview tab:** The Overview tab shows aggregate stats regardless of role. This was an intentional design decision — the overview is read-only and shows only counts, not raw data. A strict interpretation of the spec might require hiding it from analysts not assigned to those sections.

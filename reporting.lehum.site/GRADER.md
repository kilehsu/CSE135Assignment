# GRADER.md

## Credentials

All accounts are seeded by `migrations/001_auth_reports.sql`.

| Role | Email | Password | Access |
|---|---|---|---|
| Super Admin | `superadmin@lehum.site` | `admin123` | Full access, user management |
| Analyst (all sections) | `analyst@lehum.site` | `analyst123` | Traffic, Performance, Behavior, Errors |
| Viewer | `viewer@lehum.site` | `viewer123` | Saved Reports only |

> **Fallback:** If seeded credentials fail due to a bcrypt version mismatch, use the `.env` credentials (`admin` / `cse135`) and re-seed via psql.

---

## Grader Walkthrough

This walkthrough covers all three roles, four report categories, analyst comments, PDF export, user management, and extra credit features.

### 1 — Log in as Super Admin

1. Go to https://reporting.lehum.site/login
2. Enter `superadmin@lehum.site` / `admin123` → click **Sign in**
3. You land on `/dashboard` with the Overview tab active

### 2 — Dashboard Overview & Date Range

1. Note the **live visitor counter** (pulsing green dot + count, top-right nav)
2. The Overview tab shows stat cards (Total Pageviews, Unique Sessions, Avg TTFB, Total Errors, Web Vitals, Avg Time on Page) and a Pageviews chart + Error Types doughnut
3. Play around with the date range using the **From/To** date inputs → click **Apply**

### 3 — Performance Tab

1. Click the **Performance** tab
2. Observe: Web Vitals cards (LCP / CLS / INP with color-coded ratings), TTFB histogram, vitals ratings mix stacked bar, slowest pages table, navigation timing table with search
3. Scroll down to the Navigation Timing Table and click on the Session ID (in purple) to copy it (will use later)
   
### 4 — Analyst Comments

1. Still on **Performance**, scroll to the **Analyst Comments** panel at the bottom
2. Type a comment → click **Post Comment**
3. Confirm it appears immediately with your username and timestamp

### 5 — Traffic Tab

1. Click the **Traffic** tab
2. Observe: pageviews-over-time line chart, browser doughnut, device doughnut, top pages table with filter input
3. Scroll down to the Session Journey Explorer and paste in the Session ID from the previous Navigation Timing Table → click **Load Journey**
4. See the Session Journey Flow, a horizontal flow diagram shows pages visited in order with arrows and time-on-page

### 6 — Behavior Tab + Click Heatmap

1. Click the **Behavior** tab
2. Observe: scroll depth bar chart, event type doughnut, avg time on page table
3. In the **Click Heatmap** card, select a page from the dropdown → click **Load** → observe the color-coded click density visualization (legend: red = high, yellow = medium, green = low)

### 7 — Errors Tab

1. Click the **Errors** tab
2. Observe: error stat cards (Total / JS / Resource / Unhandled Rejections), errors-over-time line chart, error type doughnut, searchable error log table

### 8 — PDF Export

1. On the **Errors** tab, click **⬇ Save & Export**
2. Enter a report name when prompted (e.g. "Errors Snapshot")
3. The system captures chart canvases, generates a landscape PDF with jsPDF, uploads it to the server, and opens the PDF in a new tab (pop-up)
4. Exported Reports can also be viewed in the Saved Reports in the nav

### 9 — Save a Report

1. Click **Saved Reports** in the nav (or go to https://reporting.lehum.site/reports)
2. In the "Save Current Dashboard State as Report" form, name the report "Weekly Performance Review", select **Performance** → click **Save Report**
3. The report card appears in the grid with section label, name, author, and date
4. Type a comment under one of the reports

### 10 — User Management (Super Admin only)

1. Click **Admin** in the nav (or go to https://reporting.lehum.site/admin)
2. Observe the **All Users** table listing seeded users with ID, email, name, role badge, sections, and creation date
3. Click **Edit** on Analyst (name) → change their role or assigned sections → click **Save Changes**
4. Create a new user: fill in email, display name, password, select a role → click **Create User**
5. The new user appears in the table

### 11 — Log in as Analyst

1. Log out (top-right **Logout** button)
2. Log in as `analyst@lehum.site` / `analyst123`
3. Confirm: only the sections that you previously allowed for Analyst are visible, and the **Admin** nav link is hidden
4. Navigate directly to `/admin` → you are redirected to the styled **403 Access Denied** page

### 12 — Log in as Viewer

1. Log out
2. Log in as `viewer@lehum.site` / `viewer123`
3. You are redirected to `/reports` — the **Dashboard** link is hidden from the nav
4. Open the "Weekly Performance Review" report saved in Step 9 — the analyst comment should be visible 

---

## Known Issues & Features

- **PDF export chart quality:** The PDF export captures Chart.js canvases as JPEG images via `canvas.toDataURL()`. Quality is set to 0.7 for reasonable file size. Charts may appear slightly pixelated at high zoom compared to the live dashboard.

- **Click heatmap normalization:** Coordinates are normalized against the max X/Y in the dataset rather than a fixed viewport size. Users with very different screen sizes may see shifted density maps.

- **CORS on the collector:** `collector.lehum.site` only accepts beacons from `https://test.lehum.site`. To instrument a different origin, update the `ALLOWED_ORIGIN` env variable and restart the collector.

- **No pagination on data endpoints:** Routes return up to 500 rows (2000 with explicit limit parameter). Current test-site data volumes are well within this limit; production would need proper pagination.

- **Overview tab not section-gated:** The Overview tab shows aggregate counts regardless of role. This was intentional — it is read-only and shows only summary numbers, not raw data.

# HW 3 - Exploring Data Collection and Storage

## Links
- **Team Website**: [https://www.lehum.site](https://www.lehum.site)
- **Test Site**: [https://test.lehum.site](https://test.lehum.site)
- **Collector Host**: [https://collector.lehum.site](https://collector.lehum.site)
- **Reporting Host**: [https://reporting.lehum.site](https://reporting.lehum.site)

## Team Members
- Aaron Chiuwei
- Kile Hsu
- Varun Sharma

## Server Information
- **IP Address**: `159.89.157.16`
- **Grader Login**:
  - User: `grader`
  - Password: `VarunSharma12345!`
- **SSH/Server Access**: Same credentials as above.

## Deliverables
- `target-site.jpg` — Screenshot of the test site running at test.lehum.site
- `log-verify.jpg` — Screenshot of enhanced access logs with client hints
- `collector.js` — Our custom analytics collector script
- `database-verify.jpg` — Screenshot of collected data stored in the database
- `REST.png` — Screenshot showing data returned from the REST API
- `example-routes.pdf` — PDF documenting all REST endpoint routes

## Part 1 - Test Site
Our test site is hosted at [https://test.lehum.site](https://test.lehum.site), configured as a virtual host on our server. It includes multiple pages with forms and interactive elements:
- **Home** (`index.html`) — Interactive counter and quick poll
- **Feedback** (`feedback.html`) — Rating and comment form
- **Contact** (`contact.html`) — Contact form
- **Quick Quiz** (`quiz.html`) — Multiple-choice quiz with instant feedback

## Part 2 - Logging
We configured enhanced access and error logging for the test site, including client hints headers (`Sec-CH-UA`, `Sec-CH-UA-Platform`, `Sec-CH-UA-Mobile`). These are requested via the `Accept-CH` response header and logged in our custom Apache log format.

## Part 3 - Collector Script
Our `collector.js` script is served from `collector.lehum.site` and collects three types of data:

- **Static**: User agent, language, cookie/JS/image/CSS support (JS/images/CSS are probed at runtime), screen & window dimensions, pixel ratio, color scheme, timezone, network connection info (effectiveType, downlink, rtt, saveData)
- **Performance**: Full Navigation Timing object, page load start/end timestamps, total load time (ms), TTFB, DNS lookup, TCP connect, TLS handshake, download time, DOM interactive, DOM complete, transfer size
- **Activity**: Mouse movements (throttled to 5/sec), clicks (with button ID), scrolling (coordinates), keyboard events (keydown/keyup), idle periods (2s+ threshold with start/end timestamps and duration), errors (JS runtime, resource load failures, unhandled promise rejections), page enter/exit times, page URL and title

Data is sent to the `POST /collect` endpoint using `navigator.sendBeacon` (with `fetch` as fallback). Session tracking is implemented via `sessionStorage` (`_col_sid` key) to tie all collected data to a specific tab session without cookies.

## Part 4 - Data Ingestion & Database
Collected data is received by a Node.js/Express server (`app.js`) listening on port 3001, proxied through Apache on the collector vhost. Data is stored in PostgreSQL across five tables:
- `sessions` — One row per browser tab session
- `pageviews` — Flattened static + performance data per page load
- `activity_events` — Individual activity events (mousemove, click, scroll, keydown, keyup, idle-start, idle-end)
- `page_exits` — Page enter/exit timestamps
- `errors` — Client-side JS and resource errors

Session IDs are upserted on every beacon to maintain foreign key integrity.

## Part 5 - REST Endpoints
REST API endpoints are available on the reporting vhost (`reporting.lehum.site`). Full CRUD routes are documented in `example-routes.pdf` covering: `/api/sessions`, `/api/pageviews`, `/api/activity`, `/api/exits`, and `/api/errors`.

## Changes to collector.js Beyond the CSE135 Tutorial
- Added runtime probing for image support (inline 1×1 GIF test) and CSS support (computed style check on a hidden element)
- Included additional static fields: `pixelRatio`, `colorScheme`, `timezone`
- Extended performance data with computed milestones: TTFB, DNS, TCP, TLS, download, DOM interactive, DOM complete, header size
- Added error deduplication (keyed on type+message+source+line) with a cap of 10 errors per session
- Captured resource load failures (IMG, SCRIPT, LINK tags) and unhandled promise rejections
- Throttled mousemove events to max 5 per second to reduce payload size
- Used `sessionStorage`-based session ID (no cookies) for session correlation
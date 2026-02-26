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
Our test site is hosted at [https://test.lehum.site](https://test.lehum.site). It is configured as a virtual host on our server.

## Part 2 - Logging
We configured enhanced access and error logging for the test site, including client hints headers (e.g., `Sec-CH-UA`, `Sec-CH-UA-Platform`, `Sec-CH-UA-Mobile`). These are requested via the `Accept-CH` response header and logged in our custom Apache log format.

## Part 3 - Collector Script
Our `collector.js` script is served from `collector.lehum.site` and collects three types of data:

- **Static**: User agent, language, cookie/JS/image/CSS support, screen & window dimensions, network connection type
- **Performance**: Full timing object, page load start/end, total load time (ms)
- **Activity**: Mouse movements, clicks, scrolling, keyboard events, idle periods (2s+), errors (via `window.onerror`), page enter/exit times, current page URL

Data is sent to the collector endpoint using `navigator.sendBeacon`. Session tracking is implemented to tie all collected data to a specific user session.

## Part 4 - Data Ingestion & Database
Collected data is received by an endpoint on the collector vhost and inserted into our database. We use PostgreSQL to store static, performance, and activity data in structured tables.

## Part 5 - REST Endpoints
REST API endpoints are available on the reporting vhost (`reporting.lehum.site`). See `example-routes.pdf` for the full route documentation.

## Changes to collector.js Beyond the CSE135 Tutorial
- asdfasdfasdf
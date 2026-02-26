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

## Changes Beyond the CSE 135 Tutorial
- Added runtime probing for image support (inline 1×1 GIF test) and CSS support (computed style check on a hidden element)
- Included additional static fields: `pixelRatio`, `colorScheme`, `timezone`, `hardwareConcurrency`, `maxTouchPoints`, `languages`
- Extended performance data with computed milestones: TTFB, DNS, TCP, TLS, download, DOM interactive, DOM complete, header size
- Added error deduplication (keyed on type+message+source+line) with a configurable cap per session
- Captured resource load failures (IMG, SCRIPT, LINK tags) and unhandled promise rejections
- Throttled mousemove events to max 5 per second to reduce payload size
- Used `sessionStorage`-based session ID (no cookies) for session correlation
- XHR last-resort fallback when both `sendBeacon` and `fetch` are unavailable
- Keyboard event tracking (keydown/keyup)
- Page lifecycle tracking via `visibilitychange` with enter/exit timestamps
- Idle detection with configurable threshold
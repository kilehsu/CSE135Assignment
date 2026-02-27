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
- Instead of using technographics, our collect endpoint accepts a user agent directly
- Our collector has an `initActivityTracking()` function that tracks activity such as mouse movement, keyboard, and scrolling without external extensions — we chose to keep these trackers in the main collector file rather than using a plugin system
- We added an idle tracker that fires after 2 seconds of inactivity
- Our collector also auto initializes — no manual `init()` call needed
- Added page lifecycle tracking via `visibilitychange` with enter/exit timestamps
- Throttled mousemove events to max 5 per second to reduce payload size
- Used `sessionStorage`-based session ID (no cookies) for session correlation
/**
 * collector.js — CSE 135 Analytics Collector
 *
 * Collects:
 *  - Static:      UA, language, cookies, JS/CSS/images enabled, screen/window size, network type
 *  - Performance: Navigation timing (full object + key milestones + total load time)
 *  - Activity:    Errors, mouse (move/click/scroll), keyboard (keydown/keyup), idle time,
 *                 page enter/exit, page identity
 *
 * Session identity is tied via a sessionStorage ID that is also sent to the
 * endpoint on every beacon — allowing server-side logs to be correlated with
 * script-collected data (match on sessionId + url + timestamp window).
 *
 * Served from: https://collector.lehum.site/collector.js
 * Endpoint:    https://collector.lehum.site/collect
 */
(function () {
  'use strict';

  /* ─── Config ────────────────────────────────────────────────────────────── */
  var ENDPOINT = 'https://collector.lehum.site/collect';
  var IDLE_THRESHOLD_MS = 2000;
  var ACTIVITY_BATCH_MS = 3000;   // flush activity queue every 3 s
  var MAX_ERRORS = 10;

  /* ─── Session identity ──────────────────────────────────────────────────── */
  /**
   * Returns a stable session ID for this tab session.
   * Uses sessionStorage so it persists across navigations in the same tab
   * but clears when the tab closes — no cookies needed.
   */
  function getSessionId() {
    try {
      var sid = sessionStorage.getItem('_col_sid');
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem('_col_sid', sid);
      }
      return sid;
    } catch (e) {
      return 'nostorage-' + Math.random().toString(36).slice(2);
    }
  }

  var SESSION_ID = getSessionId();

  /* ─── Send helper ───────────────────────────────────────────────────────── */
  function send(payload) {
    payload.sessionId = SESSION_ID;
    var body = JSON.stringify(payload);
    var blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, blob);
    } else {
      fetch(ENDPOINT, { method: 'POST', body: blob, keepalive: true });
    }
  }

  /* ─── Static data ───────────────────────────────────────────────────────── */

  /**
   * Probe whether images are enabled by creating a 1×1 pixel inline image
   * and checking whether it loads (onload fires vs onerror).
   * Returns a Promise<boolean>.
   */
  function probeImages() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      // Tiny valid GIF
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    });
  }

  /**
   * Probe whether CSS is enabled by checking if a style applied to a hidden
   * test element is computed correctly.
   */
  function probeCSS() {
    try {
      var el = document.createElement('div');
      el.style.cssText = 'position:absolute;visibility:hidden;width:100px';
      document.body.appendChild(el);
      var w = window.getComputedStyle(el).width;
      document.body.removeChild(el);
      return w === '100px';
    } catch (e) {
      return false;
    }
  }

  /**
   * Build the static data payload. Called once after page load.
   */
  function getStaticData(imagesEnabled) {
    var net = {};
    if (navigator.connection) {
      var c = navigator.connection;
      net = {
        effectiveType: c.effectiveType || '',
        downlink: c.downlink || 0,
        rtt: c.rtt || 0,
        saveData: c.saveData || false
      };
    }

    return {
      userAgent:       navigator.userAgent,
      language:        navigator.language,
      cookiesEnabled:  navigator.cookieEnabled,
      jsEnabled:       true,          // if this code runs, JS is enabled
      imagesEnabled:   imagesEnabled,
      cssEnabled:      probeCSS(),
      screenWidth:     window.screen.width,
      screenHeight:    window.screen.height,
      windowWidth:     window.innerWidth,
      windowHeight:    window.innerHeight,
      pixelRatio:      window.devicePixelRatio || 1,
      colorScheme:     window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone,
      network:         net
    };
  }

  /* ─── Performance timing ────────────────────────────────────────────────── */
  function round(n) { return Math.round(n * 100) / 100; }

  /**
   * Collect the full Navigation Timing object plus computed milestones.
   * Must be called after the load event (with setTimeout 0 to ensure
   * loadEventEnd is populated).
   */
  function getPerformanceData() {
    var entries = performance.getEntriesByType('navigation');
    if (!entries.length) return {};

    var n = entries[0];

    return {
      // The whole raw timing object
      raw: {
        fetchStart:             round(n.fetchStart),
        domainLookupStart:      round(n.domainLookupStart),
        domainLookupEnd:        round(n.domainLookupEnd),
        connectStart:           round(n.connectStart),
        connectEnd:             round(n.connectEnd),
        secureConnectionStart:  round(n.secureConnectionStart),
        requestStart:           round(n.requestStart),
        responseStart:          round(n.responseStart),
        responseEnd:            round(n.responseEnd),
        domInteractive:         round(n.domInteractive),
        domContentLoadedEventStart: round(n.domContentLoadedEventStart),
        domContentLoadedEventEnd:   round(n.domContentLoadedEventEnd),
        domComplete:            round(n.domComplete),
        loadEventStart:         round(n.loadEventStart),
        loadEventEnd:           round(n.loadEventEnd),
        redirectCount:          n.redirectCount,
        type:                   n.type,
        transferSize:           n.transferSize,
        encodedBodySize:        n.encodedBodySize,
        decodedBodySize:        n.decodedBodySize
      },
      // Specifically when page started loading
      pageStarted:  new Date(performance.timeOrigin + n.fetchStart).toISOString(),
      // Specifically when page ended loading
      pageEnded:    new Date(performance.timeOrigin + n.loadEventEnd).toISOString(),
      // Total load time in milliseconds (manually calculated)
      totalLoadMs:  round(n.loadEventEnd - n.fetchStart),
      // Key milestones
      ttfb:         round(n.responseStart - n.requestStart),
      dnsLookup:    round(n.domainLookupEnd - n.domainLookupStart),
      tcpConnect:   round(n.connectEnd - n.connectStart),
      tlsHandshake: n.secureConnectionStart > 0
                      ? round(n.connectEnd - n.secureConnectionStart) : 0,
      download:     round(n.responseEnd - n.responseStart),
      domInteractive: round(n.domInteractive - n.fetchStart),
      domComplete:  round(n.domComplete - n.fetchStart),
      transferSize: n.transferSize,
      headerSize:   n.transferSize - n.encodedBodySize
    };
  }

  /* ─── Error tracking ────────────────────────────────────────────────────── */
  var reportedErrors = {};
  var errorCount = 0;

  function reportError(errorData) {
    if (errorCount >= MAX_ERRORS) return;
    var key = (errorData.type || '') + ':' + (errorData.message || '') +
              ':' + (errorData.source || '') + ':' + (errorData.line || '');
    if (reportedErrors[key]) return;
    reportedErrors[key] = true;
    errorCount++;

    send({
      type:      'error',
      error:     errorData,
      timestamp: new Date().toISOString(),
      url:       window.location.href,
      page:      document.title
    });
  }

  // JS runtime errors
  window.addEventListener('error', function (event) {
    if (event instanceof ErrorEvent) {
      reportError({
        type:    'js-error',
        message: event.message,
        source:  event.filename,
        line:    event.lineno,
        column:  event.colno,
        stack:   event.error ? event.error.stack : ''
      });
    } else {
      // Resource load failure (must use capture phase — see below)
    }
  });

  // Resource load failures — must use capture phase (true)
  window.addEventListener('error', function (event) {
    if (!(event instanceof ErrorEvent)) {
      var t = event.target;
      if (t && (t.tagName === 'IMG' || t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
        reportError({
          type:    'resource-error',
          tagName: t.tagName,
          src:     t.src || t.href || ''
        });
      }
    }
  }, true);

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    reportError({
      type:    'promise-rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack:   reason instanceof Error ? reason.stack : ''
    });
  });

  /* ─── Activity tracking ─────────────────────────────────────────────────── */
  var activityQueue = [];
  var idleTimer = null;
  var idleStart = null;
  var pageEnteredAt = new Date().toISOString();

  function pushActivity(event) {
    activityQueue.push(event);
  }

  // Flush the activity queue to the endpoint
  function flushActivity() {
    if (!activityQueue.length) return;
    send({
      type:       'activity',
      events:     activityQueue.splice(0),
      timestamp:  new Date().toISOString(),
      url:        window.location.href,
      page:       document.title
    });
  }

  setInterval(flushActivity, ACTIVITY_BATCH_MS);

  // ── Idle detection ──────────────────────────────────────────────────────
  function resetIdle() {
    if (idleStart !== null) {
      // Idle period just ended
      var idleDuration = Date.now() - idleStart;
      pushActivity({
        kind:      'idle-end',
        endedAt:   new Date().toISOString(),
        durationMs: idleDuration
      });
      idleStart = null;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      idleStart = Date.now();
      pushActivity({
        kind:     'idle-start',
        startedAt: new Date().toISOString()
      });
    }, IDLE_THRESHOLD_MS);
  }

  // ── Mouse activity ──────────────────────────────────────────────────────
  // Throttle mousemove to avoid flooding
  var lastMoveTime = 0;
  document.addEventListener('mousemove', function (e) {
    var now = Date.now();
    if (now - lastMoveTime < 200) return;   // max 5 per second
    lastMoveTime = now;
    resetIdle();
    pushActivity({
      kind: 'mousemove',
      x:    e.clientX,
      y:    e.clientY,
      t:    now
    });
  });

  document.addEventListener('click', function (e) {
    resetIdle();
    pushActivity({
      kind:   'click',
      x:      e.clientX,
      y:      e.clientY,
      button: e.button,   // 0=left, 1=middle, 2=right
      t:      Date.now()
    });
  });

  document.addEventListener('scroll', function () {
    resetIdle();
    pushActivity({
      kind: 'scroll',
      x:    window.scrollX,
      y:    window.scrollY,
      t:    Date.now()
    });
  });

  // ── Keyboard activity ───────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    resetIdle();
    pushActivity({
      kind: 'keydown',
      key:  e.key,
      t:    Date.now()
    });
  });

  document.addEventListener('keyup', function (e) {
    resetIdle();
    pushActivity({
      kind: 'keyup',
      key:  e.key,
      t:    Date.now()
    });
  });

  // ── Page exit ───────────────────────────────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      // Flush pending activity before leaving
      flushActivity();

      send({
        type:       'page-exit',
        url:        window.location.href,
        page:       document.title,
        enteredAt:  pageEnteredAt,
        exitedAt:   new Date().toISOString(),
        timestamp:  new Date().toISOString()
      });
    }
  });

  /* ─── Pageview + static + performance beacon ────────────────────────────── */
  function sendPageview(staticData, perfData) {
    send({
      type:        'pageview',
      url:         window.location.href,
      page:        document.title,
      referrer:    document.referrer,
      timestamp:   new Date().toISOString(),
      enteredAt:   pageEnteredAt,
      static:      staticData,
      performance: perfData
    });
  }

  // Wait for full page load before collecting timing + static data
  window.addEventListener('load', function () {
    setTimeout(function () {
      probeImages().then(function (imagesOk) {
        var staticData = getStaticData(imagesOk);
        var perfData   = getPerformanceData();
        sendPageview(staticData, perfData);
        // Start idle detection after page load
        resetIdle();
      });
    }, 0);
  });

})();

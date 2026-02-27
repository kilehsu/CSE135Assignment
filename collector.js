// collector.js — Module 10: Production Readiness
// Adds consent checking, bot detection, retry queue, time-on-page,
// self-measurement, and command queue (_cq) pattern
// Public API: collector.init(opts), collector.track(event, data),
//             collector.set(key, value), collector.identify(userId),
//             collector.use(extension)

const collector = (function () {
  'use strict';

  // Module 08: private state
  let config      = {};
  let initialized = false;
  let blocked     = false;  // Module 10: true if consent/bot/sampling gates fail
  const globalProps = {};

  // Module 09: extension registry
  const extensions = {};

  // Module 10: time-on-page (visible time only)
  let pageShowTime    = Date.now();
  let totalVisibleMs  = 0;

  // Module 08: defaults — page author only overrides what they need
  const DEFAULTS = {
    endpoint:             'https://collector.lehum.site/collect',
    enableTechnographics: true,
    enableTiming:         true,
    enableVitals:         true,
    enableErrors:         true,
    enableActivity:       true,  // Module 09: mouse, keyboard, idle, page enter/exit
    sampleRate:           1.0,   // 1.0 = 100% of sessions
    debug:                false, // true = log to console, skip network
    detectBots:           true   // Module 10: skip collection for automated browsers
  };

  // Module 08: debug-only logger; warn always shows
  function log(...args)  { if (config.debug) console.log('[collector]', ...args); }
  function warn(...args) { console.warn('[collector]', ...args); }

  // Module 05: round to 2 decimal places for timing values
  function round(n) { return Math.round(n * 100) / 100; }

  // Module 02: session identity via sessionStorage (no cookies needed)
  function getSessionId() {
    let sid = sessionStorage.getItem('_collector_sid');
    if (!sid) {
      sid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('_collector_sid', sid);
    }
    return sid;
  }

  // Module 08: sampling — decide once per session, store result so all pages agree
  function shouldSample() {
    const stored = sessionStorage.getItem('_collector_sampled');
    if (stored !== null) return stored === 'true';
    const result = Math.random() < config.sampleRate;
    sessionStorage.setItem('_collector_sampled', String(result));
    return result;
  }

  // Module 02: Network Information API — not in Safari/Firefox, so feature-detect
  function getNetworkInfo() {
    if (!('connection' in navigator)) return {};
    const conn = navigator.connection;
    return {
      effectiveType: conn.effectiveType,
      downlink:      conn.downlink,
      rtt:           conn.rtt,
      saveData:      conn.saveData
    };
  }

  // Module 03: detect browser capabilities
  // JS is always true (this code is running); images assumed true if JS works;
  // CSS probed via getComputedStyle on a hidden div
  function getCapabilities() {
    const caps = { javascript: true, images: true, css: false };

    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px';
    document.body.appendChild(el);
    const computed = window.getComputedStyle(el);
    caps.css = computed.display !== '' && computed.display !== undefined;
    document.body.removeChild(el);

    return caps;
  }

  // Module 03: cookie bridge — server can log _sid, _vp, _caps via %{...}C
  function setCookieBridge(caps) {
    const sid = getSessionId();
    const vp  = window.innerWidth + 'x' + window.innerHeight;
    const js  = caps && caps.javascript ? '1' : '0';
    const img = caps && caps.images     ? '1' : '0';
    const css = caps && caps.css        ? '1' : '0';

    document.cookie = `_sid=${sid};path=/;max-age=1800;SameSite=Lax`;
    document.cookie = `_vp=${vp};path=/;max-age=1800;SameSite=Lax`;
    document.cookie = `_caps=js:${js},img:${img},css:${css};path=/;max-age=1800;SameSite=Lax`;
  }

  // Module 05: navigation timing — DNS, TCP, TLS, TTFB, DOM milestones
  // Must be called after load event; setTimeout(fn,0) ensures loadEventEnd is set
  function getNavigationTiming() {
    const entries = performance.getEntriesByType('navigation');
    if (!entries.length) return {};
    const n = entries[0];

    return {
      pageStarted:    new Date(performance.timeOrigin + n.fetchStart).toISOString(),
      pageEnded:      new Date(performance.timeOrigin + n.loadEventEnd).toISOString(),
      totalLoadMs:    round(n.loadEventEnd - n.fetchStart),
      ttfb:           round(n.responseStart - n.requestStart),
      dnsLookup:      round(n.domainLookupEnd - n.domainLookupStart),
      tcpConnect:     round(n.connectEnd - n.connectStart),
      tlsHandshake:   n.secureConnectionStart > 0
        ? round(n.connectEnd - n.secureConnectionStart) : 0,
      download:       round(n.responseEnd - n.responseStart),
      domInteractive: round(n.domInteractive - n.fetchStart),
      domComplete:    round(n.domComplete - n.fetchStart),
      transferSize:   n.transferSize,
      raw: {
        fetchStart:     n.fetchStart,
        responseStart:  n.responseStart,
        responseEnd:    n.responseEnd,
        domInteractive: n.domInteractive,
        domComplete:    n.domComplete,
        loadEventEnd:   n.loadEventEnd
      }
    };
  }

  // Module 05: resource summary — count, transfer, duration per type + slowest 3
  function getResourceSummary() {
    const resources = performance.getEntriesByType('resource');
    const byType = {
      script:         { count: 0, totalTransfer: 0, totalDuration: 0 },
      link:           { count: 0, totalTransfer: 0, totalDuration: 0 },
      img:            { count: 0, totalTransfer: 0, totalDuration: 0 },
      font:           { count: 0, totalTransfer: 0, totalDuration: 0 },
      fetch:          { count: 0, totalTransfer: 0, totalDuration: 0 },
      xmlhttprequest: { count: 0, totalTransfer: 0, totalDuration: 0 },
      other:          { count: 0, totalTransfer: 0, totalDuration: 0 }
    };

    let totalTransfer = 0;
    let totalDuration = 0;

    resources.forEach((r) => {
      const type = byType[r.initiatorType] ? r.initiatorType : 'other';
      byType[type].count++;
      byType[type].totalTransfer += r.transferSize || 0;
      byType[type].totalDuration += r.duration || 0;
      totalTransfer += r.transferSize || 0;
      totalDuration += r.duration || 0;
    });

    const slowest = resources
      .slice()
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3)
      .map((r) => ({ name: r.name, duration: round(r.duration), type: r.initiatorType }));

    return { count: resources.length, totalTransfer, totalDuration: round(totalDuration), byType, slowest };
  }

  // Module 06: thresholds for LCP (ms), CLS (unitless), INP (ms)
  const THRESHOLDS = { lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500] };

  function getRating(metric, value) {
    const t = THRESHOLDS[metric];
    if (!t) return null;
    if (value <= t[0]) return 'good';
    if (value <= t[1]) return 'needsImprovement';
    return 'poor';
  }

  // Module 06: Web Vitals state (accumulated by observers)
  let lcpValue = 0;
  let clsValue = 0;
  let inpValue = 0;
  const inpInteractions = [];

  // Module 06: LCP — last entry before user interaction is the final value
  function observeLCP() {
    try {
      const obs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        lcpValue = entries[entries.length - 1].renderTime || entries[entries.length - 1].loadTime;
        log('LCP updated:', round(lcpValue), 'ms', getRating('lcp', lcpValue));
      });
      obs.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      warn('LCP observer not supported:', e.message);
    }
  }

  // Module 06: CLS — accumulate shift values, skip shifts from user input
  function observeCLS() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }
        log('CLS updated:', Math.round(clsValue * 1000) / 1000, getRating('cls', clsValue));
      });
      obs.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      warn('CLS observer not supported:', e.message);
    }
  }

  // Module 06: INP — worst interaction duration (simplified from 98th percentile)
  function observeINP() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) inpInteractions.push(entry.duration);
        }
        if (inpInteractions.length) inpValue = Math.max(...inpInteractions);
        log('INP updated:', round(inpValue), 'ms', getRating('inp', inpValue));
      });
      obs.observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch (e) {
      warn('INP observer not supported:', e.message);
    }
  }

  // Module 07: error deduplication state + rate limit
  const MAX_ERRORS = 10;
  const reportedErrors = new Set();
  let errorCount = 0;

  // Module 07: send one error beacon, deduplicated + rate-limited
  function reportError(errorData) {
    if (errorCount >= MAX_ERRORS) return;
    const key = `${errorData.type}:${errorData.message || ''}:${errorData.source || ''}:${errorData.lineno || ''}`;
    if (reportedErrors.has(key)) return;
    reportedErrors.add(key);
    errorCount++;

    send({
      type:      'error',
      sessionId: getSessionId(),
      url:       window.location.href,
      page:      document.title,
      timestamp: new Date().toISOString(),
      error:     errorData
    });
  }

  // Module 07: attach global error listeners — capture phase required for resource errors
  function initErrorTracking() {
    window.addEventListener('error', (event) => {
      if (event instanceof ErrorEvent) {
        reportError({
          type:    'js-error',
          message: event.message,
          source:  event.filename,
          lineno:  event.lineno,
          colno:   event.colno,
          stack:   event.error ? event.error.stack : ''
        });
      } else {
        const t = event.target;
        if (t && (t.tagName === 'IMG' || t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
          reportError({
            type:    'resource-error',
            message: `Failed to load ${t.tagName}: ${t.src || t.href || ''}`,
            source:  t.src || t.href || ''
          });
        }
      }
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      reportError({
        type:    'promise-rejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack:   reason instanceof Error ? reason.stack : ''
      });
    });

    log('Error tracking enabled');
  }

  // Module 10: detect automated browsers (Puppeteer, Selenium, Playwright, headless)
  function isBot() {
    if (navigator.webdriver) return true;
    const ua = navigator.userAgent;
    if (/HeadlessChrome|PhantomJS|Lighthouse/i.test(ua)) return true;
    if (/Chrome/.test(ua) && !window.chrome) return true; // spoofed or headless Chrome
    if (window._phantom || window.__nightmare || window.callPhantom) return true;
    return false;
  }

  // Module 10: sessionStorage retry queue — cap at 50, drained on next page load
  function queueForRetry(payload) {
    try {
      const q = JSON.parse(sessionStorage.getItem('_collector_retry') || '[]');
      if (q.length >= 50) return;
      q.push(payload);
      sessionStorage.setItem('_collector_retry', JSON.stringify(q));
    } catch (e) { /* sessionStorage full or unavailable */ }
  }

  function processRetryQueue() {
    try {
      const q = JSON.parse(sessionStorage.getItem('_collector_retry') || '[]');
      if (!q.length) return;
      sessionStorage.removeItem('_collector_retry');
      q.forEach((p) => send(p));
      log('Drained retry queue:', q.length, 'item(s)');
    } catch (e) { /* sessionStorage unavailable */ }
  }

  // Module 04: cascading delivery — sendBeacon → fetch(keepalive) → fetch
  // Module 08: debug mode skips network and logs to console instead
  // Module 10: retry on failure; self-measurement via performance.mark
  function send(payload) {
    // Merge global properties (set via collector.set())
    for (const k of Object.keys(globalProps)) {
      payload[k] = globalProps[k];
    }

    log('payload:', payload);

    if (config.debug) return; // debug mode — don't send, just log

    performance.mark('collector_send_start'); // Module 10: self-measurement

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = config.endpoint || DEFAULTS.endpoint;

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(url, blob);
      performance.mark('collector_send_end');
      performance.measure('collector_send', 'collector_send_start', 'collector_send_end');
      if (sent) return;
    }

    fetch(url, {
      method: 'POST',
      body: json,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true
    }).catch(() => {
      // Module 10: retry on fetch failure
      fetch(url, {
        method: 'POST',
        body: json,
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {
        queueForRetry(payload); // last resort — store for next page load
      });
    });
  }

  // Module 01: pageview beacon — static data + performance + resources
  function collectPageview() {
    const caps = getCapabilities();
    setCookieBridge(caps);

    const payload = {
      type:      'pageview',
      sessionId: getSessionId(),
      url:       window.location.href,
      page:      document.title,
      referrer:  document.referrer,
      timestamp: new Date().toISOString(),

      static: {
        userAgent:     navigator.userAgent,
        language:      navigator.language,
        cookiesEnabled: navigator.cookieEnabled,
        jsEnabled:     caps.javascript,
        imagesEnabled: caps.images,
        cssEnabled:    caps.css,
        screenWidth:   window.screen.width,
        screenHeight:  window.screen.height,
        windowWidth:   window.innerWidth,
        windowHeight:  window.innerHeight,
        pixelRatio:    window.devicePixelRatio,
        colorScheme:   window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark' : 'light',
        timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
        network:       getNetworkInfo()
      }
    };

    if (config.enableTiming) {
      payload.performance = getNavigationTiming();
      payload.resources   = getResourceSummary();
    }

    send(payload);
  }

  // Module 06: vitals beacon — sent when the user leaves the page
  function sendVitals() {
    const ratings = {
      lcp: getRating('lcp', lcpValue),
      cls: getRating('cls', clsValue),
      inp: getRating('inp', inpValue)
    };
    const rankOrder = { poor: 2, needsImprovement: 1, good: 0 };
    const overall = Object.values(ratings)
      .reduce((worst, r) => (rankOrder[r] > rankOrder[worst] ? r : worst), 'good');

    send({
      type:      'web-vitals',
      sessionId: getSessionId(),
      url:       window.location.href,
      page:      document.title,
      timestamp: new Date().toISOString(),
      vitals: {
        lcp: { value: round(lcpValue),                     rating: ratings.lcp },
        cls: { value: Math.round(clsValue * 1000) / 1000, rating: ratings.cls },
        inp: { value: round(inpValue),                     rating: ratings.inp },
        overall
      }
    });
  }

  // Module 09: activity event buffer — flushed as a single beacon on page hide
  const activityEvents = [];
  let pageEnteredAt = null;

  function pushEvent(kind, data) {
    activityEvents.push({ kind, ...data, timestamp: new Date().toISOString() });
  }

  // Module 09: idle detection — fire after 2s of no activity, record how long it lasted
  let idleTimer = null;
  let idleStart = null;

  function resetIdle() {
    if (idleStart !== null) {
      // user came back — record how long the idle lasted and when it ended
      const endedAt = new Date().toISOString();
      const duration = Date.now() - idleStart;
      pushEvent('idle', { duration, endedAt });
      idleStart = null;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleStart = Date.now();
    }, 2000);
  }

  // Module 09: flush buffered activity events to the server
  function flushActivity() {
    if (!activityEvents.length) return;
    const events = activityEvents.splice(0); // drain the array
    send({
      type:      'activity',
      sessionId: getSessionId(),
      url:       window.location.href,
      page:      document.title,
      timestamp: new Date().toISOString(),
      events
    });
  }

  // Module 09: wire up mouse, keyboard, scroll, and idle listeners
  function initActivityTracking() {
    pageEnteredAt = new Date().toISOString();
    pushEvent('page-enter', { url: window.location.href, page: document.title });

    // Throttle helpers — only emit once every 100ms for high-frequency events
    let lastMove = 0;
    let lastScroll = 0;

    document.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMove < 100) return;
      lastMove = now;
      pushEvent('mousemove', { x: e.clientX, y: e.clientY });
      resetIdle();
    });

    // Clicks — record which mouse button (0=left, 1=middle, 2=right)
    document.addEventListener('click', (e) => {
      pushEvent('click', { x: e.clientX, y: e.clientY, button: e.button });
      resetIdle();
    });

    window.addEventListener('scroll', () => {
      const now = Date.now();
      if (now - lastScroll < 100) return;
      lastScroll = now;
      pushEvent('scroll', { scrollX: window.scrollX, scrollY: window.scrollY });
      resetIdle();
    });

    // Key events — record key name, not char value (avoids logging passwords)
    document.addEventListener('keydown', (e) => {
      pushEvent('keydown', { key: e.key, code: e.code });
      resetIdle();
    });

    document.addEventListener('keyup', (e) => {
      pushEvent('keyup', { key: e.key, code: e.code });
      resetIdle();
    });

    // Page exit — flush all buffered events
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        pushEvent('page-exit', {
          url:         window.location.href,
          page:        document.title,
          enteredAt:   pageEnteredAt,
          exitedAt:    new Date().toISOString()
        });
        flushActivity();
      }
    });

    resetIdle(); // start the idle timer
    log('Activity tracking enabled');
  }

  // Module 09: register an extension — must have { name, init, destroy? }
  // Extensions receive a limited API (track, set, getConfig, getSessionId)
  // They cannot call send() directly — all data flows through track() so
  // sampling, debug mode, and endpoint config apply uniformly
  function use(extension) {
    if (!extension || !extension.name) {
      warn('use(): extension must have a name property');
      return;
    }
    if (extensions[extension.name]) {
      warn(`use(): extension "${extension.name}" already registered`);
      return;
    }
    extensions[extension.name] = extension;

    if (typeof extension.init === 'function') {
      extension.init({
        track,
        set,
        getConfig:    () => ({ ...config }),
        getSessionId
      });
    }

    log('Extension registered:', extension.name);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // Module 08: configure and start the collector
  // All features are opt-out via flags; calling init() twice is a no-op + warning
  function init(options) {
    if (initialized) {
      warn('collector.init() called more than once — ignoring');
      return;
    }

    // Merge user options with defaults
    config = {};
    for (const key of Object.keys(DEFAULTS)) {
      config[key] = (options && options[key] !== undefined) ? options[key] : DEFAULTS[key];
    }

    // Sampling: decide once per session — unsampled sessions are fully silent
    if (!shouldSample()) {
      log(`Session not sampled (rate: ${config.sampleRate})`);
      return;
    }

    performance.mark('collector_init_start'); // Module 10: self-measurement

    // Module 10 gate: bot detection
    if (config.detectBots && isBot()) {
      log('bot detected — collection disabled');
      blocked = true; initialized = true; return;
    }

    initialized = true;

    // Module 07: attach error listeners before anything else can throw
    if (config.enableErrors) initErrorTracking();

    // Module 09: start activity tracking (mouse, keyboard, scroll, idle)
    if (config.enableActivity) initActivityTracking();

    // Module 06: start vitals observers immediately (buffered: true catches past entries)
    if (config.enableVitals) {
      observeLCP();
      observeCLS();
      observeINP();
    }

    // Module 10: drain any beacons that failed on a previous page load
    processRetryQueue();

    // Module 05: fire pageview beacon after load; setTimeout ensures loadEventEnd is set
    if (document.readyState === 'complete') {
      setTimeout(collectPageview, 0);
    } else {
      window.addEventListener('load', () => setTimeout(collectPageview, 0));
    }

    // Module 06: send final vitals when user hides the tab or navigates away
    // Module 10: also track time-on-page (visible time only, not background time)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        totalVisibleMs += Date.now() - pageShowTime;
        if (config.enableVitals) sendVitals();
      } else {
        pageShowTime = Date.now(); // tab became visible again — reset timer
      }
    });

    performance.mark('collector_init_end');
    performance.measure('collector_init', 'collector_init_start', 'collector_init_end');
    log('initialized', config);
  }

  // Module 08: send a custom event with optional data
  function track(eventName, data) {
    if (!initialized) { warn('track() called before init()'); return; }
    if (blocked) return; // Module 10: silently no-op for unsampled/bot/no-consent sessions
    const payload = {
      type:      eventName || 'custom-event',
      sessionId: getSessionId(),
      url:       window.location.href,
      page:      document.title,
      timestamp: new Date().toISOString()
    };
    if (data) payload.properties = data;
    send(payload);
  }

  // Module 08: attach a property to every future beacon (good for env, version, plan)
  function set(key, value) {
    globalProps[key] = value;
    log('global prop set:', key, '=', value);
  }

  // Module 08: link the session to an authenticated user
  // Functionally set('userId', id) but explicit enough to match Segment/Amplitude patterns
  function identify(userId) {
    globalProps.userId = userId;
    log('user identified:', userId);
  }

  // Module 10: command queue — drain _cq array then replace with live proxy
  // This allows <script async> loading: page pushes commands before script loads,
  // script processes them when ready. All subsequent _cq.push() calls execute immediately.
  // Pattern used by Google Analytics (dataLayer), Segment, Amplitude, etc.
  const publicAPI = { init, track, set, identify, use };

  (function processQueue() {
    const q = window._cq || [];
    for (const args of q) {
      const method = args[0];
      const params = args.slice(1);
      if (typeof publicAPI[method] === 'function') publicAPI[method](...params);
    }
    // Replace the plain array with a live proxy — future _cq.push() executes immediately
    window._cq = {
      push(args) {
        const method = args[0];
        const params = args.slice(1);
        if (typeof publicAPI[method] === 'function') publicAPI[method](...params);
      }
    };
  })();

  // Auto-initialize with defaults if no _cq.push(['init', ...]) was queued
  if (!initialized) {
    init();
  }

  return publicAPI;

})();

// ── Extensions (Module 09) ────────────────────────────────────────────────
// Register with: collector.use(ClickTracker) / collector.use(ScrollTracker)

// Module 09: click tracker extension — CSS selector path + coordinates
window.ClickTracker = {
  name: 'click-tracker',
  _handler: null,

  init(api) {
    let lastClick = 0;
    this._handler = (event) => {
      const now = Date.now();
      if (now - lastClick < 300) return; // debounce rapid double-clicks
      lastClick = now;
      const t = event.target;
      api.track('click', {
        tagName:  t.tagName,
        id:       t.id       || undefined,
        class:    t.className || undefined,
        text:     (t.textContent || '').trim().substring(0, 100),
        x:        event.clientX,
        y:        event.clientY,
        selector: this._getSelector(t)
      });
    };
    document.addEventListener('click', this._handler, true);
  },

  // Walk up the DOM to build a CSS path; stop at an ID (IDs are unique)
  _getSelector(el) {
    const parts = [];
    while (el && el !== document.body) {
      let part = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(`${part}#${el.id}`); break; }
      if (el.className && typeof el.className === 'string') {
        part += `.${el.className.trim().split(/\s+/).join('.')}`;
      }
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(' > ');
  },

  destroy() {
    if (this._handler) {
      document.removeEventListener('click', this._handler, true);
      this._handler = null;
    }
  }
};

// Module 09: scroll depth extension — reports at 25/50/75/100% + final depth on exit
window.ScrollTracker = {
  name: 'scroll-tracker',
  _api: null,
  _maxDepth: 0,
  _reported: {},
  _scrollHandler: null,
  _visHandler: null,
  _thresholds: [25, 50, 75, 100],

  init(api) {
    this._api = api;
    let ticking = false;

    this._scrollHandler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { this._measure(); ticking = false; });
    };
    window.addEventListener('scroll', this._scrollHandler);

    this._visHandler = () => {
      if (document.visibilityState === 'hidden') {
        api.track('scroll_final', { maxDepth: this._maxDepth });
      }
    };
    document.addEventListener('visibilitychange', this._visHandler);
  },

  _measure() {
    const scrollTop  = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight  = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const pct        = Math.round((scrollTop + window.innerHeight) / docHeight * 100);

    if (pct > this._maxDepth) this._maxDepth = pct;

    for (const t of this._thresholds) {
      if (pct >= t && !this._reported[t]) {
        this._reported[t] = true;
        this._api.track('scroll_depth', { threshold: t, maxDepth: this._maxDepth });
      }
    }
  },

  destroy() {
    if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
    if (this._visHandler)    document.removeEventListener('visibilitychange', this._visHandler);
  }
};

// ── ConsentManager (Module 10) ────────────────────────────────────────────
// Usage: if (!ConsentManager.check()) ConsentManager.showBanner({ onAccept: () => collector.init() });

window.ConsentManager = (function () {
  'use strict';

  // Module 10: same logic as hasConsent() inside the collector
  function check() {
    if (navigator.globalPrivacyControl) return false;
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
      const cookie = c.trim();
      if (cookie.startsWith('analytics_consent=')) return cookie.split('=')[1] === 'true';
    }
    return false; // GDPR default: no cookie = no consent
  }

  // Module 10: set consent cookie for 1 year
  function grant() {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    document.cookie = `analytics_consent=true;expires=${exp.toUTCString()};path=/;SameSite=Lax`;
    _removeBanner();
  }

  // Module 10: revoke consent and clear session analytics data
  function revoke() {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    document.cookie = `analytics_consent=false;expires=${exp.toUTCString()};path=/;SameSite=Lax`;
    try {
      sessionStorage.removeItem('_collector_sid');
      sessionStorage.removeItem('_collector_sampled');
      sessionStorage.removeItem('_collector_retry');
    } catch (e) { /* sessionStorage unavailable */ }
    _removeBanner();
  }

  function _removeBanner() {
    const b = document.getElementById('_consent_banner');
    if (b) b.parentNode.removeChild(b);
  }

  // Module 10: minimal consent banner — no framework, pure DOM
  function showBanner(opts) {
    opts = opts || {};
    if (document.cookie.includes('analytics_consent=')) return; // already decided

    const banner = document.createElement('div');
    banner.id = '_consent_banner';
    banner.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;background:#2c3e50;color:#fff;' +
      'padding:14px 20px;display:flex;align-items:center;gap:12px;z-index:9999;' +
      'font:14px/-apple-system,sans-serif;box-shadow:0 -2px 8px rgba(0,0,0,.3)';

    const msg = document.createElement('span');
    msg.style.flex = '1';
    msg.textContent = opts.message ||
      'This site uses analytics to understand how visitors use it. No personal data is sold.';

    const btnStyle = 'border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-size:14px';

    const accept = document.createElement('button');
    accept.textContent = opts.acceptText || 'Accept';
    accept.style.cssText = btnStyle + ';background:#27ae60;color:#fff;font-weight:bold';
    accept.onclick = () => { grant(); if (opts.onAccept) opts.onAccept(); };

    const decline = document.createElement('button');
    decline.textContent = opts.declineText || 'Decline';
    decline.style.cssText = btnStyle + ';background:transparent;color:#fff;border:1px solid #fff';
    decline.onclick = () => { revoke(); if (opts.onDecline) opts.onDecline(); };

    banner.appendChild(msg);
    banner.appendChild(accept);
    banner.appendChild(decline);
    document.body.appendChild(banner);
  }

  return { check, grant, revoke, showBanner };
})();

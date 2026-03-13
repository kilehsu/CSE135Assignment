// Public API: collector.init(opts), collector.track(event, data),
//             collector.set(key, value), collector.identify(userId),
//             collector.use(extension)

const collector = (function () {
  "use strict";

  // private state
  let config = {};
  let initialized = false;
  let blocked = false;
  const globalProps = {};

  // extension registry
  const extensions = {};

  // time-on-page (visible time only)
  let pageShowTime = Date.now();
  let totalVisibleMs = 0;

  // defaults, page author only overrides what they need
  const DEFAULTS = {
    endpoint: "https://collector.lehum.site/collect",
    enableTechnographics: true,
    enableTiming: true,
    enableVitals: true,
    enableErrors: true,
    enableActivity: true, // Module 09: mouse, keyboard, idle, page enter/exit
    sampleRate: 1.0, // 100% of sessions
    debug: false, // log to console, skip network
    detectBots: true, // Module 10: skip for automated browsers
  };

  // debug-only logger
  function log(...args) {
    if (config.debug) console.log("[collector]", ...args);
  }
  function warn(...args) {
    console.warn("[collector]", ...args);
  }

  // 2 decimal places for timing values
  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // GET request the server responds to with a 1x1 GIF test
  function sendTrackingPixel() {
    try {
      const sid = getSessionId();
      const params = `sid=${encodeURIComponent(sid)}&url=${encodeURIComponent(window.location.href)}&t=${Date.now()}`;
      const img = new Image();
      img.src = `${config.endpoint.replace(/\/collect$/, "")}/collect/pixel.gif?${params}`;
      log("tracking pixel fired:", img.src);
    } catch (e) {
      /* silent */
    }
  }

  // session identity with sessionStorage
  function getSessionId() {
    let sid = sessionStorage.getItem("_collector_sid");
    if (!sid) {
      sid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem("_collector_sid", sid);
    }
    return sid;
  }

  // sampling once per session
  function shouldSample() {
    const stored = sessionStorage.getItem("_collector_sampled");
    if (stored !== null) return stored === "true";
    const result = Math.random() < config.sampleRate;
    sessionStorage.setItem("_collector_sampled", String(result));
    return result;
  }

  // Network Information API
  function getNetworkInfo() {
    if (!("connection" in navigator)) return {};
    const conn = navigator.connection;
    return {
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
      rtt: conn.rtt,
      saveData: conn.saveData,
    };
  }

  // detect browser capabilities
  function getCapabilities() {
    const caps = { javascript: true, images: true, css: false };

    const el = document.createElement("div");
    el.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px";
    document.body.appendChild(el);
    const computed = window.getComputedStyle(el);
    caps.css = computed.display !== "" && computed.display !== undefined;
    document.body.removeChild(el);

    return caps;
  }

  // cookie
  function setCookieBridge(caps) {
    const sid = getSessionId();
    const vp = window.innerWidth + "x" + window.innerHeight;
    const js = caps && caps.javascript ? "1" : "0";
    const img = caps && caps.images ? "1" : "0";
    const css = caps && caps.css ? "1" : "0";

    document.cookie = `_sid=${sid};path=/;max-age=1800;SameSite=Lax`;
    document.cookie = `_vp=${vp};path=/;max-age=1800;SameSite=Lax`;
    document.cookie = `_caps=js:${js},img:${img},css:${css};path=/;max-age=1800;SameSite=Lax`;
  }

  // navigation timing, called after load event
  function getNavigationTiming() {
    const entries = performance.getEntriesByType("navigation");
    if (!entries.length) return {};
    const n = entries[0];

    return {
      pageStarted: new Date(
        performance.timeOrigin + n.fetchStart,
      ).toISOString(),
      pageEnded: new Date(
        performance.timeOrigin + n.loadEventEnd,
      ).toISOString(),
      totalLoadMs: round(n.loadEventEnd - n.fetchStart),
      ttfb: round(n.responseStart - n.requestStart),
      dnsLookup: round(n.domainLookupEnd - n.domainLookupStart),
      tcpConnect: round(n.connectEnd - n.connectStart),
      tlsHandshake:
        n.secureConnectionStart > 0
          ? round(n.connectEnd - n.secureConnectionStart)
          : 0,
      download: round(n.responseEnd - n.responseStart),
      domInteractive: round(n.domInteractive - n.fetchStart),
      domComplete: round(n.domComplete - n.fetchStart),
      transferSize: n.transferSize,
      raw: {
        fetchStart: n.fetchStart,
        responseStart: n.responseStart,
        responseEnd: n.responseEnd,
        domInteractive: n.domInteractive,
        domComplete: n.domComplete,
        loadEventEnd: n.loadEventEnd,
      },
    };
  }

  // resource summary
  function getResourceSummary() {
    const resources = performance.getEntriesByType("resource");
    const byType = {
      script: { count: 0, totalTransfer: 0, totalDuration: 0 },
      link: { count: 0, totalTransfer: 0, totalDuration: 0 },
      img: { count: 0, totalTransfer: 0, totalDuration: 0 },
      font: { count: 0, totalTransfer: 0, totalDuration: 0 },
      fetch: { count: 0, totalTransfer: 0, totalDuration: 0 },
      xmlhttprequest: { count: 0, totalTransfer: 0, totalDuration: 0 },
      other: { count: 0, totalTransfer: 0, totalDuration: 0 },
    };

    let totalTransfer = 0;
    let totalDuration = 0;

    resources.forEach((r) => {
      const type = byType[r.initiatorType] ? r.initiatorType : "other";
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
      .map((r) => ({
        name: r.name,
        duration: round(r.duration),
        type: r.initiatorType,
      }));

    return {
      count: resources.length,
      totalTransfer,
      totalDuration: round(totalDuration),
      byType,
      slowest,
    };
  }

  // thresholds
  const THRESHOLDS = { lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500] };

  function getRating(metric, value) {
    const t = THRESHOLDS[metric];
    if (!t) return null;
    if (value <= t[0]) return "good";
    if (value <= t[1]) return "needsImprovement";
    return "poor";
  }

  // Web Vitals state
  let lcpValue = 0;
  let clsValue = 0;
  let inpValue = 0;
  const inpInteractions = [];

  // LCP
  function observeLCP() {
    try {
      const obs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        lcpValue =
          entries[entries.length - 1].renderTime ||
          entries[entries.length - 1].loadTime;
        log("LCP updated:", round(lcpValue), "ms", getRating("lcp", lcpValue));
      });
      obs.observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {
      warn("LCP observer not supported:", e.message);
    }
  }

  // CLS
  function observeCLS() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }
        log(
          "CLS updated:",
          Math.round(clsValue * 1000) / 1000,
          getRating("cls", clsValue),
        );
      });
      obs.observe({ type: "layout-shift", buffered: true });
    } catch (e) {
      warn("CLS observer not supported:", e.message);
    }
  }

  // INP
  function observeINP() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) inpInteractions.push(entry.duration);
        }
        if (inpInteractions.length) inpValue = Math.max(...inpInteractions);
        log("INP updated:", round(inpValue), "ms", getRating("inp", inpValue));
      });
      obs.observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch (e) {
      warn("INP observer not supported:", e.message);
    }
  }

  // error deduplication state + rate limit
  const MAX_ERRORS = 10;
  const reportedErrors = new Set();
  let errorCount = 0;

  // send one error beacon, deduplicated + rate-limited
  function reportError(errorData) {
    if (errorCount >= MAX_ERRORS) return;
    const key = `${errorData.type}:${errorData.message || ""}:${errorData.source || ""}:${errorData.lineno || ""}`;
    if (reportedErrors.has(key)) return;
    reportedErrors.add(key);
    errorCount++;

    send({
      type: "error",
      sessionId: getSessionId(),
      url: window.location.href,
      page: document.title,
      timestamp: new Date().toISOString(),
      error: errorData,
    });
  }

  // attach global error listeners
  function initErrorTracking() {
    window.addEventListener(
      "error",
      (event) => {
        if (event instanceof ErrorEvent) {
          reportError({
            type: "js-error",
            message: event.message,
            source: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error ? event.error.stack : "",
          });
        } else {
          const t = event.target;
          if (
            t &&
            (t.tagName === "IMG" ||
              t.tagName === "SCRIPT" ||
              t.tagName === "LINK")
          ) {
            reportError({
              type: "resource-error",
              message: `Failed to load ${t.tagName}: ${t.src || t.href || ""}`,
              source: t.src || t.href || "",
            });
          }
        }
      },
      true,
    );

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      reportError({
        type: "promise-rejection",
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : "",
      });
    });

    log("Error tracking enabled");
  }

  // detect automated browsers (Puppeteer, Selenium, Playwright, headless)
  function isBot() {
    if (navigator.webdriver) return true;
    const ua = navigator.userAgent;
    if (/HeadlessChrome|PhantomJS|Lighthouse/i.test(ua)) return true;
    if (/Chrome/.test(ua) && !window.chrome) return true; // spoofed or headless Chrome
    if (window._phantom || window.__nightmare || window.callPhantom)
      return true;
    return false;
  }

  // sessionStorage retry queue
  function queueForRetry(payload) {
    try {
      const q = JSON.parse(sessionStorage.getItem("_collector_retry") || "[]");
      if (q.length >= 50) return;
      q.push(payload);
      sessionStorage.setItem("_collector_retry", JSON.stringify(q));
    } catch (e) {
      /* sessionStorage full or unavailable */
    }
  }

  function processRetryQueue() {
    try {
      const q = JSON.parse(sessionStorage.getItem("_collector_retry") || "[]");
      if (!q.length) return;
      sessionStorage.removeItem("_collector_retry");
      q.forEach((p) => send(p));
      log("Drained retry queue:", q.length, "item(s)");
    } catch (e) {
      /* sessionStorage unavailable */
    }
  }

  // cascading delivery, skips network and logs to console instead, self-measurement via performance.mark
  function send(payload) {
    // Merge global properties (set via collector.set())
    for (const k of Object.keys(globalProps)) {
      payload[k] = globalProps[k];
    }

    log("payload:", payload);

    if (config.debug) return;

    performance.mark("collector_send_start"); // self-measurement

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: "application/json" });
    const url = config.endpoint || DEFAULTS.endpoint;

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(url, blob);
      performance.mark("collector_send_end");
      performance.measure(
        "collector_send",
        "collector_send_start",
        "collector_send_end",
      );
      if (sent) return;
    }

    fetch(url, {
      method: "POST",
      body: json,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {
      // retry on fetch failure
      fetch(url, {
        method: "POST",
        body: json,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        queueForRetry(payload); // last resort, store for next page load
      });
    });
  }

  // pageview beacon
  function collectPageview() {
    const caps = getCapabilities();
    setCookieBridge(caps);

    const payload = {
      type: "pageview",
      sessionId: getSessionId(),
      url: window.location.href,
      page: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),

      static: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookiesEnabled: navigator.cookieEnabled,
        jsEnabled: caps.javascript,
        imagesEnabled: caps.images,
        cssEnabled: caps.css,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
        colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        network: getNetworkInfo(),
      },
    };

    if (config.enableTiming) {
      payload.performance = getNavigationTiming();
      payload.resources = getResourceSummary();
    }

    send(payload);
    sendTrackingPixel(); // log the hit server-side via Apache
  }

  // vitals beacon, when the user leaves the page
  function sendVitals() {
    const ratings = {
      lcp: getRating("lcp", lcpValue),
      cls: getRating("cls", clsValue),
      inp: getRating("inp", inpValue),
    };
    const rankOrder = { poor: 2, needsImprovement: 1, good: 0 };
    const overall = Object.values(ratings).reduce(
      (worst, r) => (rankOrder[r] > rankOrder[worst] ? r : worst),
      "good",
    );

    send({
      type: "web-vitals",
      sessionId: getSessionId(),
      url: window.location.href,
      page: document.title,
      timestamp: new Date().toISOString(),
      vitals: {
        lcp: { value: round(lcpValue), rating: ratings.lcp },
        cls: { value: Math.round(clsValue * 1000) / 1000, rating: ratings.cls },
        inp: { value: round(inpValue), rating: ratings.inp },
        overall,
      },
    });
  }

  // activity event buffer
  const activityEvents = [];
  let pageEnteredAt = null;

  function pushEvent(kind, data) {
    activityEvents.push({ kind, ...data, timestamp: new Date().toISOString() });
  }

  // idle detection
  let idleTimer = null;
  let idleStart = null;

  function resetIdle() {
    if (idleStart !== null) {
      // user came back
      const endedAt = new Date().toISOString();
      const duration = Date.now() - idleStart;
      pushEvent("idle", { duration, endedAt });
      idleStart = null;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleStart = Date.now();
    }, 2000);
  }

  // flush buffered activity events to the server
  function flushActivity() {
    if (!activityEvents.length) return;
    const events = activityEvents.splice(0); // drain the array
    send({
      type: "activity",
      sessionId: getSessionId(),
      url: window.location.href,
      page: document.title,
      timestamp: new Date().toISOString(),
      events,
    });
  }

  // wire up mouse, keyboard, scroll, and idle listeners
  function initActivityTracking() {
    pageEnteredAt = new Date().toISOString();
    pushEvent("page-enter", {
      url: window.location.href,
      page: document.title,
    });

    // Throttle helpers
    let lastMove = 0;
    let lastScroll = 0;

    document.addEventListener("mousemove", (e) => {
      const now = Date.now();
      if (now - lastMove < 100) return;
      lastMove = now;
      pushEvent("mousemove", { x: e.clientX, y: e.clientY });
      resetIdle();
    });

    // Clicks
    document.addEventListener("click", (e) => {
      pushEvent("click", { x: e.clientX, y: e.clientY, button: e.button });
      resetIdle();
    });

    // Scroll depth milestone tracking (25 / 50 / 75 / 100 %)
    let maxScrollPct = 0;
    const scrollDepthReported = {};
    const SCROLL_MILESTONES = [25, 50, 75, 100];

    function measureScrollDepth() {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      if (docHeight <= 0) return;
      const pct = Math.round(((scrollTop + window.innerHeight) / docHeight) * 100);
      if (pct > maxScrollPct) maxScrollPct = pct;
      for (const t of SCROLL_MILESTONES) {
        if (pct >= t && !scrollDepthReported[t]) {
          scrollDepthReported[t] = true;
          pushEvent("scroll-depth", { milestone: t, maxDepth: maxScrollPct });
        }
      }
    }

    window.addEventListener("scroll", () => {
      const now = Date.now();
      if (now - lastScroll < 100) return;
      lastScroll = now;
      pushEvent("scroll", { scrollX: window.scrollX, scrollY: window.scrollY });
      measureScrollDepth();
      resetIdle();
    });

    // Key events
    document.addEventListener("keydown", (e) => {
      pushEvent("keydown", { key: e.key, code: e.code });
      resetIdle();
    });

    document.addEventListener("keyup", (e) => {
      pushEvent("keyup", { key: e.key, code: e.code });
      resetIdle();
    });

    // Page exit
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        pushEvent("page-exit", {
          url: window.location.href,
          page: document.title,
          enteredAt: pageEnteredAt,
          exitedAt: new Date().toISOString(),
        });
        flushActivity();
      }
    });

    resetIdle(); // start the idle timer
    log("Activity tracking enabled");
  }

  // register an extension
  function use(extension) {
    if (!extension || !extension.name) {
      warn("use(): extension must have a name property");
      return;
    }
    if (extensions[extension.name]) {
      warn(`use(): extension "${extension.name}" already registered`);
      return;
    }
    extensions[extension.name] = extension;

    if (typeof extension.init === "function") {
      extension.init({
        track,
        set,
        pushEvent,
        getConfig: () => ({ ...config }),
        getSessionId,
      });
    }

    log("Extension registered:", extension.name);
  }

  // Public API

  // configure and start the collector
  function init(options) {
    if (initialized) {
      warn("collector.init() called more than once — ignoring");
      return;
    }

    // Merge user options with defaults
    config = {};
    for (const key of Object.keys(DEFAULTS)) {
      config[key] =
        options && options[key] !== undefined ? options[key] : DEFAULTS[key];
    }

    // Sampling
    if (!shouldSample()) {
      log(`Session not sampled (rate: ${config.sampleRate})`);
      return;
    }

    performance.mark("collector_init_start"); // self-measurement

    // bot detection
    if (config.detectBots && isBot()) {
      log("bot detected — collection disabled");
      blocked = true;
      initialized = true;
      return;
    }

    initialized = true;

    // attach error listeners before anything else can throw
    if (config.enableErrors) initErrorTracking();

    // start activity tracking
    if (config.enableActivity) initActivityTracking();

    // start vitals observers immediately
    if (config.enableVitals) {
      observeLCP();
      observeCLS();
      observeINP();
    }

    // drain any beacons that failed on a previous page load
    processRetryQueue();

    // fire pageview beacon after load
    if (document.readyState === "complete") {
      setTimeout(collectPageview, 0);
    } else {
      window.addEventListener("load", () => setTimeout(collectPageview, 0));
    }

    // send final vitals when user hides the tab or navigates away
    // track time-on-page
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        totalVisibleMs += Date.now() - pageShowTime;
        if (config.enableVitals) sendVitals();
      } else {
        pageShowTime = Date.now(); // tab became visible again
      }
    });

    performance.mark("collector_init_end");
    performance.measure(
      "collector_init",
      "collector_init_start",
      "collector_init_end",
    );
    log("initialized", config);
  }

  // send a custom event with optional data
  function track(eventName, data) {
    if (!initialized) {
      warn("track() called before init()");
      return;
    }
    if (blocked) return;
    const payload = {
      type: eventName || "custom-event",
      sessionId: getSessionId(),
      url: window.location.href,
      page: document.title,
      timestamp: new Date().toISOString(),
    };
    if (data) payload.properties = data;
    send(payload);
  }

  // attach a property to every future beacon
  function set(key, value) {
    globalProps[key] = value;
    log("global prop set:", key, "=", value);
  }

  // link the session to an authenticated user
  function identify(userId) {
    globalProps.userId = userId;
    log("user identified:", userId);
  }

  // command queue
  const publicAPI = { init, track, set, identify, use };

  (function processQueue() {
    const q = window._cq || [];
    for (const args of q) {
      const method = args[0];
      const params = args.slice(1);
      if (typeof publicAPI[method] === "function") publicAPI[method](...params);
    }
    // Replace the plain array with a live proxy
    window._cq = {
      push(args) {
        const method = args[0];
        const params = args.slice(1);
        if (typeof publicAPI[method] === "function")
          publicAPI[method](...params);
      },
    };
  })();

  // Auto-initialize with defaults
  if (!initialized) {
    init();
  }

  return publicAPI;
})();

// Extensions
// Register with: collector.use(ClickTracker) / collector.use(ScrollTracker)

// click tracker extension
// CSS selector path + coordinates
window.ClickTracker = {
  name: "click-tracker",
  _handler: null,

  init(api) {
    let lastClick = 0;
    this._handler = (event) => {
      const now = Date.now();
      if (now - lastClick < 300) return; // debounce rapid double-clicks
      lastClick = now;
      const t = event.target;
      api.track("click", {
        tagName: t.tagName,
        id: t.id || undefined,
        class: t.className || undefined,
        text: (t.textContent || "").trim().substring(0, 100),
        x: event.clientX,
        y: event.clientY,
        selector: this._getSelector(t),
      });
    };
    document.addEventListener("click", this._handler, true);
  },

  // build a CSS path
  _getSelector(el) {
    const parts = [];
    while (el && el !== document.body) {
      let part = el.tagName.toLowerCase();
      if (el.id) {
        parts.unshift(`${part}#${el.id}`);
        break;
      }
      if (el.className && typeof el.className === "string") {
        part += `.${el.className.trim().split(/\s+/).join(".")}`;
      }
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(" > ");
  },

  destroy() {
    if (this._handler) {
      document.removeEventListener("click", this._handler, true);
      this._handler = null;
    }
  },
};

// scroll depth extension
window.ScrollTracker = {
  name: "scroll-tracker",
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
      requestAnimationFrame(() => {
        this._measure();
        ticking = false;
      });
    };
    window.addEventListener("scroll", this._scrollHandler);

    this._visHandler = () => {
      if (document.visibilityState === "hidden") {
        api.pushEvent("scroll-final", { maxDepth: this._maxDepth });
      }
    };
    document.addEventListener("visibilitychange", this._visHandler);
  },

  _measure() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    const pct = Math.round(
      ((scrollTop + window.innerHeight) / docHeight) * 100,
    );

    if (pct > this._maxDepth) this._maxDepth = pct;

    for (const t of this._thresholds) {
      if (pct >= t && !this._reported[t]) {
        this._reported[t] = true;
        this._api.pushEvent("scroll-depth", {
          milestone: t,
          maxDepth: this._maxDepth,
        });
      }
    }
  },

  destroy() {
    if (this._scrollHandler)
      window.removeEventListener("scroll", this._scrollHandler);
    if (this._visHandler)
      document.removeEventListener("visibilitychange", this._visHandler);
  },
};

// ConsentManager

window.ConsentManager = (function () {
  "use strict";

  function check() {
    if (navigator.globalPrivacyControl) return false;
    const cookies = document.cookie.split(";");
    for (const c of cookies) {
      const cookie = c.trim();
      if (cookie.startsWith("analytics_consent="))
        return cookie.split("=")[1] === "true";
    }
    return false;
  }

  // set consent cookie for 1 year
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
      sessionStorage.removeItem("_collector_sid");
      sessionStorage.removeItem("_collector_sampled");
      sessionStorage.removeItem("_collector_retry");
    } catch (e) {
      /* sessionStorage unavailable */
    }
    _removeBanner();
  }

  function _removeBanner() {
    const b = document.getElementById("_consent_banner");
    if (b) b.parentNode.removeChild(b);
  }

  // minimal consent banner
  function showBanner(opts) {
    opts = opts || {};
    if (document.cookie.includes("analytics_consent=")) return; // already decided

    const banner = document.createElement("div");
    banner.id = "_consent_banner";
    banner.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;background:#2c3e50;color:#fff;" +
      "padding:14px 20px;display:flex;align-items:center;gap:12px;z-index:9999;" +
      "font:14px/-apple-system,sans-serif;box-shadow:0 -2px 8px rgba(0,0,0,.3)";

    const msg = document.createElement("span");
    msg.style.flex = "1";
    msg.textContent =
      opts.message ||
      "This site uses analytics to understand how visitors use it. No personal data is sold.";

    const btnStyle =
      "border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-size:14px";

    const accept = document.createElement("button");
    accept.textContent = opts.acceptText || "Accept";
    accept.style.cssText =
      btnStyle + ";background:#27ae60;color:#fff;font-weight:bold";
    accept.onclick = () => {
      grant();
      if (opts.onAccept) opts.onAccept();
    };

    const decline = document.createElement("button");
    decline.textContent = opts.declineText || "Decline";
    decline.style.cssText =
      btnStyle + ";background:transparent;color:#fff;border:1px solid #fff";
    decline.onclick = () => {
      revoke();
      if (opts.onDecline) opts.onDecline();
    };

    banner.appendChild(msg);
    banner.appendChild(accept);
    banner.appendChild(decline);
    document.body.appendChild(banner);
  }

  return { check, grant, revoke, showBanner };
})();

(function (window, document) {
  "use strict";

  var config = {
    endpoint: "https://collector.lehum.site/collect",
    idleThresholdMs: 2000,
    activityBatchMs: 3000,
    maxErrors: 10,
    sampleRate: 1.0,
    debug: false,
    respectDNT: false,
    consentRequired: false,
    retryLimit: 3,
    retryDelayMs: 1000,
    trackResources: true,
    trackVitals: true,
    trackClicks: true,
    trackScrollDepth: true,
    pixelPath: "/collect/pixel.gif",
  };

  function isBot() {
    var ua = navigator.userAgent;
    if (
      /bot|crawl|spider|slurp|facebookexternalhit|bingpreview|mediapartners|google|yandex|baidu|duckduck|headless|phantom|puppeteer|selenium|playwright/i.test(
        ua,
      )
    ) {
      return true;
    }
    if (navigator.webdriver) return true;
    return false;
  }

  var sampled = true;

  function evaluateSampling() {
    if (config.sampleRate >= 1.0) {
      sampled = true;
      return;
    }
    if (config.sampleRate <= 0.0) {
      sampled = false;
      return;
    }
    // per-session sampling using sessionStorage
    try {
      var key = "_col_sampled";
      var stored = sessionStorage.getItem(key);
      if (stored !== null) {
        sampled = stored === "1";
      } else {
        sampled = Math.random() < config.sampleRate;
        sessionStorage.setItem(key, sampled ? "1" : "0");
      }
    } catch (e) {
      sampled = Math.random() < config.sampleRate;
    }
  }

  var consentGranted = false;
  var consentQueue = []; // beacons queued

  function grantConsent() {
    consentGranted = true;
    // queued before consent
    while (consentQueue.length) {
      var pending = consentQueue.shift();
      doSend(pending);
    }
  }

  function revokeConsent() {
    consentGranted = false;
    consentQueue = [];
  }

  function getSessionId() {
    try {
      var sid = sessionStorage.getItem("_col_sid");
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("_col_sid", sid);
      }
      return sid;
    } catch (e) {
      return "nostorage-" + Math.random().toString(36).slice(2);
    }
  }

  var SESSION_ID = getSessionId();
  var userId = null;
  var customProps = {};

  var retryQueue = [];

  function scheduleRetry(payload, attempt) {
    if (attempt >= config.retryLimit) {
      debugLog("Retry limit reached, dropping payload", payload);
      return;
    }
    var delay = config.retryDelayMs * Math.pow(2, attempt);
    retryQueue.push({
      payload: payload,
      attempt: attempt,
      timer: setTimeout(function () {
        doSend(payload, attempt + 1);
      }, delay),
    });
  }

  function debugLog() {
    if (!config.debug) return;
    var args = ["[collector]"].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function doSend(payload, retryAttempt) {
    retryAttempt = retryAttempt || 0;
    payload.sessionId = SESSION_ID;
    if (userId) payload.userId = userId;
    var k;
    for (k in customProps) {
      if (customProps.hasOwnProperty(k)) {
        payload[k] = customProps[k];
      }
    }

    var body = JSON.stringify(payload);
    debugLog("send", payload.type, payload);

    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      var ok = navigator.sendBeacon(config.endpoint, blob);
      if (!ok) scheduleRetry(payload, retryAttempt);
    } else if (typeof fetch !== "undefined") {
      fetch(config.endpoint, {
        method: "POST",
        body: body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(function () {
        scheduleRetry(payload, retryAttempt);
      });
    } else {
      // XHR
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", config.endpoint, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(body);
      } catch (e) {
        scheduleRetry(payload, retryAttempt);
      }
    }
  }

  function send(payload) {
    if (!sampled) return;
    if (config.respectDNT && navigator.doNotTrack === "1") return;
    if (config.consentRequired && !consentGranted) {
      consentQueue.push(payload);
      debugLog("Queued (awaiting consent)", payload.type);
      return;
    }
    doSend(payload);
  }

  function probeImages() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve(true);
      };
      img.onerror = function () {
        resolve(false);
      };
      img.src =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    });
  }

  function probeCSS() {
    try {
      var el = document.createElement("div");
      el.style.cssText = "position:absolute;visibility:hidden;width:100px";
      document.body.appendChild(el);
      var w = window.getComputedStyle(el).width;
      document.body.removeChild(el);
      return w === "100px";
    } catch (e) {
      return false;
    }
  }

  function getStaticData(imagesEnabled) {
    var net = {};
    if (navigator.connection) {
      var c = navigator.connection;
      net = {
        effectiveType: c.effectiveType || "",
        downlink: c.downlink || 0,
        rtt: c.rtt || 0,
        saveData: c.saveData || false,
      };
    }

    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages
        ? navigator.languages.slice()
        : [navigator.language],
      cookiesEnabled: navigator.cookieEnabled,
      jsEnabled: true,
      imagesEnabled: imagesEnabled,
      cssEnabled: probeCSS(),
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      network: net,
    };
  }

  function sendTrackingPixel(data) {
    try {
      var params = [];
      for (var k in data) {
        if (data.hasOwnProperty(k)) {
          params.push(
            encodeURIComponent(k) + "=" + encodeURIComponent(data[k]),
          );
        }
      }
      var img = new Image();
      img.src =
        config.endpoint.replace(/\/collect$/, "") +
        config.pixelPath +
        "?sid=" +
        SESSION_ID +
        "&" +
        params.join("&") +
        "&t=" +
        Date.now();
      debugLog("tracking pixel", img.src);
    } catch (e) {
      /* silent */
    }
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  function getPerformanceData() {
    var entries = performance.getEntriesByType("navigation");
    if (!entries.length) return {};

    var n = entries[0];

    return {
      raw: {
        fetchStart: round(n.fetchStart),
        domainLookupStart: round(n.domainLookupStart),
        domainLookupEnd: round(n.domainLookupEnd),
        connectStart: round(n.connectStart),
        connectEnd: round(n.connectEnd),
        secureConnectionStart: round(n.secureConnectionStart),
        requestStart: round(n.requestStart),
        responseStart: round(n.responseStart),
        responseEnd: round(n.responseEnd),
        domInteractive: round(n.domInteractive),
        domContentLoadedEventStart: round(n.domContentLoadedEventStart),
        domContentLoadedEventEnd: round(n.domContentLoadedEventEnd),
        domComplete: round(n.domComplete),
        loadEventStart: round(n.loadEventStart),
        loadEventEnd: round(n.loadEventEnd),
        redirectCount: n.redirectCount,
        type: n.type,
        transferSize: n.transferSize,
        encodedBodySize: n.encodedBodySize,
        decodedBodySize: n.decodedBodySize,
      },
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
      headerSize: n.transferSize - n.encodedBodySize,
    };
  }

  function getResourceTimingData() {
    var resources = performance.getEntriesByType("resource");
    if (!resources.length) return null;

    var totalTransfer = 0;
    var totalDuration = 0;
    var byType = {}; // group by initiatorType
    var slowest = []; // top 5 slowest

    for (var i = 0; i < resources.length; i++) {
      var r = resources[i];
      totalTransfer += r.transferSize || 0;
      totalDuration += r.duration || 0;

      var type = r.initiatorType || "other";
      if (!byType[type]) {
        byType[type] = { count: 0, totalTransfer: 0, totalDuration: 0 };
      }
      byType[type].count++;
      byType[type].totalTransfer += r.transferSize || 0;
      byType[type].totalDuration += r.duration || 0;

      slowest.push({
        name: r.name.substring(0, 120),
        type: type,
        duration: round(r.duration),
        transferSize: r.transferSize || 0,
      });
    }

    // Sort slowest descending and take top 5
    slowest.sort(function (a, b) {
      return b.duration - a.duration;
    });
    slowest = slowest.slice(0, 5);

    var t;
    for (t in byType) {
      if (byType.hasOwnProperty(t)) {
        byType[t].totalDuration = round(byType[t].totalDuration);
      }
    }

    return {
      count: resources.length,
      totalTransfer: totalTransfer,
      totalDuration: round(totalDuration),
      byType: byType,
      slowest: slowest,
    };
  }

  var vitals = {
    lcp: null,
    cls: 0,
    inp: null,
  };

  function initLCP() {
    try {
      var observer = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        if (entries.length) {
          var last = entries[entries.length - 1];
          vitals.lcp = round(last.startTime);
          debugLog("LCP", vitals.lcp, last.element ? last.element.tagName : "");
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {
      debugLog("LCP observer not supported");
    }
  }

  // CLS
  function initCLS() {
    try {
      var sessionValue = 0;
      var sessionEntries = [];
      var observer = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (!entry.hadRecentInput) {
            sessionValue += entry.value;
            sessionEntries.push(entry);
          }
        }
        vitals.cls = round(sessionValue * 1000) / 1000;
        debugLog("CLS", vitals.cls);
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch (e) {
      debugLog("CLS observer not supported");
    }
  }

  // INP — track all event timing entries, keep the worst interaction
  // INP is the highest single-interaction latency (or p98 for pages with
  // many interactions, but we keep the max for simplicity)
  function initINP() {
    try {
      var interactions = {}; // interactionId → max duration

      var observer = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (!entry.interactionId) continue;

          var id = entry.interactionId;
          var dur = entry.duration;
          if (!interactions[id] || dur > interactions[id]) {
            interactions[id] = dur;
          }
        }

        // INP = worst interaction (for low interaction counts) or p98
        var durations = [];
        var key;
        for (key in interactions) {
          if (interactions.hasOwnProperty(key)) {
            durations.push(interactions[key]);
          }
        }
        if (durations.length) {
          durations.sort(function (a, b) {
            return a - b;
          });
          // Use p98 if we have 50+ interactions, otherwise use max
          var idx =
            durations.length >= 50
              ? Math.floor(durations.length * 0.98) - 1
              : durations.length - 1;
          vitals.inp = round(durations[Math.max(0, idx)]);
          debugLog("INP", vitals.inp);
        }
      });
      observer.observe({
        type: "event",
        buffered: true,
        durationThreshold: 16,
      });
    } catch (e) {
      debugLog("INP observer not supported");
    }
  }

  function getVitalsScore() {
    function rateLCP(val) {
      if (val === null) return "unknown";
      if (val <= 2500) return "good";
      if (val <= 4000) return "needs-improvement";
      return "poor";
    }
    function rateCLS(val) {
      if (val <= 0.1) return "good";
      if (val <= 0.25) return "needs-improvement";
      return "poor";
    }
    function rateINP(val) {
      if (val === null) return "unknown";
      if (val <= 200) return "good";
      if (val <= 500) return "needs-improvement";
      return "poor";
    }

    var lcpRating = rateLCP(vitals.lcp);
    var clsRating = rateCLS(vitals.cls);
    var inpRating = rateINP(vitals.inp);

    var overall = "good";
    if (lcpRating === "poor" || clsRating === "poor" || inpRating === "poor") {
      overall = "poor";
    } else if (
      lcpRating === "needs-improvement" ||
      clsRating === "needs-improvement" ||
      inpRating === "needs-improvement"
    ) {
      overall = "needs-improvement";
    } else if (lcpRating === "unknown" || inpRating === "unknown") {
      overall = "incomplete";
    }

    return {
      lcp: { value: vitals.lcp, rating: lcpRating },
      cls: { value: vitals.cls, rating: clsRating },
      inp: { value: vitals.inp, rating: inpRating },
      overall: overall,
    };
  }

  function sendVitals() {
    var score = getVitalsScore();
    send({
      type: "web-vitals",
      vitals: score,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      page: document.title,
    });
    debugLog("vitals sent", score);
  }

  var reportedErrors = {};
  var errorCount = 0;

  function reportError(errorData) {
    if (errorCount >= config.maxErrors) return;
    var key =
      (errorData.type || "") +
      ":" +
      (errorData.message || "") +
      ":" +
      (errorData.source || "") +
      ":" +
      (errorData.line || "");
    if (reportedErrors[key]) return;
    reportedErrors[key] = true;
    errorCount++;

    send({
      type: "error",
      error: errorData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      page: document.title,
    });
  }

  window.addEventListener("error", function (event) {
    if (event instanceof ErrorEvent) {
      reportError({
        type: "js-error",
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error ? event.error.stack : "",
      });
    }
  });

  window.addEventListener(
    "error",
    function (event) {
      if (!(event instanceof ErrorEvent)) {
        var t = event.target;
        if (
          t &&
          (t.tagName === "IMG" ||
            t.tagName === "SCRIPT" ||
            t.tagName === "LINK")
        ) {
          reportError({
            type: "resource-error",
            tagName: t.tagName,
            src: t.src || t.href || "",
          });
        }
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    reportError({
      type: "promise-rejection",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : "",
    });
  });

  var activityQueue = [];
  var idleTimer = null;
  var idleStart = null;
  var pageEnteredAt = new Date().toISOString();
  var activityInterval = null;

  function pushActivity(event) {
    activityQueue.push(event);
  }

  function flushActivity() {
    if (!activityQueue.length) return;
    send({
      type: "activity",
      events: activityQueue.splice(0),
      timestamp: new Date().toISOString(),
      url: window.location.href,
      page: document.title,
    });
  }

  function resetIdle() {
    if (idleStart !== null) {
      var idleDuration = Date.now() - idleStart;
      pushActivity({
        kind: "idle-end",
        endedAt: new Date().toISOString(),
        durationMs: idleDuration,
      });
      idleStart = null;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      idleStart = Date.now();
      pushActivity({
        kind: "idle-start",
        startedAt: new Date().toISOString(),
      });
    }, config.idleThresholdMs);
  }

  var lastMoveTime = 0;
  document.addEventListener("mousemove", function (e) {
    var now = Date.now();
    if (now - lastMoveTime < 200) return;
    lastMoveTime = now;
    resetIdle();
    pushActivity({
      kind: "mousemove",
      x: e.clientX,
      y: e.clientY,
      t: now,
    });
  });

  document.addEventListener("click", function (e) {
    resetIdle();
    pushActivity({
      kind: "click",
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      t: Date.now(),
    });
  });

  document.addEventListener("scroll", function () {
    resetIdle();
    pushActivity({
      kind: "scroll",
      x: window.scrollX,
      y: window.scrollY,
      t: Date.now(),
    });
  });

  document.addEventListener("keydown", function (e) {
    resetIdle();
    pushActivity({
      kind: "keydown",
      key: e.key,
      t: Date.now(),
    });
  });

  document.addEventListener("keyup", function (e) {
    resetIdle();
    pushActivity({
      kind: "keyup",
      key: e.key,
      t: Date.now(),
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      flushActivity();

      // Send final web vitals on page exit
      if (config.trackVitals) {
        sendVitals();
      }

      send({
        type: "page-exit",
        url: window.location.href,
        page: document.title,
        enteredAt: pageEnteredAt,
        exitedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
    }
  });

  function initClickTracking() {
    document.addEventListener("click", function (e) {
      var target = e.target;
      if (!target) return;

      // Walk up to find nearest meaningful element (link, button, etc.)
      var el = target;
      var depth = 0;
      while (el && depth < 5) {
        if (
          el.tagName === "A" ||
          el.tagName === "BUTTON" ||
          el.tagName === "INPUT" ||
          (el.getAttribute && el.getAttribute("role") === "button")
        ) {
          break;
        }
        el = el.parentElement;
        depth++;
      }
      if (!el) el = target;

      pushActivity({
        kind: "click-enriched",
        tagName: el.tagName,
        id: el.id || "",
        className:
          el.className && typeof el.className === "string"
            ? el.className.substring(0, 100)
            : "",
        text: (el.textContent || "").trim().substring(0, 50),
        href: el.href || "",
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
      });
    });
  }

  function initScrollDepth() {
    var maxDepth = 0;
    var milestones = { 25: false, 50: false, 75: false, 90: false, 100: false };
    var throttleTimer = null;

    function calcScrollPercent() {
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      var winHeight = window.innerHeight;
      if (docHeight <= winHeight) return 100;
      return Math.min(
        100,
        Math.round(((scrollTop + winHeight) / docHeight) * 100),
      );
    }

    function checkMilestones() {
      var pct = calcScrollPercent();
      if (pct > maxDepth) maxDepth = pct;

      for (var m in milestones) {
        if (
          milestones.hasOwnProperty(m) &&
          !milestones[m] &&
          pct >= parseInt(m, 10)
        ) {
          milestones[m] = true;
          pushActivity({
            kind: "scroll-depth",
            milestone: parseInt(m, 10),
            currentPct: pct,
            t: Date.now(),
          });
          debugLog("scroll depth milestone", m + "%");
        }
      }
    }

    document.addEventListener("scroll", function () {
      if (throttleTimer) return;
      throttleTimer = setTimeout(function () {
        throttleTimer = null;
        checkMilestones();
      }, 250);
    });

    // Also send max depth on page exit
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        pushActivity({
          kind: "scroll-depth-max",
          maxDepth: maxDepth,
          t: Date.now(),
        });
      }
    });
  }

  var plugins = [];

  function registerPlugin(plugin) {
    if (!plugin || typeof plugin.init !== "function") {
      debugLog("Invalid plugin — must have init(collector) method");
      return;
    }
    plugins.push(plugin);
    debugLog("Plugin registered:", plugin.name || "unnamed");

    // If collector is already initialized, call init immediately
    if (initialized) {
      try {
        plugin.init(publicAPI);
      } catch (e) {
        debugLog("Plugin init error:", plugin.name, e);
      }
    }
  }

  function sendPageview(staticData, perfData, resourceData) {
    var payload = {
      type: "pageview",
      url: window.location.href,
      page: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      enteredAt: pageEnteredAt,
      static: staticData,
      performance: perfData,
    };

    if (resourceData) {
      payload.resources = resourceData;
    }

    send(payload);
  }

  var initialized = false;

  function init(userConfig) {
    if (initialized) {
      debugLog("Already initialized");
      return;
    }

    // Merge user config
    if (userConfig) {
      var k;
      for (k in userConfig) {
        if (userConfig.hasOwnProperty(k) && config.hasOwnProperty(k)) {
          config[k] = userConfig[k];
        }
      }
    }

    // Bot detection — skip everything for bots
    if (isBot()) {
      debugLog("Bot detected, disabling collection");
      sampled = false;
      initialized = true;
      return;
    }

    // Sampling
    evaluateSampling();
    if (!sampled) {
      debugLog("Session not sampled (rate=" + config.sampleRate + ")");
      initialized = true;
      return;
    }

    // DNT
    if (config.respectDNT && navigator.doNotTrack === "1") {
      debugLog("DNT enabled, disabling collection");
      sampled = false;
      initialized = true;
      return;
    }

    // Start Web Vitals observers
    if (config.trackVitals) {
      initLCP();
      initCLS();
      initINP();
    }

    // Start enriched click tracking
    if (config.trackClicks) {
      initClickTracking();
    }

    // Start scroll depth tracking
    if (config.trackScrollDepth) {
      initScrollDepth();
    }

    // Start activity batch interval
    activityInterval = setInterval(flushActivity, config.activityBatchMs);

    // Initialise all registered plugins
    for (var i = 0; i < plugins.length; i++) {
      try {
        plugins[i].init(publicAPI);
      } catch (e) {
        debugLog("Plugin init error:", plugins[i].name, e);
      }
    }

    initialized = true;
    debugLog("Initialized", config);

    // Fire pageview after load
    if (document.readyState === "complete") {
      setTimeout(firePageview, 0);
    } else {
      window.addEventListener("load", function () {
        setTimeout(firePageview, 0);
      });
    }
  }

  function firePageview() {
    probeImages().then(function (imagesOk) {
      var staticData = getStaticData(imagesOk);
      var perfData = getPerformanceData();
      var resData = config.trackResources ? getResourceTimingData() : null;
      sendPageview(staticData, perfData, resData);

      // Also send a tracking pixel for server-log correlation
      sendTrackingPixel({ url: window.location.href, t: Date.now() });

      resetIdle();
    });
  }

  function track(eventName, properties) {
    if (!initialized) {
      debugLog("Not initialized — call collector.init() first");
      return;
    }
    send({
      type: "custom-event",
      event: eventName,
      properties: properties || {},
      timestamp: new Date().toISOString(),
      url: window.location.href,
      page: document.title,
    });
  }

  function set(key, value) {
    customProps[key] = value;
    debugLog("set", key, value);
  }

  function identify(uid) {
    userId = uid;
    debugLog("identify", uid);
    // Persist so subsequent pages in this session carry the ID
    try {
      sessionStorage.setItem("_col_uid", uid);
    } catch (e) {
      /* silent */
    }
  }

  // Restore userId from session if previously identified
  try {
    var storedUid = sessionStorage.getItem("_col_uid");
    if (storedUid) userId = storedUid;
  } catch (e) {
    /* silent */
  }

  var publicAPI = {
    init: init,
    track: track,
    set: set,
    identify: identify,
    use: registerPlugin,
    grantConsent: grantConsent,
    revokeConsent: revokeConsent,
    getVitalsScore: getVitalsScore,
    // Expose for plugins
    send: send,
    pushActivity: pushActivity,
    config: config,
    SESSION_ID: SESSION_ID,
  };

  function processCommand(cmd) {
    if (!Array.isArray(cmd) || !cmd.length) return;
    var method = cmd[0];
    var args = cmd.slice(1);
    if (typeof publicAPI[method] === "function") {
      publicAPI[method].apply(null, args);
    } else {
      debugLog("Unknown command:", method);
    }
  }

  // Drain any pre-queued commands
  var queue = window.CollectorQueue || [];
  for (var i = 0; i < queue.length; i++) {
    processCommand(queue[i]);
  }

  // Replace the array push with direct execution
  window.CollectorQueue = {
    push: function (cmd) {
      processCommand(cmd);
    },
  };

  // Expose the public API globally
  window.collector = publicAPI;

  if (!initialized && !queue.length) {
    init();
  }
})(window, document);

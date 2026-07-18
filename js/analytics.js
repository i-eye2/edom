/**
 * EYE — Behavioral Analytics Tracker (analytics.js) v2
 *
 * Tracks: page views, product views, time spent, IP geolocation.
 * Uses ip-api.com (free, no key needed, 45 req/min, HTTP only or HTTPS batch).
 * Saves events to Supabase `analytics_events` table.
 *
 * SETUP: Run supabase/EYE_analytics_geo_upgrade.sql in your Supabase SQL Editor.
 */
const EyeAnalytics = (function () {
  let _sessionId = null;
  let _productViewStart = null;
  let _currentProductId = null;
  let _currentProductName = null;
  let _heartbeatTimer = null;
  let _ready = false;

  // Geo cache — resolve once per session
  let _geoCache = null;
  let _geoPromise = null;

  /* ── Session ID ────────────────────────────────────────── */
  function getSessionId() {
    if (_sessionId) return _sessionId;
    try {
      let sid = sessionStorage.getItem('eye_sid');
      if (!sid) {
        sid = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('eye_sid', sid);
      }
      _sessionId = sid;
    } catch (_) {
      _sessionId = 'sid_' + Date.now().toString(36);
    }
    return _sessionId;
  }

  /* ── Geo lookup (cached per session) ───────────────────── */
  async function getGeo() {
    if (_geoCache) return _geoCache;
    if (_geoPromise) return _geoPromise;

    // Try sessionStorage first (persists across page navigations in same session)
    try {
      const cached = sessionStorage.getItem('eye_geo');
      if (cached) {
        _geoCache = JSON.parse(cached);
        return _geoCache;
      }
    } catch (_) {}

    _geoPromise = (async () => {
      try {
        // ip-api.com works on HTTP and HTTPS (free tier).
        // Fields: status,query,city,country,countryCode
        const res = await fetch('https://ip-api.com/json/?fields=status,query,city,country,countryCode', {
          signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
        });
        if (res.ok) {
          const d = await res.json();
          if (d.status === 'success') {
            const geo = {
              ip: d.query || null,
              city: d.city || null,
              country: d.country || null,
              country_code: d.countryCode || null,
            };
            _geoCache = geo;
            try { sessionStorage.setItem('eye_geo', JSON.stringify(geo)); } catch (_) {}
            return geo;
          }
        }
      } catch (_) {
        /* silent — geo must never break the page */
      }
      // Fallback: unknown geo
      const fallback = { ip: null, city: null, country: null, country_code: null };
      _geoCache = fallback;
      return fallback;
    })();

    return _geoPromise;
  }

  /* ── Internal save ─────────────────────────────────────── */
  async function _save(payload) {
    try {
      if (typeof EyeApi === 'undefined' || !EyeApi.isRemote()) return;
      // Attach geo data
      const geo = await getGeo();
      await EyeApi.saveAnalyticsEvent({
        ...payload,
        ip_address: geo.ip,
        city: geo.city,
        country: geo.country,
        country_code: geo.country_code,
        page_path: location.pathname,
      });
    } catch (e) {
      /* silent — analytics must never break the page */
    }
  }

  /* ── Public API ────────────────────────────────────────── */

  /** Call once per page (pass activePage string e.g. 'home', 'shop', 'cart') */
  function trackPageView(page) {
    if (!_ready) { _ready = true; }
    _save({
      event_type: 'page_view',
      page: page || location.pathname,
      session_id: getSessionId(),
    });

    /* Heartbeat every 55 s — keeps session "alive" for live-visitor count */
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(() => {
      _save({
        event_type: 'heartbeat',
        page: page || location.pathname,
        session_id: getSessionId(),
      });
    }, 55000);
  }

  /** Call when a product detail page loads */
  function trackProductView(productId, productName) {
    _currentProductId = productId ? String(productId) : null;
    _currentProductName = productName || null;
    _productViewStart = Date.now();
    _save({
      event_type: 'product_view',
      product_id: _currentProductId,
      product_name: _currentProductName,
      session_id: getSessionId(),
    });
  }

  /** Call on page exit / visibility hidden to save time-on-page */
  function trackProductExit() {
    if (!_currentProductId || !_productViewStart) return;
    const durationSec = Math.round((Date.now() - _productViewStart) / 1000);
    if (durationSec < 2) { _productViewStart = null; _currentProductId = null; return; }
    _save({
      event_type: 'product_exit',
      product_id: _currentProductId,
      product_name: _currentProductName,
      duration_sec: durationSec,
      session_id: getSessionId(),
    });
    _productViewStart = null;
    _currentProductId = null;
  }

  /* Register exit handlers */
  window.addEventListener('beforeunload', trackProductExit);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') trackProductExit();
  });

  return { trackPageView, trackProductView, trackProductExit, getSessionId };
})();

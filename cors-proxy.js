// ============================================================
// BIST Tracker — CORS Proxy Wrapper
// ============================================================

const CorsProxy = (() => {
  let currentProxyIdx = 0;
  const proxies = CONFIG.corsProxies;

  async function fetchViaProxy(url, opts = {}, proxyIdx = currentProxyIdx) {
    if (proxyIdx >= proxies.length) {
      throw new Error(`Tüm CORS proxy'leri başarısız oldu. URL: ${url}`);
    }

    const proxy   = proxies[proxyIdx];
    const fullUrl = proxy + encodeURIComponent(url);

    try {
      const resp = await fetch(fullUrl, {
        ...opts,
        headers: {
          'Accept': 'application/json, text/html, */*',
          ...(opts.headers || {}),
        },
        signal: opts.signal || AbortSignal.timeout(15000),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      currentProxyIdx = proxyIdx; // remember working proxy
      return resp;
    } catch (err) {
      console.warn(`Proxy ${proxy} başarısız:`, err.message, '— sonraki deneniyor…');
      return fetchViaProxy(url, opts, proxyIdx + 1);
    }
  }

  // Try direct fetch first (some KAP JSON APIs don't have CORS restriction)
  async function fetchSmart(url, opts = {}) {
    try {
      const resp = await fetch(url, {
        ...opts,
        signal: opts.signal || AbortSignal.timeout(10000),
        headers: {
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          ...(opts.headers || {}),
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp;
    } catch {
      // Fallback to proxy
      return fetchViaProxy(url, opts);
    }
  }

  async function getText(url)   { return (await fetchSmart(url)).text(); }
  async function getJSON(url)   { return (await fetchSmart(url)).json(); }
  async function getTextProxy(url) { return (await fetchViaProxy(url)).text(); }

  return { fetchSmart, fetchViaProxy, getText, getJSON, getTextProxy };
})();

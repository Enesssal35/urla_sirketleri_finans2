// ============================================================
// BIST Tracker — Store (localStorage + IndexedDB)
// ============================================================

const Store = (() => {
  const DB_NAME    = 'bist_tracker';
  const DB_VERSION = 2;
  let db = null;

  // ---------- IndexedDB bootstrap ----------
  async function openDB() {
    if (db) return db;
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('disclosures')) {
          const s = d.createObjectStore('disclosures', { keyPath: 'id' });
          s.createIndex('ticker',    'ticker',    { unique: false });
          s.createIndex('date',      'date',      { unique: false });
          s.createIndex('category',  'category',  { unique: false });
          s.createIndex('signal',    'signal',    { unique: false });
        }
        if (!d.objectStoreNames.contains('financials')) {
          const f = d.createObjectStore('financials', { keyPath: 'key' }); // key = "TICKER_YYYY_Q"
          f.createIndex('ticker', 'ticker', { unique: false });
        }
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror   = e => rej(e.target.error);
    });
  }

  async function idbPut(store, data) {
    const d = await openDB();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      const st = tx.objectStore(store);
      const r  = st.put(data);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  async function idbGetAll(store, indexName, query) {
    const d = await openDB();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readonly');
      const st = tx.objectStore(store);
      const target = indexName ? st.index(indexName).getAll(query) : st.getAll();
      target.onsuccess = () => res(target.result);
      target.onerror   = () => rej(target.error);
    });
  }

  async function idbGet(store, key) {
    const d = await openDB();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readonly');
      const r  = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  async function idbDelete(store, key) {
    const d = await openDB();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      const r  = tx.objectStore(store).delete(key);
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  }

  async function idbClear(store) {
    const d = await openDB();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      const r  = tx.objectStore(store).clear();
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  }

  // ---------- localStorage helpers ----------
  function lsGet(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : def;
    } catch { return def; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.warn('lsSet failed', e); }
  }

  function lsDel(key) { localStorage.removeItem(key); }

  // ---------- Gemini API key ----------
  function getApiKey()       { return lsGet('gemini_api_key', ''); }
  function setApiKey(k)      { lsSet('gemini_api_key', k); }

  // ---------- Stock list ----------
  function getStocks()       { return lsGet('user_stocks', null); }
  function setStocks(list)   { lsSet('user_stocks', list); }

  // ---------- Scan metadata ----------
  function getLastScanTime(period) { return lsGet(`last_scan_${period}`, null); }
  function setLastScanTime(period) { lsSet(`last_scan_${period}`, Date.now()); }
  function getInitialScanDone()    { return lsGet('initial_scan_done', false); }
  function setInitialScanDone()    { lsSet('initial_scan_done', true); }

  // ---------- Disclosures (IndexedDB) ----------
  async function saveDisclosure(d)        { return idbPut('disclosures', d); }
  async function getAllDisclosures()       { return idbGetAll('disclosures'); }
  async function getDisclosuresByTicker(t){ return idbGetAll('disclosures', 'ticker', t); }
  async function disclosureExists(id)     { return !!(await idbGet('disclosures', id)); }
  async function deleteDisclosure(id)     { return idbDelete('disclosures', id); }
  async function clearDisclosures()       { return idbClear('disclosures'); }

  // ---------- Financials (IndexedDB) ----------
  async function saveFinancial(d)         { return idbPut('financials', d); }
  async function getFinancialsByTicker(t) { return idbGetAll('financials', 'ticker', t); }
  async function clearFinancials()        { return idbClear('financials'); }

  // ---------- UI state (localStorage) ----------
  function getActiveTab()    { return lsGet('active_tab', 'kap'); }
  function setActiveTab(t)   { lsSet('active_tab', t); }
  function getMetric()       { return lsGet('heatmap_metric', 'ROE'); }
  function setMetric(m)      { lsSet('heatmap_metric', m); }
  function getFilters()      { return lsGet('kap_filters', {}); }
  function setFilters(f)     { lsSet('kap_filters', f); }

  return {
    openDB,
    // API key
    getApiKey, setApiKey,
    // Stocks
    getStocks, setStocks,
    // Scan
    getLastScanTime, setLastScanTime, getInitialScanDone, setInitialScanDone,
    // Disclosures
    saveDisclosure, getAllDisclosures, getDisclosuresByTicker, disclosureExists, deleteDisclosure, clearDisclosures,
    // Financials
    saveFinancial, getFinancialsByTicker, clearFinancials,
    // UI state
    getActiveTab, setActiveTab, getMetric, setMetric, getFilters, setFilters,
    // Raw ls access
    lsGet, lsSet, lsDel,
  };
})();

// ============================================================
// BIST Tracker — KAP API Layer
// ============================================================

const KapAPI = (() => {

  // Map ticker → KAP member code (MKK codes used in KAP API)
  // These are the numeric/slug codes used in KAP's internal API.
  // We'll try to resolve them dynamically; fallback = ticker search.
  const TICKER_TO_MKK = {
    EGEEN: 'egeen',   FROTO: 'froto',  CLEBI: 'clebi',
    BRSAN: 'brsan',   CCOLA: 'ccola',  PGSUS: 'pgsus',
    OTKAR: 'otkar',   ISMEN: 'ismen',  ANSGR: 'ansgr',
    LOGO:  'logo',    LKMNH: 'lkmnh',  ALKA:  'alka',
    ALTNY: 'altny',   SODSN: 'sodsn',
  };

  // -------------------------------------------------------
  // Fetch disclosure list for a ticker from KAP JSON API
  // Returns array of { id, ticker, title, date, category, url, attachments }
  // -------------------------------------------------------
  async function fetchDisclosureList(ticker, fromDate = null) {
    const slug  = TICKER_TO_MKK[ticker] || ticker.toLowerCase();

    // KAP JSON API: returns paginated disclosure list
    const params = new URLSearchParams({
      memberCode: slug,
      isLarge:    'false',
      inactiveMember: 'false',
    });

    let rawList = [];

    // Try KAP's public JSON API
    try {
      const url = `${CONFIG.kap.disclosureQuery}?${params}`;
      const data = await CorsProxy.getJSON(url);
      if (Array.isArray(data)) rawList = data;
      else if (data && Array.isArray(data.data)) rawList = data.data;
    } catch (err) {
      console.warn(`KAP JSON API başarısız (${ticker}):`, err.message);
      // Fallback: scrape the HTML page
      rawList = await scrapeDisclosureListHTML(ticker, fromDate);
    }

    // Filter by date
    const cutoff = fromDate ? new Date(fromDate) : null;

    return rawList
      .map(d => normalizeDisclosure(d, ticker))
      .filter(d => {
        if (!cutoff) return true;
        const dDate = new Date(d.date);
        return dDate >= cutoff;
      });
  }

  function normalizeDisclosure(raw, ticker) {
    // Handles both API shape and scraped shape
    const id       = String(raw.id || raw.disclosureId || raw.disclosureIndex || '');
    const date     = raw.publishDate || raw.date || raw.publishedAt || '';
    const title    = raw.title || raw.disclosure_title || raw.disclosureTitle || '';
    const category = raw.disclosureType || raw.category || raw.typeDescription || '';
    const url      = `${CONFIG.kap.disclosure}/${id}`;

    return {
      id,
      ticker,
      title:    title.trim(),
      date:     normalizeDate(date),
      category: category.trim(),
      url,
      raw,      // keep original for detail fetch
      summary:  null,
      signal:   null,
      impact:   null,
      processed: false,
    };
  }

  function normalizeDate(raw) {
    if (!raw) return '';
    // KAP dates can be "01.08.2026 09:32" or ISO format
    if (raw.includes('T')) return raw.slice(0, 10);
    const parts = raw.split(/[\s\.\/]/);
    if (parts.length >= 3) {
      // DD.MM.YYYY or YYYY-MM-DD
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
      return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return raw;
  }

  // -------------------------------------------------------
  // Scrape disclosure list page (HTML fallback)
  // -------------------------------------------------------
  async function scrapeDisclosureListHTML(ticker, fromDate) {
    const slug = TICKER_TO_MKK[ticker] || ticker.toLowerCase();
    const url  = `${CONFIG.kap.company}/${slug}/Bildirimler`;
    const html = await CorsProxy.getText(url);
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    const results = [];
    const cutoff  = fromDate ? new Date(fromDate) : null;

    // KAP table rows have class "disclosure-row" or similar
    const rows = doc.querySelectorAll('table tbody tr, .disclosure-row, .w-clearfix.sub');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, .cell-data');
      if (cells.length < 2) return;

      const linkEl    = row.querySelector('a[href*="BildirimDetay"]');
      const href      = linkEl ? linkEl.getAttribute('href') : '';
      const idMatch   = href.match(/BildirimDetay\/(\d+)/);
      const id        = idMatch ? idMatch[1] : Math.random().toString(36).slice(2);
      const dateText  = cells[0]?.textContent?.trim() || '';
      const title     = linkEl ? linkEl.textContent.trim() : cells[1]?.textContent?.trim() || '';
      const category  = cells[2]?.textContent?.trim() || '';

      if (!title) return;

      const date = normalizeDate(dateText);
      if (cutoff && new Date(date) < cutoff) return;

      results.push({ id, ticker, title, date, category, url: `${CONFIG.kap.base}${href}`, raw: {}, summary: null, signal: null, impact: null, processed: false });
    });

    return results;
  }

  // -------------------------------------------------------
  // Fetch full text of a single disclosure
  // -------------------------------------------------------
  async function fetchDisclosureDetail(url) {
    try {
      const html = await CorsProxy.getText(url);
      const doc  = new DOMParser().parseFromString(html, 'text/html');

      // KAP detail page main content selectors
      let text = '';
      const content = doc.querySelector('.sub-page-content, .disclosure-content, #bildirim-icerik, .icerik, main article');
      if (content) {
        text = content.innerText || content.textContent || '';
      } else {
        // Fallback: strip all tags
        text = doc.body?.textContent || '';
      }

      // Also grab attachment links
      const attachments = [];
      doc.querySelectorAll('a[href*=".pdf"], a[href*="ek="], a[href*="/Ek/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const fullHref = href.startsWith('http') ? href : CONFIG.kap.base + href;
        attachments.push({ name: a.textContent.trim(), url: fullHref });
      });

      return {
        text:        text.replace(/\s+/g, ' ').trim().slice(0, 8000),
        attachments,
      };
    } catch (err) {
      console.warn('Bildirim detay alınamadı:', err.message);
      return { text: '', attachments: [] };
    }
  }

  // -------------------------------------------------------
  // Filter disclosures by our target categories
  // -------------------------------------------------------
  function isTargetCategory(disclosure) {
    const cat   = (disclosure.category || '').toLowerCase();
    const title = (disclosure.title   || '').toLowerCase();
    const targets = [
      'özel durum', 'faaliyet raporu', 'finansal rapor', 'finansal sonuç',
      'sermaye artırım', 'borçlan', 'yatırım', 'teşvik', 'sözleşme',
      'sipariş', 'iş ilişki', 'capex', 'kredi', 'tahvil', 'bono',
      'lisans', 'anlaşma', 'ihraç',
    ];
    return targets.some(t => cat.includes(t) || title.includes(t));
  }

  // -------------------------------------------------------
  // Financial data: quarterly balance sheet from KAP
  // Returns { revenue, netIncome, equity, totalAssets, debt, cash, ebit, taxRate } per quarter
  // -------------------------------------------------------
  async function fetchFinancials(ticker) {
    const slug = TICKER_TO_MKK[ticker] || ticker.toLowerCase();
    // KAP XBRL/HTML financial page
    const url  = `${CONFIG.kap.financials}/${slug}`;

    try {
      const html = await CorsProxy.getText(url);
      return parseFinancialHTML(html, ticker);
    } catch (err) {
      console.warn(`Finansal veri alınamadı (${ticker}):`, err.message);
      return [];
    }
  }

  function parseFinancialHTML(html, ticker) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const quarters = [];

    // KAP financial page contains tables with period headers like "2024/3", "2024/6" etc.
    const tables = doc.querySelectorAll('table');
    if (!tables.length) return quarters;

    // Look for balance sheet + income statement tables
    let balanceTable = null, incomeTable = null;
    tables.forEach(t => {
      const header = t.textContent.toLowerCase();
      if (header.includes('özkaynak') || header.includes('equity')) balanceTable = t;
      if (header.includes('net dönem') || header.includes('satış')) incomeTable = t;
    });

    const extractRows = (table) => {
      const rows = {};
      table?.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td, th');
        if (cells.length < 2) return;
        const label = cells[0].textContent.trim().toLowerCase();
        const values = [];
        for (let i = 1; i < cells.length; i++) {
          values.push(parseTRNumber(cells[i].textContent));
        }
        rows[label] = values;
      });
      return rows;
    };

    // Extract period headers (columns)
    const headerRow = (balanceTable || incomeTable)?.querySelector('tr:first-child');
    const periods   = [];
    headerRow?.querySelectorAll('th, td').forEach((th, i) => {
      if (i === 0) return;
      const txt = th.textContent.trim();
      if (txt.match(/\d{4}/)) periods.push(txt);
    });

    const bRows = extractRows(balanceTable);
    const iRows = extractRows(incomeTable);

    const findKey = (rows, keys) => {
      for (const k of keys) {
        const found = Object.keys(rows).find(r => r.includes(k));
        if (found) return rows[found];
      }
      return [];
    };

    const equityArr   = findKey(bRows, ['özkaynak', 'toplam özkaynaklar']);
    const debtSTArr   = findKey(bRows, ['kısa vadeli borçlanmalar', 'kısa vadeli finansal']);
    const debtLTArr   = findKey(bRows, ['uzun vadeli borçlanmalar', 'uzun vadeli finansal']);
    const cashArr     = findKey(bRows, ['nakit', 'nakit ve nakit benzeri']);
    const assetsArr   = findKey(bRows, ['toplam varlıklar', 'toplam aktif']);
    const netIncArr   = findKey(iRows, ['net dönem kârı', 'dönem net kâr', 'dönem net kar']);
    const revenueArr  = findKey(iRows, ['satış gelirleri', 'hasılat', 'net satışlar']);
    const ebitArr     = findKey(iRows, ['esas faaliyetlerden kâr', 'esas faaliyet kâr', 'faaliyet kârı']);
    const taxArr      = findKey(iRows, ['vergi giderleri', 'gelir vergisi', 'vergi']);

    periods.forEach((period, i) => {
      const equity     = equityArr[i]   ?? null;
      const debtST     = debtSTArr[i]   ?? 0;
      const debtLT     = debtLTArr[i]   ?? 0;
      const cash       = cashArr[i]     ?? 0;
      const assets     = assetsArr[i]   ?? null;
      const netIncome  = netIncArr[i]   ?? null;
      const revenue    = revenueArr[i]  ?? null;
      const ebit       = ebitArr[i]     ?? null;
      const taxExpense = taxArr[i]      ?? null;

      const preTax = ebit !== null && taxExpense !== null
        ? ebit : null;
      const taxRate = preTax && taxExpense
        ? Math.abs(taxExpense) / Math.abs(preTax) : 0.22; // 22% default Turkish CIT

      quarters.push({
        key:       `${ticker}_${period.replace('/', '_')}`,
        ticker,
        period,    // e.g. "2024/3"
        equity,
        debt:      (debtST || 0) + (debtLT || 0),
        cash,
        assets,
        netIncome,
        revenue,
        ebit,
        taxRate,
        rawDebtST: debtST,
        rawDebtLT: debtLT,
      });
    });

    return quarters;
  }

  function parseTRNumber(txt) {
    const clean = (txt || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  }

  return {
    fetchDisclosureList,
    fetchDisclosureDetail,
    fetchFinancials,
    isTargetCategory,
    normalizeDate,
  };
})();

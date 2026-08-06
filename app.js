// ============================================================
// BIST Tracker — Main App Controller (v1.1 — Fixed)
// ============================================================

const App = (() => {
  let stocks         = [...CONFIG.stocks];
  let allMetrics     = {};
  let scanInProgress = false;

  // -------------------------------------------------------
  // Boot
  // -------------------------------------------------------
  async function init() {
    try {
      // Load saved stock list
      const saved = Store.getStocks();
      if (Array.isArray(saved) && saved.length) stocks = saved;

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }

      // Wire up all UI event listeners
      setupTabSwitching();
      setupMetricButtons();
      setupScanButtons();
      setupStockManager();
      setupApiKeyForm();

      // Open IndexedDB early
      await Store.openDB();

      // Mount heatmap (empty state first)
      const hmContainer = document.getElementById('heatmap-container');
      if (hmContainer) Heatmap.mount(hmContainer);

      // Load any stored metrics from previous session
      await loadStoredMetrics();
      Heatmap.update(allMetrics, stocks);

      // Render KAP filter bar and any stored cards
      const filterContainer = document.getElementById('filter-container');
      if (filterContainer) KapPanel.renderFilterBar(filterContainer, stocks);
      await KapPanel.renderCards();

      // Update stats immediately
      updateStats();

      // Initial 6-month KAP scan (one time only)
      if (!Store.getInitialScanDone()) {
        showToast('İlk kurulum: 6 aylık KAP geçmişi taranıyor…', 'info', 0);
        await runScan('initial');
        Store.setInitialScanDone();
        hideToast();
      }

      // Start scheduler (09:30 / 16:00)
      Scheduler.start(handleScheduledScan);
      Scheduler.startUILoop();

      // Live clock
      setInterval(updateClock, 1000);
      updateClock();

      // If no financial data yet, prompt user (don't auto-fetch — could be slow)
      if (Object.keys(allMetrics).length === 0) {
        showToast('💡 Finansal Isı Haritası için "Finansal Verileri Güncelle" butonuna tıklayın.', 'info', 8000);
      }

    } catch (err) {
      console.error('[App.init] Kritik hata:', err);
      showToast('❌ Uygulama yüklenirken hata: ' + err.message, 'error', 0);
    }
  }

  // -------------------------------------------------------
  // Tab switching
  // -------------------------------------------------------
  function setupTabSwitching() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById('panel-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
        Store.setActiveTab(btn.dataset.tab);
      });
    });

    // Restore last active tab
    const lastTab = Store.getActiveTab();
    const tabBtn  = document.querySelector('.tab-btn[data-tab="' + lastTab + '"]');
    if (tabBtn) tabBtn.click();
    else {
      const first = document.querySelector('.tab-btn');
      if (first) first.click();
    }
  }

  // -------------------------------------------------------
  // Metric selector for heatmap
  // -------------------------------------------------------
  function setupMetricButtons() {
    document.querySelectorAll('.metric-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Heatmap.setMetric(btn.dataset.metric);
      });
    });

    const savedMetric = Store.getMetric();
    const mb = document.querySelector('.metric-btn[data-metric="' + savedMetric + '"]');
    if (mb) mb.click();
  }

  // -------------------------------------------------------
  // Scan buttons
  // -------------------------------------------------------
  function setupScanButtons() {
    document.getElementById('btn-manual-scan')?.addEventListener('click', async () => {
      if (scanInProgress) { showToast('Tarama zaten devam ediyor…', 'warn'); return; }
      await runScan('manual');
    });

    document.getElementById('btn-fetch-financials')?.addEventListener('click', async () => {
      await fetchAllFinancials();
    });
  }

  // -------------------------------------------------------
  // KAP Scan — main engine
  // -------------------------------------------------------
  async function runScan(source) {
    if (scanInProgress) return;
    scanInProgress = true;

    const btn = document.getElementById('btn-manual-scan');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Taranıyor…'; }

    const daysBack = source === 'initial' ? CONFIG.initialScanDays : 2;
    const fromDate = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);

    let newCount = 0;

    for (const stock of stocks) {
      try {
        updateScanProgress(stock.ticker + ' bildirimleri alınıyor…');

        const disclosures = await KapAPI.fetchDisclosureList(stock.ticker, fromDate);

        for (const disc of disclosures) {
          if (!KapAPI.isTargetCategory(disc)) continue;
          if (await Store.disclosureExists(disc.id)) continue;

          // Save unprocessed placeholder
          await Store.saveDisclosure({ ...disc, processed: false });

          // Show placeholder card immediately
          const placeholder = document.getElementById('card-' + disc.id);
          if (!placeholder) {
            const cardEl = KapPanel.buildCard({ ...disc, processed: false });
            const cardsContainer = document.getElementById('kap-cards');
            if (cardsContainer) {
              const empty = cardsContainer.querySelector('.empty-state');
              if (empty) empty.remove();
              cardsContainer.prepend(cardEl);
            }
          }

          // Fetch full disclosure text
          updateScanProgress(stock.ticker + ': "' + disc.title.slice(0, 35) + '…" işleniyor');
          const detail = await KapAPI.fetchDisclosureDetail(disc.url);

          // Summarize with Gemini
          const summary = await GeminiAPI.summarizeDisclosure(disc, detail.text || disc.title);

          // Build complete record
          const complete = {
            ...disc,
            full_text:    detail.text,
            attachments:  detail.attachments || [],
            summary_data: summary,
            signal:       summary.signal || 'Nötr',
            impact_score: summary.impact_score || 0,
            processed:    true,
          };

          await Store.saveDisclosure(complete);
          newCount++;

          // Replace placeholder card with full card
          const existing = document.getElementById('card-' + disc.id);
          if (existing) {
            const newCard = KapPanel.buildCard(complete);
            existing.replaceWith(newCard);
          }

          await sleep(700); // rate-limit
        }
      } catch (err) {
        console.warn(stock.ticker + ' tarama hatası:', err.message);
        updateScanProgress(stock.ticker + ' atlandı: ' + err.message);
      }
    }

    scanInProgress = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Manuel Tara'; }
    clearScanProgress();

    if (newCount > 0) {
      KapPanel.notifyNew(newCount);
      showToast('✅ ' + newCount + ' yeni bildirim eklendi.', 'success');
      await KapPanel.renderCards();
    } else {
      showToast('Yeni bildirim bulunamadı.', 'info');
    }

    await updateStats();
    Store.setLastScanTime(source);
    Scheduler.updateScanStatus();
  }

  async function handleScheduledScan(period) {
    showToast('🕐 ' + period + ' otomatik taraması başlıyor…', 'info');
    await runScan(period);
  }

  // -------------------------------------------------------
  // Financial Data Fetch + Metrics
  // -------------------------------------------------------
  async function fetchAllFinancials() {
    if (scanInProgress) { showToast('Önce mevcut tarama tamamlanmalı.', 'warn'); return; }

    const btn = document.getElementById('btn-fetch-financials');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Veriler alınıyor…'; }

    showProgress('Finansal veriler KAP\'tan çekiliyor…', 0);

    let fetchedCount = 0;
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];
      showProgress(stock.ticker + ' finansal tabloları işleniyor…', Math.round((i / stocks.length) * 100));

      try {
        const quarters = await KapAPI.fetchFinancials(stock.ticker);
        for (const q of quarters) {
          await Store.saveFinancial(q);
        }
        if (quarters.length > 0) fetchedCount++;
      } catch (err) {
        console.warn(stock.ticker + ' finansal veri hatası:', err.message);
      }

      await sleep(600);
    }

    await loadStoredMetrics();
    Heatmap.update(allMetrics, stocks);
    hideProgress();

    if (btn) { btn.disabled = false; btn.textContent = '📊 Finansal Verileri Güncelle'; }

    if (fetchedCount > 0) {
      showToast('✅ ' + fetchedCount + ' hisse için finansal veriler güncellendi.', 'success');
    } else {
      showToast('⚠️ KAP\'tan finansal veri çekilemedi. CORS proxy erişimi kontrol edin.', 'warn', 8000);
    }
  }

  async function loadStoredMetrics() {
    allMetrics = {};
    for (const stock of stocks) {
      try {
        const quarters = await Store.getFinancialsByTicker(stock.ticker);
        allMetrics[stock.ticker] = quarters.length
          ? FinancialCalc.computeMetrics(quarters)
          : [];
      } catch (e) {
        allMetrics[stock.ticker] = [];
      }
    }
  }

  // -------------------------------------------------------
  // Stock Manager
  // -------------------------------------------------------
  function setupStockManager() {
    const btnOpen  = document.getElementById('btn-manage-stocks');
    const modal    = document.getElementById('stock-modal');
    const btnClose = document.getElementById('btn-close-stock-modal');
    const btnSave  = document.getElementById('btn-save-stocks');

    if (!btnOpen || !modal) return;

    btnOpen.addEventListener('click', () => {
      renderStockModal();
      modal.classList.add('open');
    });

    btnClose?.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

    btnSave?.addEventListener('click', async () => {
      const checked = [...document.querySelectorAll('.stock-check:checked')].map(cb => cb.value);
      const addedRaw = (document.getElementById('add-ticker-input')?.value || '').trim().toUpperCase();

      let newList = CONFIG.stocks.filter(s => checked.includes(s.ticker));

      if (addedRaw && addedRaw.length >= 3 && !newList.find(s => s.ticker === addedRaw)) {
        newList.push({ ticker: addedRaw, name: addedRaw, sector: 'Bilinmiyor' });
      }

      if (newList.length === 0) {
        showToast('En az 1 hisse seçilmeli.', 'warn');
        return;
      }

      stocks = newList;
      Store.setStocks(stocks);
      modal.classList.remove('open');

      const filterContainer = document.getElementById('filter-container');
      if (filterContainer) KapPanel.renderFilterBar(filterContainer, stocks);
      await KapPanel.renderCards();
      await loadStoredMetrics();
      Heatmap.update(allMetrics, stocks);
      showToast('Hisse listesi güncellendi.', 'success');
    });
  }

  function renderStockModal() {
    const list = document.getElementById('stock-check-list');
    if (!list) return;
    list.innerHTML = CONFIG.stocks.map(s => `
      <label class="stock-check-item">
        <input type="checkbox" class="stock-check" value="${s.ticker}"
          ${stocks.find(x => x.ticker === s.ticker) ? 'checked' : ''}>
        <span class="stk-ticker">${s.ticker}</span>
        <span class="stk-name">${s.name}</span>
        <span class="stk-sector">${s.sector}</span>
      </label>
    `).join('');
  }

  // -------------------------------------------------------
  // API Key form (wires up even if section is hidden)
  // -------------------------------------------------------
  function setupApiKeyForm() {
    const input = document.getElementById('gemini-key-input');
    const btn   = document.getElementById('btn-save-key');
    const test  = document.getElementById('btn-test-key');
    if (!input) return;

    const saved = Store.getApiKey();
    if (saved) input.value = saved.slice(0, 4) + '****';

    input.addEventListener('focus', () => {
      const k = Store.getApiKey();
      if (k) input.value = k;
    });

    btn?.addEventListener('click', () => {
      const key = input.value.trim();
      if (!key || key.includes('*')) return;
      Store.setApiKey(key);
      input.value = key.slice(0, 4) + '****';
      showToast('API key kaydedildi.', 'success');
    });

    test?.addEventListener('click', async () => {
      test.textContent = '⏳';
      const ok = await GeminiAPI.testKey(Store.getApiKey() || (typeof _K !== 'undefined' ? _K : ''));
      test.textContent = '🧪 Test Et';
      showToast(ok ? '✅ API key geçerli!' : '❌ API key geçersiz.', ok ? 'success' : 'error');
    });
  }

  // -------------------------------------------------------
  // Stats updater
  // -------------------------------------------------------
  async function updateStats() {
    try {
      const all   = await Store.getAllDisclosures();
      const pos   = all.filter(d => d.signal === 'Pozitif').length;
      const neg   = all.filter(d => d.signal === 'Negatif').length;
      const high  = all.filter(d => (d.impact_score || 0) >= 7).length;
      const el = id => document.getElementById(id);
      if (el('stat-total')) el('stat-total').textContent = all.length;
      if (el('stat-pos'))   el('stat-pos').textContent   = pos;
      if (el('stat-neg'))   el('stat-neg').textContent   = neg;
      if (el('stat-high'))  el('stat-high').textContent  = high;
    } catch (e) { /* ignore */ }
  }

  // -------------------------------------------------------
  // Data management (called from settings HTML)
  // -------------------------------------------------------
  async function clearKapData() {
    if (!confirm('KAP bildirimleri silinsin mi?')) return;
    await Store.clearDisclosures();
    Store.lsDel('initial_scan_done');
    await KapPanel.renderCards();
    await updateStats();
    showToast('KAP verileri temizlendi.', 'info');
  }

  async function clearFinancialData() {
    if (!confirm('Finansal veriler silinsin mi?')) return;
    await Store.clearFinancials();
    allMetrics = {};
    Heatmap.update(allMetrics, stocks);
    showToast('Finansal veriler temizlendi.', 'info');
  }

  async function resetAll() {
    if (!confirm('TÜM veriler silinsin mi? Bu işlem geri alınamaz.')) return;
    await Store.clearDisclosures();
    await Store.clearFinancials();
    Store.lsDel('initial_scan_done');
    localStorage.clear();
    location.reload();
  }

  // -------------------------------------------------------
  // UI helpers
  // -------------------------------------------------------
  function updateClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const now = new Date();
    el.textContent =
      now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' — ' +
      now.toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function updateScanProgress(msg) {
    const el = document.getElementById('scan-progress-text');
    if (el) el.textContent = msg;
  }

  function clearScanProgress() {
    const el = document.getElementById('scan-progress-text');
    if (el) el.textContent = '';
  }

  function showProgress(msg, pct) {
    const wrap = document.getElementById('progress-bar-wrap');
    const bar  = document.getElementById('progress-bar-inner');
    const txt  = document.getElementById('progress-bar-text');
    if (wrap) wrap.style.display = 'flex';
    if (bar)  bar.style.width    = pct + '%';
    if (txt)  txt.textContent    = msg;
  }

  function hideProgress() {
    const wrap = document.getElementById('progress-bar-wrap');
    if (wrap) wrap.style.display = 'none';
  }

  let _toastTimer = null;
  function showToast(msg, type, duration) {
    type     = type     || 'info';
    duration = (duration === undefined) ? 4000 : duration;
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'toast toast-' + type + ' active';
    if (_toastTimer) clearTimeout(_toastTimer);
    if (duration > 0) _toastTimer = setTimeout(() => el.classList.remove('active'), duration);
  }

  function hideToast() {
    const el = document.getElementById('toast');
    if (el) el.classList.remove('active');
    if (_toastTimer) clearTimeout(_toastTimer);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function getStocks() { return stocks; }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------
  return {
    init,
    getStocks,
    runScan,
    fetchAllFinancials,
    showToast,
    hideToast,
    updateStats,
    clearKapData,
    clearFinancialData,
    resetAll,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());

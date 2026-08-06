// ============================================================
// BIST Tracker — Heatmap Renderer
// ============================================================

const Heatmap = (() => {
  let currentMetric = 'ROE';
  let currentData   = {};   // { ticker: [ { period, roe, roic, wacc, eva } ] }
  let tooltip       = null;

  // -------------------------------------------------------
  // Mount heatmap into #heatmap-container
  // -------------------------------------------------------
  function mount(container) {
    container.innerHTML = '';
    tooltip = document.createElement('div');
    tooltip.className = 'hm-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  // -------------------------------------------------------
  // Update with new data
  // -------------------------------------------------------
  function update(allMetrics, stocks) {
    // allMetrics: { TICKER: [ { period, roe, roic, wacc, eva, hasData } ] }
    currentData = allMetrics;

    const container = document.getElementById('heatmap-container');
    if (!container) return;

    // Collect all unique periods across all tickers, sorted
    const periodSet = new Set();
    Object.values(allMetrics).forEach(arr =>
      arr.forEach(m => periodSet.add(m.period))
    );
    const periods = [...periodSet]
      .sort((a, b) => FinancialCalc.periodToDate(a) - FinancialCalc.periodToDate(b))
      .slice(-CONFIG.quarterCount);

    // If no periods yet, generate placeholder labels
    const displayPeriods = periods.length
      ? periods
      : FinancialCalc.generateQuarterLabels(CONFIG.quarterCount);

    renderGrid(container, stocks, displayPeriods, allMetrics);
  }

  function renderGrid(container, stocks, periods, allMetrics) {
    container.innerHTML = '';

    // --- Legend ---
    const legend = document.createElement('div');
    legend.className = 'hm-legend';
    legend.innerHTML = `
      <div class="hm-legend-scale">
        <span class="hm-legend-label bad">Düşük</span>
        <div class="hm-legend-gradient"></div>
        <span class="hm-legend-label good">Yüksek</span>
      </div>
      <span class="hm-legend-note">* Yarı saydam = tahmin dönemi</span>
    `;
    container.appendChild(legend);

    // --- Scroll wrapper ---
    const wrapper = document.createElement('div');
    wrapper.className = 'hm-scroll';
    container.appendChild(wrapper);

    // --- Table ---
    const table = document.createElement('table');
    table.className = 'hm-table';

    // Header row (periods)
    const thead = document.createElement('thead');
    const hrow  = document.createElement('tr');
    hrow.appendChild(th('Hisse', 'hm-th-ticker'));
    periods.forEach(p => {
      const cell = th(formatPeriod(p), 'hm-th-period');
      hrow.appendChild(cell);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    // Body rows (stocks)
    const tbody = document.createElement('tbody');
    stocks.forEach(stock => {
      const row     = document.createElement('tr');
      const metrics = allMetrics[stock.ticker] || [];
      const metricMap = {};
      metrics.forEach(m => { metricMap[m.period] = m; });

      // Ticker cell
      const tickerCell = td('', 'hm-td-ticker');
      tickerCell.innerHTML = `<span class="hm-ticker">${stock.ticker}</span><span class="hm-sector">${stock.sector}</span>`;
      row.appendChild(tickerCell);

      // Period cells
      periods.forEach(p => {
        const m    = metricMap[p];
        const cell = td('', 'hm-td-cell');

        if (!m || !m.hasData) {
          cell.style.background = 'rgba(255,255,255,0.03)';
          cell.innerHTML = '<span class="hm-no-data">—</span>';
        } else {
          const val      = getMetricValue(m, currentMetric);
          const color    = FinancialCalc.metricToColor(val, currentMetric, m.isEstimate);
          cell.style.background = color;

          const display  = val !== null ? formatMetricVal(val, currentMetric) : '—';
          cell.innerHTML = `<span class="hm-cell-val">${display}</span>`;

          // Tooltip on hover
          cell.addEventListener('mouseenter', e => showTooltip(e, stock, p, m));
          cell.addEventListener('mouseleave', hideTooltip);
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
  }

  // -------------------------------------------------------
  // Tooltip
  // -------------------------------------------------------
  function showTooltip(e, stock, period, m) {
    if (!tooltip) return;
    tooltip.innerHTML = `
      <div class="tt-header">${stock.ticker} — ${formatPeriod(period)}</div>
      <div class="tt-row"><span>ROE</span><span>${fmtNull(m.roe, '%')}</span></div>
      <div class="tt-row"><span>ROIC</span><span>${fmtNull(m.roic, '%')}</span></div>
      <div class="tt-row"><span>WACC</span><span>${fmtNull(m.wacc, '%')}</span></div>
      <div class="tt-row"><span>EVA</span><span>${fmtEVA(m.eva)}</span></div>
      <div class="tt-row"><span>ROIC−WACC</span><span class="${spreadClass(m.roic,m.wacc)}">${fmtSpread(m.roic,m.wacc)}</span></div>
    `;
    tooltip.style.display = 'block';
    positionTooltip(e);
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  function positionTooltip(e) {
    if (!tooltip) return;
    const x = e.clientX + 12;
    const y = e.clientY - 10;
    tooltip.style.left = Math.min(x, window.innerWidth - 240) + 'px';
    tooltip.style.top  = Math.min(y, window.innerHeight - 200) + 'px';
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------
  function th(text, cls) {
    const el = document.createElement('th');
    el.className = cls || '';
    el.textContent = text;
    return el;
  }

  function td(text, cls) {
    const el = document.createElement('td');
    el.className = cls || '';
    if (text) el.textContent = text;
    return el;
  }

  function formatPeriod(p) {
    if (!p) return '';
    const [year, month] = p.split('/');
    const qMap = { '3': 'Ç1', '6': 'Ç2', '9': 'Ç3', '12': 'Ç4' };
    return `${qMap[month] || 'Ç?'}'${String(year).slice(2)}`;
  }

  function getMetricValue(m, metric) {
    switch (metric) {
      case 'ROE':  return m.roe;
      case 'ROIC': return m.roic;
      case 'WACC': return m.wacc;
      case 'EVA':  return m.eva;
      default:     return null;
    }
  }

  function formatMetricVal(val, metric) {
    if (val === null || val === undefined) return '—';
    if (metric === 'EVA') return fmtEVA(val);
    return val.toFixed(1) + '%';
  }

  function fmtNull(v, suffix = '') {
    if (v === null || v === undefined) return '—';
    return v.toFixed(1) + suffix;
  }

  function fmtEVA(v) {
    if (v === null || v === undefined) return '—';
    const abs = Math.abs(v);
    const sign = v >= 0 ? '+' : '-';
    if (abs >= 1e9) return `${sign}${(abs/1e9).toFixed(1)}B₺`;
    if (abs >= 1e6) return `${sign}${(abs/1e6).toFixed(1)}M₺`;
    if (abs >= 1e3) return `${sign}${(abs/1e3).toFixed(0)}K₺`;
    return `${sign}${abs.toFixed(0)}₺`;
  }

  function fmtSpread(roic, wacc) {
    if (roic === null || wacc === null) return '—';
    const spread = roic - wacc;
    return (spread >= 0 ? '+' : '') + spread.toFixed(1) + ' bps';
  }

  function spreadClass(roic, wacc) {
    if (roic === null || wacc === null) return '';
    return roic >= wacc ? 'tt-pos' : 'tt-neg';
  }

  // -------------------------------------------------------
  // Public: change active metric
  // -------------------------------------------------------
  function setMetric(metric) {
    currentMetric = metric;
    Store.setMetric(metric);
    // App may not be defined during early init — use safe check
    const stocks = (typeof App !== 'undefined' && App.getStocks) ? App.getStocks() : [];
    update(currentData, stocks);
  }

  return { mount, update, setMetric, formatPeriod };
})();

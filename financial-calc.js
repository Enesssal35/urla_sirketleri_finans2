// ============================================================
// BIST Tracker — Financial Calculations (ROE / ROIC / WACC / EVA)
// ============================================================

const FinancialCalc = (() => {

  // Risk-free rate — Turkish 10Y gov bond (fetched or last known)
  let rfRate = 0.30; // Default ~30% (2024 Turkey 10Y)

  // Try to fetch latest TCMB rate from public data
  async function fetchRiskFreeRate() {
    try {
      // Use investing.com or a free source for TR 10Y yield
      // Since we can't reliably get this, we use a reasonable approximation
      // TCMB policy rate as proxy (updated manually from config)
      rfRate = Store.lsGet('rf_rate', 0.30);
    } catch { /* use default */ }
    return rfRate;
  }

  // Market risk premium (Turkey historical average ~5.5-6%)
  const MRP = 0.055;

  // -------------------------------------------------------
  // Compute quarterly metrics for all stored quarters
  // Returns { ticker, period, roe, roic, wacc, eva, nopat, ic, hasData }
  // -------------------------------------------------------
  function computeMetrics(quarters) {
    // Sort by period
    const sorted = [...quarters].sort((a, b) => periodToDate(a.period) - periodToDate(b.period));

    const results = [];

    for (let i = 0; i < sorted.length; i++) {
      const q     = sorted[i];
      const prev  = sorted[i - 1]; // previous quarter for averages

      const roe   = calcROE(q, prev);
      const roic  = calcROIC(q);
      const wacc  = calcWACC(q);
      const eva   = calcEVA(q, roic, wacc);

      results.push({
        ticker:   q.ticker,
        period:   q.period,
        roe:      roe !== null ? +(roe * 100).toFixed(2)  : null,
        roic:     roic !== null ? +(roic * 100).toFixed(2) : null,
        wacc:     wacc !== null ? +(wacc * 100).toFixed(2) : null,
        eva:      eva,
        hasData:  roe !== null || roic !== null,
      });
    }

    return results;
  }

  // -------------------------------------------------------
  // ROE = Net Income (TTM or quarterly annualized) / Average Equity
  // -------------------------------------------------------
  function calcROE(q, prev) {
    if (q.netIncome === null || q.equity === null) return null;
    if (q.equity === 0) return null;

    const avgEquity = prev?.equity
      ? (q.equity + prev.equity) / 2
      : q.equity;

    // Annualize quarterly net income (×4)
    const annualNI = q.netIncome * 4;
    return annualNI / avgEquity;
  }

  // -------------------------------------------------------
  // ROIC = NOPAT / Invested Capital
  // NOPAT = EBIT × (1 − Tax Rate)
  // Invested Capital = Equity + Net Debt
  // -------------------------------------------------------
  function calcROIC(q) {
    if (q.ebit === null || q.equity === null) return null;

    const taxRate = q.taxRate ?? 0.22;
    const nopat   = q.ebit * (1 - taxRate) * 4; // annualized

    const netDebt = (q.debt || 0) - (q.cash || 0);
    const ic      = q.equity + netDebt;

    if (ic <= 0) return null;
    return nopat / ic;
  }

  // -------------------------------------------------------
  // WACC = E/V × Ke + D/V × Kd × (1−T)
  // Ke = Rf + β × MRP  (β ≈ from stock characteristics)
  // Kd = interest expense / average debt (approximated)
  // -------------------------------------------------------
  function calcWACC(q) {
    if (q.equity === null) return null;

    const E = q.equity;
    const D = q.debt || 0;
    const V = E + D;
    if (V <= 0) return null;

    // Sector-based beta approximation
    const beta = getSectorBeta(q.ticker);
    const Ke   = rfRate + beta * MRP;

    // Debt cost: use approximation if not available
    // In absence of interest expense, use policy rate × 1.2 as proxy
    const Kd = Store.lsGet(`kd_${q.ticker}`, rfRate * 1.2 / 100) || rfRate * 0.8;

    const T    = q.taxRate ?? 0.22;
    const wacc = (E / V) * Ke + (D / V) * Kd * (1 - T);
    return wacc;
  }

  // -------------------------------------------------------
  // EVA = NOPAT − WACC × Invested Capital
  // -------------------------------------------------------
  function calcEVA(q, roicPct, waccPct) {
    if (roicPct === null || waccPct === null) return null;
    if (q.equity === null) return null;

    const netDebt = (q.debt || 0) - (q.cash || 0);
    const ic      = q.equity + netDebt;
    if (ic <= 0) return null;

    const spread = (roicPct - waccPct) / 100; // convert from % back to decimal
    return +(spread * ic).toFixed(0); // in same unit as financials (TL thousands)
  }

  // -------------------------------------------------------
  // Sector beta table (BIST estimates)
  // -------------------------------------------------------
  function getSectorBeta(ticker) {
    const betas = {
      EGEEN: 0.95, FROTO: 1.05, CLEBI: 1.20,
      BRSAN: 0.90, CCOLA: 0.75, PGSUS: 1.30,
      OTKAR: 1.10, ISMEN: 1.00, ANSGR: 0.80,
      LOGO:  1.15, LKMNH: 0.85, ALKA:  0.90,
      ALTNY: 1.10, SODSN: 0.85,
    };
    return betas[ticker] || 1.0;
  }

  // -------------------------------------------------------
  // Period "2024/3" → Date for sorting
  // -------------------------------------------------------
  function periodToDate(period) {
    if (!period) return 0;
    const [year, month] = period.split('/').map(Number);
    return new Date(year, (month || 3) - 1, 1).getTime();
  }

  // -------------------------------------------------------
  // Generate last N quarter labels from today (for empty state)
  // -------------------------------------------------------
  function generateQuarterLabels(n = 20) {
    const labels = [];
    let d = new Date();
    // Start from current quarter
    for (let i = 0; i < n; i++) {
      const year  = d.getFullYear();
      const month = d.getMonth() + 1;
      const q     = month <= 3 ? 3 : month <= 6 ? 6 : month <= 9 ? 9 : 12;
      labels.unshift(`${year}/${q}`);
      d.setMonth(d.getMonth() - 3);
    }
    return labels;
  }

  // -------------------------------------------------------
  // Color scale for heatmap (value normalized 0–1)
  // -------------------------------------------------------
  function metricToColor(value, metric, isEstimate = false) {
    if (value === null || value === undefined) return 'rgba(255,255,255,0.05)';

    let low, high;
    switch (metric) {
      case 'ROE':  low = 0;   high = 40;  break;
      case 'ROIC': low = 0;   high = 30;  break;
      case 'WACC': low = 15;  high = 40;  break; // WACC: lower is better
      case 'EVA':  low = -1e6; high = 1e6; break;
      default:     low = 0;   high = 100;
    }

    let t = (value - low) / (high - low);
    t = Math.max(0, Math.min(1, t));

    // For WACC: invert (lower = better = green)
    if (metric === 'WACC') t = 1 - t;

    // For EVA: center at 0
    if (metric === 'EVA') t = t; // already 0-1 centered

    const alpha = isEstimate ? 0.6 : 0.85;

    // Red → Yellow → Green
    if (t < 0.5) {
      const r = 220;
      const g = Math.round(t * 2 * 200);
      return `rgba(${r},${g},40,${alpha})`;
    } else {
      const r = Math.round((1 - t) * 2 * 220);
      const g = 200;
      return `rgba(${r},${g},40,${alpha})`;
    }
  }

  return {
    computeMetrics,
    calcROE, calcROIC, calcWACC, calcEVA,
    generateQuarterLabels,
    metricToColor,
    fetchRiskFreeRate,
    periodToDate,
    getSectorBeta,
  };
})();

// ============================================================
// BIST Tracker — KAP Panel (Disclosure Cards UI)
// ============================================================

const KapPanel = (() => {
  let allDisclosures  = [];
  let activeFilters   = {};
  let onNewDisclosure = null;   // callback

  // -------------------------------------------------------
  // Render filter bar
  // -------------------------------------------------------
  function renderFilterBar(container, stocks) {
    const saved = Store.getFilters();

    container.innerHTML = `
      <div class="filter-bar" id="filter-bar">
        <div class="filter-group">
          <label>Hisse</label>
          <select id="f-ticker" multiple>
            <option value="">Tümü</option>
            ${stocks.map(s => `<option value="${s.ticker}" ${saved.tickers?.includes(s.ticker) ? 'selected' : ''}>${s.ticker}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label>Sinyal</label>
          <div class="filter-chips" id="f-signal">
            <button class="chip ${!saved.signal ? 'active' : ''}" data-val="">Tümü</button>
            <button class="chip pos ${saved.signal === 'Pozitif' ? 'active' : ''}" data-val="Pozitif">🟢 Pozitif</button>
            <button class="chip neu ${saved.signal === 'Nötr' ? 'active' : ''}" data-val="Nötr">🟡 Nötr</button>
            <button class="chip neg ${saved.signal === 'Negatif' ? 'active' : ''}" data-val="Negatif">🔴 Negatif</button>
          </div>
        </div>
        <div class="filter-group">
          <label>KAP Etkisi (min)</label>
          <input type="range" id="f-impact" min="0" max="10" value="${saved.minImpact ?? 0}" step="1">
          <span id="f-impact-val">${saved.minImpact ?? 0}</span>
        </div>
        <div class="filter-group">
          <label>Başlangıç Tarihi</label>
          <input type="date" id="f-from" value="${saved.fromDate || ''}">
        </div>
        <div class="filter-group">
          <label>Kategori</label>
          <select id="f-category">
            <option value="">Tümü</option>
            ${CONFIG.targetCategories.map(c => `<option value="${c}" ${saved.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <button class="btn-secondary" id="btn-clear-filters">Temizle</button>
      </div>
    `;

    // Event listeners
    const apply = () => {
      const tickers  = [...document.querySelectorAll('#f-ticker option:checked')]
        .map(o => o.value).filter(Boolean);
      const signal   = document.querySelector('#f-signal .chip.active')?.dataset.val || '';
      const minImp   = parseInt(document.getElementById('f-impact').value) || 0;
      const fromDate = document.getElementById('f-from').value;
      const category = document.getElementById('f-category').value;

      activeFilters = { tickers, signal, minImpact: minImp, fromDate, category };
      Store.setFilters(activeFilters);
      renderCards();
    };

    container.querySelectorAll('#f-signal .chip').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('#f-signal .chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        apply();
      });
    });

    document.getElementById('f-ticker').addEventListener('change', apply);
    document.getElementById('f-from').addEventListener('change', apply);
    document.getElementById('f-category').addEventListener('change', apply);
    document.getElementById('f-impact').addEventListener('input', e => {
      document.getElementById('f-impact-val').textContent = e.target.value;
      apply();
    });
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
      activeFilters = {};
      Store.setFilters({});
      renderFilterBar(container, stocks);
      renderCards();
    });

    // Initialize with saved filters
    activeFilters = saved;
  }

  // -------------------------------------------------------
  // Render disclosure cards
  // -------------------------------------------------------
  async function renderCards(inject = null) {
    const container = document.getElementById('kap-cards');
    if (!container) return;

    // Load from store if not given
    if (!inject) allDisclosures = await Store.getAllDisclosures();
    else {
      // Merge new items
      inject.forEach(d => {
        if (!allDisclosures.find(x => x.id === d.id)) allDisclosures.unshift(d);
      });
    }

    const filtered = applyFilters(allDisclosures);

    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>Henüz bildirim yok veya filtre sonucu boş.</p>
          <p>Manuel tarama butonuna tıklayın.</p>
        </div>
      `;
      return;
    }

    // Sort by date desc
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = '';
    filtered.forEach(d => {
      const card = buildCard(d);
      container.appendChild(card);
    });
  }

  function applyFilters(list) {
    return list.filter(d => {
      const f = activeFilters;
      if (f.tickers?.length && !f.tickers.includes(d.ticker)) return false;
      if (f.signal && d.signal !== f.signal) return false;
      if (f.minImpact && (d.impact_score ?? 0) < f.minImpact) return false;
      if (f.fromDate && d.date < f.fromDate) return false;
      if (f.category && d.category !== f.category) return false;
      return true;
    });
  }

  // -------------------------------------------------------
  // Build single disclosure card
  // -------------------------------------------------------
  function buildCard(d) {
    const card = document.createElement('div');
    card.className = `kap-card ${signalClass(d.signal)} ${d.processed ? '' : 'card-loading'}`;
    card.id = `card-${d.id}`;

    if (!d.processed) {
      card.innerHTML = `
        <div class="card-header">
          <span class="card-ticker">${d.ticker}</span>
          <span class="card-cat">${d.category || 'Bildirim'}</span>
          <span class="card-date">${formatDateTR(d.date)}</span>
        </div>
        <div class="card-title">${d.title || 'İşleniyor…'}</div>
        <div class="card-processing">
          <div class="pulse-ring"></div>
          <span>Gemini ile analiz ediliyor…</span>
        </div>
      `;
      return card;
    }

    const s = d.summary_data || {};
    const impColor = impactColor(s.impact_score);

    card.innerHTML = `
      <div class="card-header">
        <div class="card-header-left">
          <span class="card-ticker">${d.ticker}</span>
          <span class="card-cat">${s.category_label || d.category || 'Bildirim'}</span>
        </div>
        <div class="card-header-right">
          <span class="card-date">${formatDateTR(d.date)}</span>
          <span class="card-impact" style="background:${impColor}" title="KAP Etkisi">
            ${s.impact_score ?? '—'}/10
          </span>
          <span class="card-signal signal-${signalClass(s.signal || d.signal)}">
            ${signalIcon(s.signal || d.signal)} ${s.signal || d.signal || '—'}
          </span>
        </div>
      </div>

      <div class="card-headline">${s.headline || d.title}</div>

      <div class="card-summary">${s.summary || 'Özet yok.'}</div>

      <div class="card-detail-grid">
        <div class="card-detail pos">
          <div class="card-detail-label">Olumlu Taraf</div>
          <div>${s.positive || 'Veri yok'}</div>
        </div>
        <div class="card-detail neg">
          <div class="card-detail-label">Olumsuz Yön/Risk</div>
          <div>${s.negative || 'Veri yok'}</div>
        </div>
      </div>

      <div class="card-metrics-row">
        <div class="card-metric">
          <span class="cm-label">ROE Etkisi</span>
          <span class="cm-val">${s.roe_effect || '—'}</span>
        </div>
        <div class="card-metric">
          <span class="cm-label">ROIC Etkisi</span>
          <span class="cm-val">${s.roic_effect || '—'}</span>
        </div>
        <div class="card-metric">
          <span class="cm-label">WACC Etkisi</span>
          <span class="cm-val">${s.wacc_effect || '—'}</span>
        </div>
        <div class="card-metric">
          <span class="cm-label">EVA Yönü</span>
          <span class="cm-val eva-${(s.eva_direction||'').toLowerCase()}">${s.eva_direction || '—'}</span>
        </div>
      </div>

      ${s.key_numbers?.length ? `
        <div class="card-key-numbers">
          ${s.key_numbers.map(n => `<span class="kn-tag">${n}</span>`).join('')}
        </div>
      ` : ''}

      <div class="card-footer">
        <a href="${d.url}" target="_blank" rel="noopener" class="kap-link">
          🔗 KAP'ta Görüntüle
        </a>
        ${d.attachments?.length ? `
          <div class="card-attachments">
            ${d.attachments.slice(0, 3).map(a =>
              `<a href="${a.url}" target="_blank" class="att-link">📎 ${a.name || 'Ek'}</a>`
            ).join('')}
          </div>
        ` : ''}
      </div>
    `;

    return card;
  }

  // -------------------------------------------------------
  // Notification for new disclosures
  // -------------------------------------------------------
  function notifyNew(count) {
    // In-app banner
    const banner = document.getElementById('new-alert-banner');
    if (banner) {
      banner.textContent = `🔔 ${count} yeni bildirim geldi!`;
      banner.classList.add('active');
      setTimeout(() => banner.classList.remove('active'), 8000);
    }

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('BIST Tracker', {
        body:  `${count} yeni KAP bildirimi analiz edildi.`,
        icon:  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📊</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📊</text></svg>',
      });
    }
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------
  function signalClass(signal) {
    if (!signal) return '';
    if (signal === 'Pozitif') return 'sig-pos';
    if (signal === 'Negatif') return 'sig-neg';
    return 'sig-neu';
  }

  function signalIcon(signal) {
    if (signal === 'Pozitif') return '🟢';
    if (signal === 'Negatif') return '🔴';
    return '🟡';
  }

  function impactColor(score) {
    if (!score) return 'rgba(255,255,255,0.15)';
    if (score >= 8) return 'rgba(0,220,100,0.8)';
    if (score >= 5) return 'rgba(255,200,0,0.8)';
    return 'rgba(255,90,90,0.6)';
  }

  function formatDateTR(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return {
    renderFilterBar,
    renderCards,
    notifyNew,
    applyFilters,
    buildCard,
  };
})();

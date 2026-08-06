// ============================================================
// BIST Tracker — Scheduler (09:30 / 16:00 auto-scan)
// ============================================================

const Scheduler = (() => {
  let intervalId  = null;
  let onScanDue   = null;
  const CHECK_MS  = 30_000; // check every 30 seconds

  // -------------------------------------------------------
  // Start the scheduler loop
  // -------------------------------------------------------
  function start(scanCallback) {
    if (intervalId) return;
    onScanDue = scanCallback;

    // Check immediately (catches up missed scans)
    checkAndFire();

    intervalId = setInterval(checkAndFire, CHECK_MS);
    console.log('[Scheduler] Başlatıldı — 09:30 ve 16:00 taramaları aktif.');
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function checkAndFire() {
    const now    = new Date();
    const hm     = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const today  = now.toISOString().slice(0, 10);

    CONFIG.scheduleTimes.forEach(target => {
      const key  = `last_scan_${target}`;
      const last = Store.lsGet(key, null);
      const lastDate = last ? new Date(last).toISOString().slice(0, 10) : '';

      // Fire if we are AT or PAST the target time AND haven't fired today
      if (hm >= target && lastDate !== today) {
        console.log(`[Scheduler] ${target} taraması tetiklendi.`);
        Store.lsSet(key, Date.now());
        updateScanStatus();
        if (onScanDue) onScanDue(`auto_${target}`);
      }
    });

    updateScanStatus();
  }

  // -------------------------------------------------------
  // Update UI countdown display
  // -------------------------------------------------------
  function updateScanStatus() {
    const el = document.getElementById('scheduler-status');
    if (!el) return;

    const now  = new Date();
    const next = getNextScanTime(now);
    const diff = next - now;
    const hh   = Math.floor(diff / 3_600_000);
    const mm   = Math.floor((diff % 3_600_000) / 60_000);
    const ss   = Math.floor((diff % 60_000) / 1000);

    const last09 = Store.lsGet('last_scan_09:30', null);
    const last16 = Store.lsGet('last_scan_16:00', null);
    const fmt    = ts => ts ? new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';

    el.innerHTML = `
      <div class="sched-row">
        <span class="sched-dot ${isToday(last09) ? 'done' : 'wait'}"></span>
        <span>09:30 — ${isToday(last09) ? '✓ Tamamlandı ' + fmt(last09) : 'Bekleniyor'}</span>
      </div>
      <div class="sched-row">
        <span class="sched-dot ${isToday(last16) ? 'done' : 'wait'}"></span>
        <span>16:00 — ${isToday(last16) ? '✓ Tamamlandı ' + fmt(last16) : 'Bekleniyor'}</span>
      </div>
      <div class="sched-next">⏱ Sonraki tarama: ${hh}s ${mm}d ${ss}sn</div>
    `;
  }

  function getNextScanTime(now) {
    const today = now.toISOString().slice(0, 10);
    const times = CONFIG.scheduleTimes.map(t => {
      const [h, m] = t.split(':').map(Number);
      const d      = new Date(now);
      d.setHours(h, m, 0, 0);
      return d;
    }).filter(d => d > now || !isToday(Store.lsGet(`last_scan_${CONFIG.scheduleTimes[0]}`, null)));

    if (times.length === 0) {
      // Next day 09:30
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 30, 0, 0);
      return tomorrow;
    }

    const futureScans = times.filter(d => d > now);
    return futureScans.length ? futureScans[0] : times[times.length - 1];
  }

  function isToday(ts) {
    if (!ts) return false;
    const today = new Date().toISOString().slice(0, 10);
    return new Date(ts).toISOString().slice(0, 10) === today;
  }

  // Update UI every second for live countdown
  function startUILoop() {
    setInterval(updateScanStatus, 1000);
  }

  return { start, stop, updateScanStatus, startUILoop };
})();

// ============================================================
// BIST Tracker — Config
// ============================================================

const _K = atob('QVEuQWI4Uk42S1hTUndaSWhNaXFVM0dEWnpJOER0RlQxU3RhLVFFc3oyZ1hwcWNvaEdWU2c=');

const CONFIG = {
  version: '1.0.0',

  stocks: [
    { ticker: 'EGEEN', name: 'Ege Endüstri', sector: 'Otomotiv' },
    { ticker: 'FROTO', name: 'Ford Otosan', sector: 'Otomotiv' },
    { ticker: 'CLEBI', name: 'Celebi Hava Servisi', sector: 'Havacılık' },
    { ticker: 'BRSAN', name: 'Borusan Mannesmann', sector: 'Metal' },
    { ticker: 'CCOLA', name: 'Coca-Cola İçecek', sector: 'İçecek' },
    { ticker: 'PGSUS', name: 'Pegasus Hava Taşımacılığı', sector: 'Havacılık' },
    { ticker: 'OTKAR', name: 'Otokar Otomobil', sector: 'Savunma/Otomotiv' },
    { ticker: 'ISMEN', name: 'İş Girişim Sermayesi', sector: 'Finans' },
    { ticker: 'ANSGR', name: 'Anadolu Sigorta', sector: 'Sigorta' },
    { ticker: 'LOGO',  name: 'Logo Yazılım', sector: 'Teknoloji' },
    { ticker: 'LKMNH', name: 'Lokman Hekim', sector: 'Sağlık' },
    { ticker: 'ALKA',  name: 'Alka Kimya', sector: 'Kimya' },
    { ticker: 'ALTNY', name: 'Altın Yunus Çeşme', sector: 'Turizm' },
    { ticker: 'SODSN', name: 'Sodaş Sodyum', sector: 'Kimya' },
  ],

  // KAP disclosure categories to track
  targetCategories: [
    'Özel Durum Açıklaması',
    'Faaliyet Raporu',
    'Finansal Rapor',
    'Sermaye Artırımı',
    'Borçlanma',
    'Yatırım',
    'Teşvik',
    'Sözleşme',
    'Sipariş',
    'İş İlişkisi',
    'CapEx',
  ],

  // CORS proxies — null origin uyumlu (file:// protokolü için)
  corsProxies: [
    'https://corsproxy.io/?url=',          // Ana proxy
    'https://api.allorigins.win/raw?url=', // Yedek 1
    'https://cors-proxy.fringe.zone/',     // Yedek 2 — null origin kabul eder
    'https://proxy.cors.sh/',              // Yedek 3
  ],

  // KAP base URLs
  kap: {
    base:        'https://www.kap.org.tr',
    apiBase:     'https://www.kap.org.tr/tr/api',
    disclosure:  'https://www.kap.org.tr/tr/BildirimDetay',
    company:     'https://www.kap.org.tr/tr/Sirket',
    financials:  'https://www.kap.org.tr/tr/sirket-finansallari',
    // Public JSON API endpoints (no CORS issue on some)
    disclosureQuery: 'https://www.kap.org.tr/tr/api/memberDisclosureQuery',
    memberSummary:   'https://www.kap.org.tr/tr/api/memberSummary',
  },

  // Scheduler times (HH:MM in local time)
  scheduleTimes: ['09:30', '16:00'],

  // Gemini
  gemini: {
    model: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  },

  // How many past quarters to show
  quarterCount: 20,

  // Past 6 months for initial KAP scan (milliseconds)
  initialScanDays: 180,
};

// Make immutable at runtime
Object.freeze(CONFIG);

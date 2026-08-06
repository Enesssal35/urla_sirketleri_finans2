// ============================================================
// BIST Tracker — Gemini API Integration
// ============================================================

const GeminiAPI = (() => {

  // Use user-set key if available, otherwise fall back to default
  function getKey() { return Store.getApiKey() || (typeof _K !== 'undefined' ? _K : ''); }

  // -------------------------------------------------------
  // Summarize a KAP disclosure text
  // Returns structured JSON summary
  // -------------------------------------------------------
  async function summarizeDisclosure(disclosure, fullText) {
    const key = getKey();
    if (!key) {
      return { error: 'API key yok', rawText: fullText.slice(0, 500) };
    }

    const prompt = `
Sen profesyonel bir BIST yatırım analistisin. Aşağıdaki KAP bildirimine göre yapılandırılmış bir analiz üret.

Hisse: ${disclosure.ticker}
Bildirim Kategorisi: ${disclosure.category}
Başlık: ${disclosure.title}
Tarih: ${disclosure.date}
URL: ${disclosure.url}

--- BİLDİRİM METNİ ---
${fullText.slice(0, 5000)}
--- METİN SONU ---

Yanıtını YALNIZCA aşağıdaki JSON formatında ver (başka hiçbir şey yazma):

{
  "category_label": "Bildirim kategorisi (örn: 'Yeni İş İlişkisi/Sözleşme', 'Lisans & Anlaşma', 'Finansal Rapor', 'Sermaye Artırımı', 'CapEx Yatırım', 'Borçlanma', 'Teşvik')",
  "headline": "Kısa, çarpıcı başlık (max 12 kelime)",
  "summary": "3-5 cümle özet: taraflar, işin konusu, rakamsal büyüklükler, süre, lokasyon. SADECE metinde geçen somut bilgileri yaz, varsayım yapma.",
  "positive": "🟢 Olumlu Taraf: Finansal/operasyonel kazanım — nakit akışı, marj, pazar payı etkisi. Rakam varsa yaz, yoksa 'Veri yok' de.",
  "negative": "🔴 Olumsuz Yön/Risk: Kur riski, sektörel risk, maliyet riski, uygulama riski, iç/global piyasa riski.",
  "signal": "Pozitif | Negatif | Nötr",
  "impact_score": 7,
  "roe_effect": "Tahmini bps (örn: +50bps) veya 'Belirsiz'",
  "roic_effect": "Tahmini bps veya 'Belirsiz'",
  "wacc_effect": "Tahmini bps veya 'Belirsiz'",
  "eva_direction": "Pozitif | Negatif | Nötr | Belirsiz",
  "key_numbers": ["rakam1", "rakam2"]
}

Kurallar:
- SADECE metinde geçen somut rakamlara, isimlere, maddi kazanım/kayıp bilgilerine dayan.
- Rakam yoksa "Veri yok" yaz, uydurma.
- impact_score 1-10 arası integer.
- Profesyonel yatırımcı diliyle, abartısız.
`;

    try {
      const endpoint = `${CONFIG.gemini.endpoint}/${CONFIG.gemini.model}:generateContent?key=${key}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      };

      const resp = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse JSON from Gemini response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON parse edilemedi');
      return JSON.parse(jsonMatch[0]);

    } catch (err) {
      console.error('Gemini hata:', err.message);
      return {
        category_label: disclosure.category || 'Bilinmiyor',
        headline: disclosure.title,
        summary: `Özet oluşturulamadı: ${err.message}`,
        positive: 'Veri yok',
        negative: 'Veri yok',
        signal: 'Nötr',
        impact_score: 0,
        roe_effect: 'Belirsiz',
        roic_effect: 'Belirsiz',
        wacc_effect: 'Belirsiz',
        eva_direction: 'Belirsiz',
        key_numbers: [],
        error: err.message,
      };
    }
  }

  // -------------------------------------------------------
  // Test API key validity
  // -------------------------------------------------------
  async function testKey(key) {
    try {
      const endpoint = `${CONFIG.gemini.endpoint}/${CONFIG.gemini.model}:generateContent?key=${key}`;
      const resp = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ parts: [{ text: 'Merhaba, kısa bir test.' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  return { summarizeDisclosure, testKey };
})();

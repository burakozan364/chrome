import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

// CORS: popup.js'ten direkt çağrı için gerekli
app.use(cors());
app.use(express.json({ limit: "2mb" })); // büyük body'lerde güvenli limit

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Basit sağlık kontrolü
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

// Yardımcı: OpenAI çağrısı
async function callOpenAI(prompt) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY tanımlı değil (Render → Environment Variables).");
  }

  const body = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Sen Trendyol ürün yorumlarını özetleyen bir asistansın. Çıktıyı Türkçe, kısa ve maddeli ver. Olumlu/olumsuz/gönderi/kargo-ambalaj/genel tavsiye gibi ana başlıkları 6-8 maddeyi geçmeden özetle."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.3
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  // OpenAI 422 gibi durumlarda buraya düşer
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${resp.status}: ${detail}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI yanıtı boş geldi.");
  return text;
}

// Dizi bölme
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// /summarize endpointi
app.post("/summarize", async (req, res) => {
  try {
    let reviews = [];
    const body = req.body || {};

    // 1) Gelen veriyi normalize et: {reviews:[{text:"..."}, ...]} | {reviews:["...","..."]} | {text:"..."}
    if (Array.isArray(body.reviews)) {
      reviews = body.reviews
        .map((r) => (typeof r === "string" ? r : r?.text))
        .filter((t) => typeof t === "string" && t.trim().length > 0);
    } else if (typeof body.text === "string") {
      reviews = [body.text];
    }

    if (!reviews.length) {
      return res.status(400).json({
        error: "Geçerli yorum verisi gönderilmedi.",
        expect: { reviews: [{ text: "metin" }, { text: "metin" }] }
      });
    }

    // 2) Çok uzun yorumları kes (ör. her birini max 300 karakter)
    const cleaned = reviews.map((t) => t.trim().slice(0, 300)).filter(Boolean);

    // 3) Toplam karakteri mantıklı parçalara ayır (mesaj başına ~5.5k char hedefleyelim)
    // 30 yorum/5500 karakter sınırı → token limitine güvenli yaklaşım
    const chunks = [];
    let current = [];
    let currentLen = 0;
    for (const t of cleaned) {
      if (current.length >= 30 || currentLen + t.length > 5500) {
        chunks.push(current.join("\n"));
        current = [t];
        currentLen = t.length;
      } else {
        current.push(t);
        currentLen += t.length;
      }
    }
    if (current.length) chunks.push(current.join("\n"));

    // 4) Her parça için kısmi özet al
    const partials = [];
    for (const [i, chunk] of chunks.entries()) {
      const prompt =
        `Aşağıda kullanıcı yorumları (parça ${i + 1}/${chunks.length}) var:\n\n${chunk}\n\n` +
        `Görev: Bu parçanın kısa maddeler halinde özetini çıkar.`;
      const partSummary = await callOpenAI(prompt);
      partials.push(partSummary);
    }

    // 5) Kısmi özetlerden genel özet al
    const finalPrompt =
      "Aşağıda bir ürünün kullanıcı yorumlarından elde edilmiş kısmi özetler var. " +
      "Bunları birleştirerek tekrar eden noktaları gruplayıp, 6-8 maddelik net ve tarafsız bir nihai özet yaz. " +
      "Olumlu/olumsuz yönler, kalite/uyumluluk, kargo/paketleme ve satın alma tavsiyesi mutlaka yer alsın.\n\n" +
      partials.join("\n\n");
    const finalSummary = await callOpenAI(finalPrompt);

    res.json({ summary: finalSummary, parts: chunks.length });
  } catch (err) {
    // Burada 422’yi içeri gömüp anlaşılır mesaj döndürüyoruz
    console.error("Backend error:", err);
    return res.status(400).json({
      error: "Özetleme isteği işlenemedi.",
      hint:
        "Genelde çok uzun/boş içerik veya geçersiz format yüzünden olur. " +
        "Gönderilen body: { reviews: [{text:'...'}] } şeklinde olmalı.",
      detail: String(err.message || err)
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server ${port} portunda çalışıyor`));

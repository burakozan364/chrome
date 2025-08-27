import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

// CORS: Chrome extension doğrudan çağırabilsin
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Basit sağlık
app.get("/", (_, res) => res.send("OK"));
app.get("/health", (_, res) => res.json({ ok: true }));

// --- Yardımcılar ---

// Güvenli parçalayıcı (char bazında toplama limiti + max eleman)
function chunkTexts(texts, maxItems = 30, maxChars = 5500) {
  const chunks = [];
  let bucket = [];
  let chars = 0;
  for (const t of texts) {
    const s = (t || "").trim().slice(0, 300); // tek yorum 300 char ile sınırla
    if (!s) continue;
    if (bucket.length >= maxItems || chars + s.length > maxChars) {
      if (bucket.length) chunks.push(bucket.join("\n"));
      bucket = [s];
      chars = s.length;
    } else {
      bucket.push(s);
      chars += s.length;
    }
  }
  if (bucket.length) chunks.push(bucket.join("\n"));
  return chunks;
}

// OpenAI'ya güvenli çağrı + model fallback
async function callOpenAIWithFallback(prompt) {
  if (!OPENAI_API_KEY) {
    throw { status: 500, message: "OPENAI_API_KEY tanımlı değil. Render → Environment Variables." };
  }

  const tryModels = [
    "gpt-4o-mini",
    "gpt-3.5-turbo" // fallback: çoğu hesapta açıktır
  ];

  let lastErr = null;
  for (const model of tryModels) {
    try {
      const body = {
        model,
        messages: [
          {
            role: "system",
            content:
              "Sen Trendyol ürün yorumlarını özetleyen bir asistansın. Çıktıyı Türkçe ve kısa, 6–8 madde olarak ver. Olumlu/olumsuz yönler, kalite/uyumluluk, kargo/paketleme ve satın alma tavsiyesi mutlaka yer alsın."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3
      };

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        // OpenAI 4xx/5xx → ayrıntıyı çıkar
        let detail = await resp.text().catch(() => "");
        // Denen modelin hatasını sakla; sonraki modele geç
        lastErr = { status: resp.status, message: `OpenAI ${resp.status} (${model}): ${detail}` };
        continue;
      }

      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw { status: 500, message: `OpenAI yanıtı boş (${model}).` };
      return text;
    } catch (e) {
      lastErr = { status: e.status || 500, message: e.message || String(e) };
      // sonraki modele devam
    }
  }
  // Tüm modeller başarısızsa son hatayı fırlat
  throw lastErr || { status: 500, message: "OpenAI isteği başarısız." };
}

// --- Endpoint ---

app.post("/summarize", async (req, res) => {
  try {
    const body = req.body || {};
    let reviews = [];

    // İzin verilen giriş biçimleri:
    // { reviews: [{text:"..."}, ...] }  |  { reviews: ["...", "..."] }  |  { text: "..." }
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
        expect: { reviews: [{ text: "..." }, { text: "..." }] }
      });
    }

    // Parçalara böl
    const parts = chunkTexts(reviews, 30, 5500);
    if (!parts.length) {
      return res.status(400).json({ error: "Gönderilen yorumlar boş görünüyor." });
    }

    // Parça özetleri
    const partials = [];
    for (let i = 0; i < parts.length; i++) {
      const prompt =
        `Aşağıda kullanıcı yorumları (parça ${i + 1}/${parts.length}) var:\n\n${parts[i]}\n\n` +
        `Görev: Bu parçayı Türkçe, 6 maddeyi geçmeden kısa ve net özetle.`;
      const summary = await callOpenAIWithFallback(prompt);
      partials.push(summary);
    }

    // Final özet
    const finalPrompt =
      "Aşağıda bir ürünün kullanıcı yorumlarına ait parça özetleri var. " +
      "Tekrarlayan noktaları gruplayıp, 6–8 maddelik nihai bir özet yaz. " +
      "Olumlu/olumsuz yönler, kalite/uyumluluk, kargo/paketleme ve satın alma tavsiyesi mutlaka yer alsın.\n\n" +
      partials.join("\n\n");
    const finalSummary = await callOpenAIWithFallback(finalPrompt);

    res.json({ summary: finalSummary, parts: parts.length });
  } catch (err) {
    // Burada upstream status’u koruyup ayrıntıyı döndürüyoruz (422 dahil)
    const status = err?.status || 500;
    const message = err?.message || "Bilinmeyen hata";
    console.error("✖ summarize error:", status, message);
    res.status(status).json({
      error: "Özetleme başarısız",
      detail: message
    });
  }
});

// Sunucu
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server ${port} portunda çalışıyor`));

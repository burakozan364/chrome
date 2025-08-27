import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Çevre değişkeninden API key oku
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/summarize", async (req, res) => {
  try {
    let { reviews } = req.body;

    if (!reviews || !Array.isArray(reviews)) {
      return res.status(400).json({ error: "reviews alanı gerekli ve array olmalı" });
    }

    // Eğer reviews string array ise objeye dönüştür
    if (reviews.length > 0 && typeof reviews[0] === "string") {
      reviews = reviews.map(t => ({ text: t }));
    }

    // Boş yorum kontrolü
    if (reviews.length === 0) {
      return res.status(400).json({ error: "Yorumlar boş olamaz" });
    }

    const allText = reviews.map(r => r.text).join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Sen Trendyol ürün yorumlarını özetleyen bir asistansın. Özetinde olumlu yönler, olumsuz yönler ve genel kanaati kısaca belirt."
          },
          { role: "user", content: allText }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: "OpenAI API hatası", detail: errText });
    }

    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || "Özet alınamadı.";

    res.json({ summary });

  } catch (err) {
    console.error("Backend hata:", err);
    res.status(500).json({ error: "Bir hata oluştu" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server ${port} portunda çalışıyor`));

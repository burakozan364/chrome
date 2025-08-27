import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI çağrısı yapan yardımcı fonksiyon
async function callOpenAI(prompt) {
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
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API hatası: ${errText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "Özet alınamadı.";
}

// Gruplama fonksiyonu
function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

app.post("/summarize", async (req, res) => {
  try {
    let { reviews } = req.body;

    if (!reviews || !Array.isArray(reviews)) {
      return res.status(400).json({ error: "reviews alanı gerekli ve array olmalı" });
    }

    // Eğer string array gelirse objeye dönüştür
    if (reviews.length > 0 && typeof reviews[0] === "string") {
      reviews = reviews.map(t => ({ text: t }));
    }

    // Boş yorum kontrolü
    if (reviews.length === 0) {
      return res.status(400).json({ error: "Yorumlar boş" });
    }

    // 1) Yorumları 50'şer parçaya böl
    const chunks = chunkArray(reviews, 50);

    // 2) Her parça için özet al
    const partialSummaries = [];
    for (const chunk of chunks) {
      const text = chunk.map(r => r.text).join("\n");
      const summary = await callOpenAI(text);
      partialSummaries.push(summary);
    }

    // 3) Tüm özetleri birleştirip genel özet al
    const finalSummary = await callOpenAI(
      "Aşağıda parçalı özetler var, bunlardan genel bir özet çıkar:\n\n" +
      partialSummaries.join("\n\n")
    );

    res.json({ summary: finalSummary });

  } catch (err) {
    console.error("Backend hata:", err);
    res.status(500).json({ error: "Bir hata oluştu", detail: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server ${port} portunda çalışıyor`));

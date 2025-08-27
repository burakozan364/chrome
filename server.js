import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Çevre değişkeninden API key oku
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/summarize", async (req, res) => {
  try {
    const { reviews } = req.body;
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

    const data = await response.json();
    res.json({ summary: data.choices[0].message.content.trim() });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bir hata oluştu" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server ${port} portunda çalışıyor`));

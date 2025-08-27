import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Basit test endpointi
app.get("/", (req, res) => {
  res.send("✅ Backend çalışıyor!");
});

app.post("/summarize", async (req, res) => {
  try {
    const { reviews } = req.body;

    if (!reviews || reviews.length === 0) {
      return res.status(400).json({ error: "reviews boş gönderildi" });
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
          { role: "system", content: "Sen Trendyol ürün yorumlarını özetleyen bir asistansın." },
          { role: "user", content: allText }
        ],
        max_tokens: 500,  // güvenlik için ekledik
        temperature: 0.3
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI Error:", data);
      return res.status(500).json({ error: "OpenAI API hatası", details: data });
    }

    res.json({ summary: data.choices[0].message.content.trim() });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bir hata oluştu" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server ${port} portunda çalışıyor`));

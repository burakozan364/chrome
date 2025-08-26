"""
Hepsiburada Yorum Özeti Servisi (FastAPI, CORS açık)
Çalıştırma (lokal):
  pip install -r requirements.txt
  uvicorn app:app --reload --port 8000
"""
import time
import random
from typing import List, Optional
import requests
from fastapi import FastAPI, Query, HTTPException
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tüm domainlere izin ver
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

def normalize_text(s: str) -> str:
    import re
    s = s or ""
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("\n", " ").replace("\r", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s

class Review(BaseModel):
    text: str
    rating: Optional[float] = None
    date: Optional[str] = None
    author: Optional[str] = None
    helpful: Optional[int] = None
    verified: Optional[bool] = None
    raw: dict = {}

class HepsiburadaFetcher:
    BASE_URL = "https://www.hepsiburada.com/api/reviews"
    def fetch_reviews(self, product_id: str, max_pages: Optional[int] = None, page_size:int=20) -> List[Review]:
        all_reviews: List[Review] = []
        page = 1
        while True:
            url = f"{self.BASE_URL}?productId={product_id}&page={page}&size={page_size}"
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
            if resp.status_code != 200:
                break
            try:
                data = resp.json()
            except Exception:
                break
            items = data.get("items") or []
            if not items:
                break
            for it in items:
                txt = normalize_text(it.get("reviewText", ""))
                if not txt:
                    continue
                all_reviews.append(Review(
                    text=txt,
                    rating=it.get("rate"),
                    date=it.get("submissionDate"),
                    author=it.get("userName"),
                    helpful=it.get("helpfulCount", 0),
                    verified=it.get("verifiedPurchase", False),
                    raw=it,
                ))
            if max_pages and page >= max_pages:
                break
            page += 1
            time.sleep(random.uniform(0.4, 1.1))  # nazik tarama
        return all_reviews

class SimpleSummarizer:
    def summarize(self, reviews: List[Review]) -> str:
        if not reviews:
            return "Yorum bulunamadı."
        texts = [r.text for r in reviews]
        joined = " ".join(texts[:200])
        import re
        sents = re.split(r"(?<=[.!?…])\s+", joined)
        return " ".join(sents[:3])

app = FastAPI(title="Hepsiburada Review Summarizer", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fetcher = HepsiburadaFetcher()
summarizer = SimpleSummarizer()

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/summarize")
def summarize(product_id: str = Query(..., description="Hepsiburada ürün ID (örn: HB00000XXX)"),
              max_pages: Optional[int] = Query(None, description="Maksimum sayfa (opsiyonel)")):
    try:
        reviews = fetcher.fetch_reviews(product_id=product_id, max_pages=max_pages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yorum çekilemedi: {e}")
    summary = summarizer.summarize(reviews)
    return {
        "product_id": product_id,
        "num_reviews": len(reviews),
        "summary": summary,
        "sample_reviews": [r.text for r in reviews[:5]]
    }

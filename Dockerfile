# Temel imaj
FROM python:3.10-slim

# Çalışma dizini oluştur
WORKDIR /app

# Gereksinimleri kopyala ve kur
COPY requirements.txt /app
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama dosyalarını kopyala
COPY app.py /app

# Port bilgisini dışarı aç (dökümantasyon için, Render kendi PORT'u atar)
EXPOSE 8000

# Uvicorn'u başlat (PORT env varsa onu, yoksa 8000'i kullan)
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}

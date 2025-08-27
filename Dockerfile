# ---- Base image ----
FROM python:3.10-slim

# ---- Çalışma dizini ----
WORKDIR /app

# ---- Gereksinimler ----
COPY requirements.txt /app
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install uvicorn  # garanti olsun diye ekledik

# ---- Uygulama kodu ----
COPY app.py /app

# ---- Render'ın PORT environment variable'ını kullan ----
EXPOSE 8000

# ---- Uvicorn'u Render'ın verdiği PORT'ta çalıştır ----
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]

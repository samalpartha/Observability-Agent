# ── Backend: Python 3.12 slim ──
FROM python:3.12-slim AS backend

WORKDIR /app

# Install system deps for bcrypt/cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download sentence-transformer model during build to prevent runtime rate limits
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY agent/ agent/
COPY api/ api/
COPY app/ app/
COPY elastic/ elastic/
COPY retrieval/ retrieval/
COPY .env* ./

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8765/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "2"]

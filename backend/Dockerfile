FROM python:3.12-slim

WORKDIR /app

# Install deps first for layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Seed on first boot if the DB is empty, then launch. PORT is provided by the host.
ENV DATABASE_URL=sqlite:///./app.db
EXPOSE 8000

CMD ["sh", "-c", "python -m app.seed || true; uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

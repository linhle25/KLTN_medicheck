# ---- Stage 1: Build ----
FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---- Stage 2: Production ----
FROM python:3.11-slim

WORKDIR /app

# Security: run as non-root user
RUN useradd -m appuser

# Copy installed packages from builder (owned by appuser so it can execute them)
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

# Copy application code
COPY --chown=appuser:appuser . .

# Create data directory with correct ownership
RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\", 8000)}/health')" || exit 1

# Shell form (khong phai JSON array) de ${PORT} duoc expand - can cho Render/Fly/
# Railway (tu gan bien PORT dong), fallback 8000 khi chay Docker thuong (vd docker-compose).
CMD uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}

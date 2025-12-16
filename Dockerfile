FROM python:3.11-slim

# Install system dependencies for Shapely/GEOS
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip to avoid segfaults with binary wheels
RUN pip install --upgrade pip setuptools wheel

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000

CMD ["python", "server.py"]

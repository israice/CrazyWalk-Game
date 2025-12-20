FROM python:3.10-slim

# Install system dependencies for Shapely/GEOS
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip to avoid segfaults and ensure compatibility
RUN python -m pip install --upgrade pip setuptools wheel

COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Re-install shapely from source with explicit no-binary if needed (keeping original intent)
RUN pip install --no-cache-dir --no-binary shapely shapely

COPY . .

EXPOSE 8000

CMD ["python", "server.py"]

FROM python:3.11-slim

# Install git, curl, and docker CLI
RUN apt-get update && apt-get install -y \
    git \
    curl \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Install docker-compose standalone binary
RUN curl -SL https://github.com/docker/compose/releases/download/v2.29.1/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose \
    && chmod +x /usr/local/bin/docker-compose

# Fix "dubious ownership" error in git
RUN git config --global --add safe.directory /app

EXPOSE 9000

WORKDIR /app

# We don't strictly need to COPY if we mount the volume, but it's good for standalone builds.
# However, since we mount the root to /app, this file will be shadowed unless we change the destination.
# But the CMD will run the script from the mounted volume.
COPY AUTOUPDATE_WEBHOOK_FROM_GITHUB.py .

# The CMD needs to point to the script location relative to /app (which is the project root)
# Since we are moving the script to CORE/TOOLS/AUTOUPDATE_WEBHOOK_FROM_GITHUB/
# And we mount .:/app
# The script will be at /app/CORE/TOOLS/AUTOUPDATE_WEBHOOK_FROM_GITHUB/AUTOUPDATE_WEBHOOK_FROM_GITHUB.py
CMD ["python", "CORE/TOOLS/AUTOUPDATE_WEBHOOK_FROM_GITHUB/AUTOUPDATE_WEBHOOK_FROM_GITHUB.py"]

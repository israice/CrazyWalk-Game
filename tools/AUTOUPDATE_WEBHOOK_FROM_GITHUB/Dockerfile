FROM node:20-slim

# Install git and docker CLI
RUN apt-get update && apt-get install -y \
    git \
    docker.io \
    docker-compose \
    && rm -rf /var/lib/apt/lists/*

# Fix "dubious ownership" error in git
RUN git config --global --add safe.directory /app

EXPOSE 9000

WORKDIR /app

# Copy webhook script
COPY webhook.js .

# The CMD runs the script from the mounted volume
CMD ["node", "CORE/TOOLS/AUTOUPDATE_WEBHOOK_FROM_GITHUB/webhook.js"]

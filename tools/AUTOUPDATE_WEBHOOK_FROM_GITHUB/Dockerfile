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

# No COPY needed - the entire project is mounted as /app via docker-compose volume
# This ensures webhook.js is always up-to-date after git pull

CMD ["node", "tools/AUTOUPDATE_WEBHOOK_FROM_GITHUB/webhook.js"]

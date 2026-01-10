FROM node:20-slim

# Install git, docker CLI and docker compose plugin
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Fix "dubious ownership" error in git
RUN git config --global --add safe.directory /app

EXPOSE 9000

WORKDIR /app

# No COPY needed - the entire project is mounted as /app via docker-compose volume
# This ensures webhook.js is always up-to-date after git pull

CMD ["node", "tools/AUTOUPDATE_WEBHOOK_FROM_GITHUB/webhook.js"]

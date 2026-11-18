FROM node:22

WORKDIR /app

# Install every workspace's dependencies from the root lockfile.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

# Copy sources and build the shared workspace the backend imports at runtime.
COPY shared ./shared
COPY backend ./backend
RUN npm run build --workspace=@matcha/shared

WORKDIR /app/backend

RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

# Wait for Postgres, seed on first run, then start the API.
ENTRYPOINT ["./docker-entrypoint.sh"]

FROM node:22

WORKDIR /app

# Install every workspace's dependencies from the root lockfile.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci

# Copy sources and build the shared workspace the frontend imports.
COPY shared ./shared
COPY frontend ./frontend
RUN npm run build --workspace=@matcha/shared

WORKDIR /app/frontend

# Make the hoisted workspace binaries (vite) available on PATH.
ENV PATH=/app/node_modules/.bin:$PATH

EXPOSE 5173

# Vite dev server bound to all interfaces so the host can reach it.
CMD ["vite", "--host", "0.0.0.0", "--port", "5173"]

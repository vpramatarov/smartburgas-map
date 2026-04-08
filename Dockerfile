# Base: Shared setup
FROM node:25-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./

# Stage: DEVELOPMENT - Used by docker-compose for local coding
FROM base AS development
# Install Git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
# Tell Git to trust the /app directory globally for the whole container
RUN git config --system --add safe.directory /app

# Set the Playwright path variable globally
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 3. Create ALL necessary folders while we are still 'root', and give them to 'node'
RUN mkdir -p /app/node_modules /ms-playwright && chown -R node:node /app /ms-playwright

# Switch to the node user BEFORE installing packages
USER node
# Install ALL dependencies (including nodemon, typescript)
RUN npm install

# Switch to root JUST to install Playwright's OS-level dependencies (fonts, libraries)
USER root
# Install Playwright OS dependencies and the Chromium browser
RUN npx playwright install-deps chromium

# Switch back to the built-in non-root user
USER node
# Switch back to node to install the actual browser binaries in the node user's safe cache
RUN npx playwright install chromium

CMD ["npm", "start"]

# Stage: BUILDER - Compiles the TS code for production
FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build


# Stage: PRODUCTION
FROM node:25-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/cau.json ./cau.json
COPY --from=builder /app/paid-parking-zones.json ./paid-parking-zones.json

# Switch to the built-in non-root user for security
USER node

EXPOSE 3000
CMD ["node", "dist/Server.js"]
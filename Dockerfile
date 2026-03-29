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
# Install ALL dependencies (including nodemon, typescript)
RUN npm install
# Switch to the built-in non-root user
USER node
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

# Switch to the built-in non-root user for security
USER node

EXPOSE 3000
CMD ["node", "dist/Server.js"]
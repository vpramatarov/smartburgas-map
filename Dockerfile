# Base: Shared setup
FROM node:25-bookworm AS base
WORKDIR /app
COPY package*.json ./

# Stage: DEVELOPMENT - Used by docker-compose for local coding
FROM base AS development
# Install ALL dependencies (including nodemon, typescript)
RUN npm install
CMD ["npm", "start"]

# Stage: BUILDER - Compiles the TS code for production
FROM base AS builder
RUN npm install
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

EXPOSE 3000
CMD ["node", "dist/Server.js"]
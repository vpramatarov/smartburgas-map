FROM node:25-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3000

# Start command (configured for dev with hot reload in package.json)
CMD ["npm", "start"]
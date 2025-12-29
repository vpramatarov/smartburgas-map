FROM node:25-alpine

WORKDIR /app

# Copy package definition
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start command (configured for dev with hot reload in package.json)
CMD ["npm", "start"]
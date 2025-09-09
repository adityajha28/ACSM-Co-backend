# backend/Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy package files then install
COPY package*.json ./
RUN npm install --production

# Copy app
COPY . .

EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "server/server.js"]

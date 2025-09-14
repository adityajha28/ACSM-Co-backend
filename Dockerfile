# Use official Node.js 20 LTS image
FROM public.ecr.aws/docker/library/node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port the app will run on
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production

# Command to start the server
CMD ["node", "server.js"]

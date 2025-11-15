FROM node:22-alpine

WORKDIR /app

# Install dependencies for Puppeteer
RUN apk add --no-cache chromium

# Copy package files
COPY package.json package-lock.json ./

# Install npm dependencies
RUN npm ci

# Copy application code
COPY index.js .

# Create .env file from environment variables (will be set during Cloud Run deployment)
RUN echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser" > .env

# Set environment for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Run the scraper
CMD ["node", "index.js"]

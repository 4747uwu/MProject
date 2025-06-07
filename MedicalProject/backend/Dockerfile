# 🔧 PRODUCTION: backend/Dockerfile
FROM node:22-alpine AS base

# Install ALL build dependencies including CMake for DICOM package
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake \
    pkgconfig \
    libc-dev \
    linux-headers \
    git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use --omit=dev instead of --only=production)
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "server.js"]
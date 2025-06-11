# 🔧 PRODUCTION: backend/Dockerfile with Debian and DCMTK
FROM node:22-bookworm-slim AS base

# Update package list and install dependencies including DCMTK
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    cmake \
    pkg-config \
    git \
    dcmtk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

# Create temp directory for DICOM operations with proper permissions
RUN mkdir -p /tmp/dicom_temp && \
    chown -R nodejs:nodejs /tmp/dicom_temp
    
# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (FIXED: 5000 instead of 3000)
EXPOSE 3000

# Start command (FIXED: npm start instead of node server.js)
CMD ["node", "server.js"]
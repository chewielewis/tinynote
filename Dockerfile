# Multi-stage build for TinyNote with canvas support
# Stage 1: Build environment with all dependencies
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies for canvas (native module)
# These are required to compile canvas but not needed at runtime
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Production runtime with minimal footprint
FROM node:20-alpine

# Install runtime dependencies for canvas
# These libraries are needed at runtime for canvas to work
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype \
    libgcc \
    libstdc++

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S tinynote -u 1001

# Set working directory
WORKDIR /app

# Copy node modules from builder stage
COPY --from=builder --chown=tinynote:nodejs /app/node_modules ./node_modules

# Copy application files
COPY --chown=tinynote:nodejs package*.json ./
COPY --chown=tinynote:nodejs *.js ./
COPY --chown=tinynote:nodejs public ./public
COPY --chown=tinynote:nodejs scripts ./scripts

# Create data directory for persistence
RUN mkdir -p /app/data && \
    chown -R tinynote:nodejs /app/data

# Switch to non-root user
USER tinynote

# Expose port (default 4444, configurable via PORT env var)
EXPOSE 4444

# Health check to verify server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node /app/scripts/healthcheck.js

# Set default environment variables (can be overridden)
ENV PORT=4444 \
    PRINTER_IP=10.1.1.30 \
    PRINTER_PORT=9100 \
    OPENROUTER_MODEL=anthropic/claude-3.5-sonnet \
    PERPLEXITY_MODEL=perplexity/sonar-small-online \
    MIN_PRINT_INTERVAL_MS=3000 \
    SEARCH_TIMEOUT_MS=10000 \
    CACHE_TTL_MS=300000 \
    DATA_DIR=/app/data \
    PROMPTS_FILE=/app/data/prompts.json

# Make entrypoint script executable
RUN chmod +x /app/scripts/docker-entrypoint.sh

# Use entrypoint script for validation and setup
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the server (default command if ENTRYPOINT completes)
CMD ["node", "server.js"]

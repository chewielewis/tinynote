#!/bin/sh
set -e

# TinyNote Docker Entrypoint Script
# Validates configuration and prepares the container environment

echo "🖨️  Starting TinyNote..."
echo ""

# Validate required environment variables
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "❌ ERROR: OPENROUTER_API_KEY environment variable is required"
  echo "   Get your API key from: https://openrouter.ai/"
  exit 1
fi

# Log configuration (without exposing sensitive data)
echo "✅ Configuration validated:"
echo "   - Printer: ${PRINTER_IP:-10.1.1.30}:${PRINTER_PORT:-9100}"
echo "   - Web UI Port: ${PORT:-4444}"
echo "   - AI Model: ${OPENROUTER_MODEL:-anthropic/claude-3.5-sonnet}"
echo "   - Search Model: ${PERPLEXITY_MODEL:-perplexity/sonar-small-online}"
echo "   - Min Print Interval: ${MIN_PRINT_INTERVAL_MS:-3000}ms"
echo "   - Search Timeout: ${SEARCH_TIMEOUT_MS:-10000}ms"
echo "   - Cache TTL: ${CACHE_TTL_MS:-300000}ms"
echo ""

# Create data directory if it doesn't exist
if [ ! -d "/app/data" ]; then
  echo "📁 Creating data directory..."
  mkdir -p /app/data
fi

# Initialize prompts.json if it doesn't exist
if [ ! -f "/app/data/prompts.json" ]; then
  echo "📄 Initializing prompts.json..."
  echo '[]' > /app/data/prompts.json
fi

# Ensure proper permissions
if [ "$(id -u)" = "0" ]; then
  # If running as root, fix permissions for tinynote user
  chown -R tinynote:nodejs /app/data 2>/dev/null || true
fi

echo "🚀 Starting server..."
echo ""

# Start the application
exec node server.js

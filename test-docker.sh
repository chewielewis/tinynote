#!/bin/bash
# TinyNote Docker Test Script
# Tests the containerized application

set -e

echo "🧪 Testing TinyNote Docker Container..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker found${NC}"

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠️  docker-compose not found, using docker compose plugin${NC}"
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

echo -e "${GREEN}✅ Using: $COMPOSE${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env and add your OPENROUTER_API_KEY${NC}"
    echo ""
fi

# Check for OPENROUTER_API_KEY
if ! grep -q "OPENROUTER_API_KEY=sk-or-v1-" .env 2>/dev/null; then
    echo -e "${RED}❌ OPENROUTER_API_KEY not set in .env${NC}"
    echo "Please edit .env and add your API key from https://openrouter.ai/"
    exit 1
fi

echo -e "${GREEN}✅ OPENROUTER_API_KEY found${NC}"
echo ""

# Build the image
echo "🔨 Building Docker image..."
$COMPOSE build
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Start the container
echo "🚀 Starting container..."
$COMPOSE up -d
echo -e "${GREEN}✅ Container started${NC}"
echo ""

# Wait for container to be ready
echo "⏳ Waiting for container to be ready..."
sleep 5

# Check container status
if $COMPOSE ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Container is running${NC}"
else
    echo -e "${RED}❌ Container failed to start${NC}"
    $COMPOSE logs
    exit 1
fi

# Check health status
echo ""
echo "🏥 Checking container health..."
HEALTH=$(docker inspect tinynote 2>/dev/null | jq -r '.[0].State.Health.Status' || echo "unknown")

if [ "$HEALTH" = "healthy" ]; then
    echo -e "${GREEN}✅ Container is healthy${NC}"
elif [ "$HEALTH" = "starting" ]; then
    echo -e "${YELLOW}⚠️  Container is still starting...${NC}"
    sleep 5
else
    echo -e "${YELLOW}⚠️  Health check: $HEALTH${NC}"
fi

# Show logs
echo ""
echo "📋 Recent container logs:"
$COMPOSE logs --tail=20
echo ""

# Test the API
echo "🔍 Testing API endpoint..."
if curl -s http://localhost:4444 > /dev/null; then
    echo -e "${GREEN}✅ Web UI is accessible${NC}"
    echo "   Open http://localhost:4444 in your browser"
else
    echo -e "${RED}❌ Web UI is not accessible${NC}"
    echo "   Check logs with: $COMPOSE logs"
fi

echo ""
echo "🎉 Testing complete!"
echo ""
echo "Useful commands:"
echo "  - View logs:     $COMPOSE logs -f"
echo "  - Stop container: $COMPOSE stop"
echo "  - Start container: $COMPOSE start"
echo "  - Restart:        $COMPOSE restart"
echo ""

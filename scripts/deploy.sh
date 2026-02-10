#!/bin/bash

# Deployment script for Lottery Backend
# This script handles deployment to production environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Environment
ENVIRONMENT=${1:-production}
VERSION=${2:-latest}

echo -e "${GREEN}=== Lottery Backend Deployment ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Version: $VERSION"
echo ""

# Check if required tools are installed
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker is required but not installed.${NC}" >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}Docker Compose is required but not installed.${NC}" >&2; exit 1; }

# Load environment variables
if [ -f ".env.$ENVIRONMENT" ]; then
    echo -e "${YELLOW}Loading environment from .env.$ENVIRONMENT${NC}"
    export $(cat ".env.$ENVIRONMENT" | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}Warning: .env.$ENVIRONMENT not found, using default .env${NC}"
    if [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
fi

# Build Docker image
echo -e "${GREEN}Building Docker image...${NC}"
docker build -t lottery-backend:$VERSION .

# Tag for registry (if needed)
if [ -n "$DOCKER_REGISTRY" ]; then
    echo -e "${GREEN}Tagging image for registry...${NC}"
    docker tag lottery-backend:$VERSION $DOCKER_REGISTRY/lottery-backend:$VERSION
    
    echo -e "${GREEN}Pushing to registry...${NC}"
    docker push $DOCKER_REGISTRY/lottery-backend:$VERSION
fi

# Run database migrations
echo -e "${GREEN}Running database migrations...${NC}"
docker-compose -f docker-compose.prod.yml run --rm app npm run migrate

# Deploy with Docker Compose
echo -e "${GREEN}Deploying services...${NC}"
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check health
echo -e "${GREEN}Checking service health...${NC}"
# Wait for container to be healthy via docker-compose
docker-compose -f docker-compose.prod.yml ps | grep -q "healthy" || (
    echo -e "${RED}Services not healthy. Checking logs...${NC}"
    docker-compose -f docker-compose.prod.yml logs --tail=50 app
    exit 1
)

echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo -e "Application is running at: http://localhost:3000"
echo -e "Metrics available at: http://localhost:9090"
echo -e "Grafana dashboard at: http://localhost:3001"
echo ""
echo -e "${YELLOW}To view logs:${NC} docker-compose -f docker-compose.prod.yml logs -f"
echo -e "${YELLOW}To stop:${NC} docker-compose -f docker-compose.prod.yml down"

#!/bin/bash

# Deploy to Render using API
# Usage: RENDER_API_KEY=xxx RENDER_SERVICE_ID=xxx ./scripts/deploy_to_render.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Render Deployment Script${NC}"
echo "==============================="

# Check required environment variables
if [ -z "$RENDER_API_KEY" ]; then
    echo -e "${RED}❌ Error: RENDER_API_KEY environment variable is not set${NC}"
    echo ""
    echo "Usage:"
    echo "  export RENDER_API_KEY='your-render-api-key'"
    echo "  export RENDER_SERVICE_ID='your-service-id'"
    echo "  ./scripts/deploy_to_render.sh"
    echo ""
    echo "Get your API key from: https://dashboard.render.com/account/api-keys"
    exit 1
fi

if [ -z "$RENDER_SERVICE_ID" ]; then
    echo -e "${RED}❌ Error: RENDER_SERVICE_ID environment variable is not set${NC}"
    echo ""
    echo "Usage:"
    echo "  export RENDER_API_KEY='your-render-api-key'"
    echo "  export RENDER_SERVICE_ID='your-service-id'"
    echo "  ./scripts/deploy_to_render.sh"
    echo ""
    echo "Get your service ID from your Render service dashboard URL"
    exit 1
fi

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "  Service ID: ${RENDER_SERVICE_ID}"
echo ""

# Trigger deployment
echo -e "${YELLOW}🔄 Triggering deployment...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ]; then
    echo -e "${GREEN}✅ Deployment triggered successfully!${NC}"
    echo ""
    
    # Extract deploy ID if available
    DEPLOY_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$DEPLOY_ID" ]; then
        echo -e "${BLUE}ℹ️  Deploy ID: ${DEPLOY_ID}${NC}"
        echo "   Track progress at: https://dashboard.render.com/web/${RENDER_SERVICE_ID}/deploys/${DEPLOY_ID}"
    else
        echo "   Track progress at: https://dashboard.render.com/web/${RENDER_SERVICE_ID}"
    fi
    echo ""
    echo -e "${YELLOW}⏳ Note: Deployment will take a few minutes to complete${NC}"
    
    exit 0
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${RED}❌ Authentication failed (HTTP 401)${NC}"
    echo "   Please check your RENDER_API_KEY"
    exit 1
elif [ "$HTTP_CODE" = "404" ]; then
    echo -e "${RED}❌ Service not found (HTTP 404)${NC}"
    echo "   Please check your RENDER_SERVICE_ID"
    exit 1
else
    echo -e "${RED}❌ Deployment failed (HTTP ${HTTP_CODE})${NC}"
    echo ""
    echo "Response:"
    echo "$BODY"
    exit 1
fi

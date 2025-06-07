#!/bin/bash
# 🔧 PRODUCTION: scripts/deploy.sh

set -e

echo "🚀 Starting deployment to DigitalOcean..."

# Check if required environment variables are set
if [ -z "$DO_REGISTRY_NAME" ]; then
    echo "❌ Error: DO_REGISTRY_NAME environment variable is not set"
    exit 1
fi

if [ -z "$DO_BACKEND_APP_ID" ]; then
    echo "❌ Error: DO_BACKEND_APP_ID environment variable is not set"
    exit 1
fi

if [ -z "$DO_FRONTEND_APP_ID" ]; then
    echo "❌ Error: DO_FRONTEND_APP_ID environment variable is not set"
    exit 1
fi

# Login to DigitalOcean Container Registry
echo "🔐 Logging into DigitalOcean Container Registry..."
doctl registry login --expiry-seconds 1200

# Build and push backend image
echo "📦 Building backend Docker image..."
docker build -t medical-backend:latest ./backend
docker tag medical-backend:latest registry.digitalocean.com/$DO_REGISTRY_NAME/medical-backend:latest
docker tag medical-backend:latest registry.digitalocean.com/$DO_REGISTRY_NAME/medical-backend:$(date +%Y%m%d_%H%M%S)

echo "📤 Pushing backend image to registry..."
docker push registry.digitalocean.com/$DO_REGISTRY_NAME/medical-backend:latest
docker push registry.digitalocean.com/$DO_REGISTRY_NAME/medical-backend:$(date +%Y%m%d_%H%M%S)

# Build and push frontend image
echo "📦 Building frontend Docker image..."
docker build -t medical-frontend:latest ./frontend
docker tag medical-frontend:latest registry.digitalocean.com/$DO_REGISTRY_NAME/medical-frontend:latest
docker tag medical-frontend:latest registry.digitalocean.com/$DO_REGISTRY_NAME/medical-frontend:$(date +%Y%m%d_%H%M%S)

echo "📤 Pushing frontend image to registry..."
docker push registry.digitalocean.com/$DO_REGISTRY_NAME/medical-frontend:latest
docker push registry.digitalocean.com/$DO_REGISTRY_NAME/medical-frontend:$(date +%Y%m%d_%H%M%S)

# Deploy to App Platform
echo "🚀 Deploying backend to App Platform..."
doctl apps create-deployment $DO_BACKEND_APP_ID --wait

echo "🚀 Deploying frontend to App Platform..."
doctl apps create-deployment $DO_FRONTEND_APP_ID --wait

echo "✅ Deployment completed successfully!"
echo "🔍 Check deployment status:"
echo "   Backend:  doctl apps get $DO_BACKEND_APP_ID"
echo "   Frontend: doctl apps get $DO_FRONTEND_APP_ID"
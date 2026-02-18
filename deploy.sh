#!/bin/bash
# Quick Deployment Script
# Face Recognition System

set -e

echo "================================"
echo "Face Recognition System Deployment"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker not found. Please install Docker first.${NC}"
    exit 1
fi
echo -e "${GREEN}Docker installed${NC}"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose not found. Please install Docker Compose first.${NC}"
    exit 1
fi
echo -e "${GREEN}Docker Compose installed${NC}"

# Check GPU (optional)
if command -v nvidia-smi &> /dev/null; then
    echo -e "${GREEN}NVIDIA GPU detected${NC}"
    nvidia-smi --query-gpu=name --format=csv,noheader
else
    echo -e "${YELLOW}No GPU detected. ML service will run on CPU (slower).${NC}"
fi

echo ""
echo "================================"
echo "Choose deployment mode:"
echo "================================"
echo "1) Production (all services)"
echo "2) Development (local ML service)"
echo "3) Stop all services"
echo "4) View logs"
echo "5) Rebuild services"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "Starting production deployment..."
        docker-compose -f docker-compose.prod.yml up -d
        echo ""
        echo -e "${GREEN}Services started successfully!${NC}"
        echo ""
        echo "Services available at:"
        echo "  - Backend API:    http://localhost:3000"
        echo "  - ML Service:     http://localhost:8000"
        echo "  - ML API Docs:    http://localhost:8000/docs"
        echo "  - Milvus:         localhost:19530"
        echo ""
        echo "Check status: docker-compose -f docker-compose.prod.yml ps"
        echo "View logs:    docker-compose -f docker-compose.prod.yml logs -f"
        ;;
    2)
        echo ""
        echo "Starting development mode..."
        echo "Starting Milvus..."
        cd infra/milvus
        docker-compose up -d
        cd ../..
        echo ""
        echo -e "${GREEN}Milvus started${NC}"
        echo ""
        echo "To run ML service locally:"
        echo "  cd ml_service"
        echo "  python -m venv venv"
        echo "  source venv/bin/activate"
        echo "  pip install -r requirements.txt"
        echo "  python main.py"
        ;;
    3)
        echo ""
        echo "Stopping all services..."
        docker-compose -f docker-compose.prod.yml down
        cd infra/milvus && docker-compose down
        echo -e "${GREEN}All services stopped${NC}"
        ;;
    4)
        echo ""
        echo "Showing logs (Ctrl+C to exit)..."
        docker-compose -f docker-compose.prod.yml logs -f
        ;;
    5)
        echo ""
        echo "Rebuilding services..."
        docker-compose -f docker-compose.prod.yml build --no-cache
        docker-compose -f docker-compose.prod.yml up -d
        echo -e "${GREEN}Services rebuilt and started${NC}"
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

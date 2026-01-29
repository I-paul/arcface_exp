@echo off
REM ============================================
REM Quick Deployment Script - Windows
REM Face Recognition System
REM ============================================

echo ================================
echo Face Recognition System Deployment
echo ================================
echo.

REM Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found. Please install Docker Desktop first.
    pause
    exit /b 1
)
echo [OK] Docker installed

REM Check Docker Compose
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose not found.
    pause
    exit /b 1
)
echo [OK] Docker Compose installed

REM Check GPU
nvidia-smi >nul 2>&1
if errorlevel 1 (
    echo [WARNING] No NVIDIA GPU detected. ML service will run on CPU.
) else (
    echo [OK] NVIDIA GPU detected
)

echo.
echo ================================
echo Choose deployment mode:
echo ================================
echo 1) Production (all services)
echo 2) Stop all services
echo 3) View logs
echo 4) Rebuild services
echo 5) Check status
echo.
set /p choice="Enter choice [1-5]: "

if "%choice%"=="1" (
    echo.
    echo Starting production deployment...
    docker-compose -f docker-compose.prod.yml up -d
    echo.
    echo [SUCCESS] Services started successfully!
    echo.
    echo Services available at:
    echo   - Backend API:    http://localhost:3000
    echo   - ML Service:     http://localhost:8000
    echo   - ML API Docs:    http://localhost:8000/docs
    echo   - Milvus:         localhost:19530
    echo.
    echo Check status: docker-compose -f docker-compose.prod.yml ps
    echo View logs:    docker-compose -f docker-compose.prod.yml logs -f
    pause
) else if "%choice%"=="2" (
    echo.
    echo Stopping all services...
    docker-compose -f docker-compose.prod.yml down
    cd infra\milvus
    docker-compose down
    cd ..\..
    echo [SUCCESS] All services stopped
    pause
) else if "%choice%"=="3" (
    echo.
    echo Showing logs (Ctrl+C to exit)...
    docker-compose -f docker-compose.prod.yml logs -f
) else if "%choice%"=="4" (
    echo.
    echo Rebuilding services...
    docker-compose -f docker-compose.prod.yml build --no-cache
    docker-compose -f docker-compose.prod.yml up -d
    echo [SUCCESS] Services rebuilt and started
    pause
) else if "%choice%"=="5" (
    echo.
    echo Service Status:
    docker-compose -f docker-compose.prod.yml ps
    echo.
    pause
) else (
    echo [ERROR] Invalid choice
    pause
    exit /b 1
)

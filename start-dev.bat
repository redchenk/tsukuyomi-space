@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Tsukuyomi Space Launcher

echo ==========================================
echo    Tsukuyomi Space - dev launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js 20+ first: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

set "RUNNER="
where pnpm >nul 2>nul
if not errorlevel 1 set "RUNNER=pnpm"
if not defined RUNNER (
    where npm >nul 2>nul
    if not errorlevel 1 set "RUNNER=npm"
)
if not defined RUNNER (
    echo [ERROR] Neither pnpm nor npm was found on PATH.
    echo.
    pause
    exit /b 1
)

echo Using package manager: %RUNNER%
echo.

if not exist "node_modules\express\package.json" (
    echo [1/2] Installing dependencies ^(first run, may take a few minutes^)...
    call %RUNNER% install
    if errorlevel 1 (
        echo.
        echo [ERROR] Dependency install failed. See the messages above.
        echo.
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed.
)

echo.
echo [2/2] Starting API and frontend dev servers in separate windows...
start "tsukuyomi-api" /d "%~dp0" cmd /k "npm run dev:api"
start "tsukuyomi-web" /d "%~dp0" cmd /k "npm run dev:web"

echo.
echo Waiting for the frontend to come up...
timeout /t 8 /nobreak >nul
start "" "http://localhost:5173/"

echo.
echo Frontend : http://localhost:5173/
echo API      : http://127.0.0.1:3000/api/health
echo.
echo Close the two "tsukuyomi-api" / "tsukuyomi-web" windows to stop the servers.
echo.
pause
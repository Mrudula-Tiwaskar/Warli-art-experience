@echo off
title Mohalla Warli Game Server
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo Starting server with Python...
    python -m http.server 8000
    goto end
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    echo Starting server with Python (py)...
    py -m http.server 8000
    goto end
)

echo Starting native PowerShell server...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"

:end
pause

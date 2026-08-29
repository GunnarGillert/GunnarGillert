@echo off
title Energiewerk - Als Windows-Dienst installieren

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administratorrechte werden benoetigt - wird neu gestartet ...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
if not exist node_modules (
    echo Erste Einrichtung: fuehre npm install aus ...
    call npm install
)
node scripts\install-service.js
pause

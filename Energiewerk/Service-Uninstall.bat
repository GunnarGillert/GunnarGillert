@echo off
title Energiewerk - Windows-Dienst entfernen

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administratorrechte werden benoetigt - wird neu gestartet ...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
node scripts\uninstall-service.js
pause

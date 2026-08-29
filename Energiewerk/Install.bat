@echo off
title Energiewerk - Installation

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administratorrechte werden benoetigt - Installation wird neu gestartet ...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
pause

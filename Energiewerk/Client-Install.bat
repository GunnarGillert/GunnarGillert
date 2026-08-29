@echo off
title Energiewerk - Client-Einrichtung

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administratorrechte werden benoetigt - wird neu gestartet ...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Client-Install.ps1"
pause

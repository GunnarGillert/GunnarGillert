@echo off
title Energiewerk - Update

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administratorrechte werden benoetigt - Update wird neu gestartet ...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update.ps1" %*

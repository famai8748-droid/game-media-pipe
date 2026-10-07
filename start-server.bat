@echo off
chcp 65001 >nul
title DMI YOGA Server
cd /d "%~dp0"
echo Starting DMI YOGA Server...
echo (Close this window to stop the server)
echo.
node server.js
echo.
echo Server stopped.
pause

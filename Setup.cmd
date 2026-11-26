@echo off
setlocal
title PROCURE360 Setup
echo.
echo   PROCURE360 - one-click Windows setup
echo   Native service + SQLite (no Docker required)
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
    echo.
    echo Setup failed with exit code %CODE%.
    echo See install.log in this folder for details.
    pause
)
endlocal & exit /b %CODE%

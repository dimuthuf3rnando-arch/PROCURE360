@echo off
setlocal
title PROCURE360 Uninstall
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
    echo.
    echo Uninstall failed with exit code %CODE%.
    pause
)
endlocal & exit /b %CODE%

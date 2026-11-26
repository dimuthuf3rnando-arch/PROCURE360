@echo off
setlocal
title PROCURE360
cd /d "%~dp0"
set "PYTHONPATH=%~dp0backend"
"%~dp0runtime\python\python.exe" "%~dp0backend\run_server.py"
echo.
echo PROCURE360 stopped.
pause

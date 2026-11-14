@echo off
setlocal
cd /d "%~dp0"
py -m pip install -e ".[live]"
if errorlevel 1 goto error
py -m cartoptimizer
if errorlevel 1 goto error
exit /b 0
:error
echo.
echo Sabadchin could not start. Please keep the error above for troubleshooting.
pause
exit /b 1

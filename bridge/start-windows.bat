@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20+ from nodejs.org, then reopen this launcher.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if errorlevel 1 (
  echo Installation failed. Check your internet connection and try again.
  pause
  exit /b 1
)
node launch.mjs
pause

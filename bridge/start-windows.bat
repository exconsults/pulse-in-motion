@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .env (
  set /p KEY=Paste your SmartSpectra API key and press Enter: 
  call echo SMARTSPECTRA_API_KEY=%%KEY%%> .env
)
node server.mjs
pause

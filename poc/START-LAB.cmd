@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
node.exe -e "if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js 22 or newer is required.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
node.exe server.mjs --open
set "LAB_EXIT=%ERRORLEVEL%"
if not "%LAB_EXIT%"=="0" pause
endlocal & exit /b %LAB_EXIT%

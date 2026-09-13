@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is not available on PATH.
  echo Double-click OPEN-NOTESPACE.html instead. No installation is needed for that version.
  pause
  exit /b 1
)
node.exe server.cjs --open
if errorlevel 1 pause
endlocal

@echo off
setlocal
cd /d "%~dp0"
node.exe scripts\verify-package.mjs
set "LAB_EXIT=%ERRORLEVEL%"
pause
endlocal & exit /b %LAB_EXIT%

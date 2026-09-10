@echo off
setlocal
cd /d "%~dp0"
node.exe --test
set "LAB_EXIT=%ERRORLEVEL%"
pause
endlocal & exit /b %LAB_EXIT%

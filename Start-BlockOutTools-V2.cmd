@echo off
setlocal
title BlockOutTools V2 Server

cd /d "%~dp0app-v2"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm.cmd was not found on PATH.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are not installed.
  echo Run npm install once in: %CD%
  pause
  exit /b 1
)

echo Starting BlockOutTools V2 at http://127.0.0.1:4174/
call npm.cmd start
set "BLOCKOUT_EXIT_CODE=%ERRORLEVEL%"

if not "%BLOCKOUT_EXIT_CODE%"=="0" (
  echo.
  echo BlockOutTools V2 stopped with exit code %BLOCKOUT_EXIT_CODE%.
  pause
)

exit /b %BLOCKOUT_EXIT_CODE%

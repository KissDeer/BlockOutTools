@echo off
setlocal

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or newer and try again.
  goto :error
)

if not defined LAYOUT_TOOLS_HOST set "LAYOUT_TOOLS_HOST=127.0.0.1"
if not defined LAYOUT_TOOLS_PORT set "LAYOUT_TOOLS_PORT=4173"
set "LAYOUT_TOOLS_BROWSER_HOST=%LAYOUT_TOOLS_HOST%"
if "%LAYOUT_TOOLS_BROWSER_HOST%"=="0.0.0.0" set "LAYOUT_TOOLS_BROWSER_HOST=127.0.0.1"
if "%LAYOUT_TOOLS_BROWSER_HOST%"=="::" set "LAYOUT_TOOLS_BROWSER_HOST=127.0.0.1"

node.exe "%~dp0scripts\launch-layouttools.mjs" check
set "launcher_check=%ERRORLEVEL%"

if "%launcher_check%"=="0" goto :open
if "%launcher_check%"=="2" (
  echo Port %LAYOUT_TOOLS_PORT% is already used by another service.
  echo Stop that service or set LAYOUT_TOOLS_PORT to another port.
  goto :error
)
if not "%launcher_check%"=="1" goto :error

start "LayoutTools Server" /min cmd.exe /k "cd /d ""%~dp0"" && npm start"
node.exe "%~dp0scripts\launch-layouttools.mjs" wait
if errorlevel 1 goto :error

:open
start "" "http://%LAYOUT_TOOLS_BROWSER_HOST%:%LAYOUT_TOOLS_PORT%/"
exit /b 0

:error
echo.
echo LayoutTools could not be started. See the message above.
pause
exit /b 1

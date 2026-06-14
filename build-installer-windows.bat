@echo off
setlocal

echo ============================================
echo  Legwan - Windows installer build
echo ============================================
echo.

node -v > nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Download it from https://nodejs.org
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo Building Electron installer with safety checks...
call npm run electron:dist:safe
if errorlevel 1 (
  echo ERROR: installer build failed.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Success. Installer files are in release/
echo ============================================
dir release\*.exe 2>nul
pause

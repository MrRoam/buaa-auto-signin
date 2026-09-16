@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请先安装 Node.js 18 或更高版本。
  echo https://nodejs.org/
  pause
  exit /b 1
)
if not exist "%~dp0config.json" (
  node "%~dp0src\setup.mjs"
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows-background.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
echo iClass 自动签到已在后台启动。
pause

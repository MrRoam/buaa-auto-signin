@echo off
chcp 65001 >nul
setlocal
title BUAA iClass Sign-in Assistant
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-and-start-windows.ps1"
set "ICLASS_EXIT=%errorlevel%"

echo.
if not "%ICLASS_EXIT%"=="0" (
  echo Setup did not complete. Review the error above.
) else (
  echo Setup complete. The iClass assistant is running in the background.
)
echo.
pause
exit /b %ICLASS_EXIT%

@echo off
echo ===================================================================
echo Pinguin Diagnostic Tool
echo ===================================================================
echo.
echo This will collect diagnostic information to help fix the startup issue.
echo.
pause

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\collect-diagnostics.ps1" > "%USERPROFILE%\Desktop\pinguin-diagnostics.txt"

echo.
echo ===================================================================
echo Diagnostics saved to your Desktop: pinguin-diagnostics.txt
echo ===================================================================
echo.
echo Please send this file to the developer.
echo.
pause

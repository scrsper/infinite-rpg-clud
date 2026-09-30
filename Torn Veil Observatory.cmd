@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\observatory\Launch.ps1" %*
set "TV_OBSERVATORY_EXIT=%ERRORLEVEL%"
if not "%TV_OBSERVATORY_EXIT%"=="0" pause
exit /b %TV_OBSERVATORY_EXIT%

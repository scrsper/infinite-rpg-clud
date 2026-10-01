@echo off
setlocal
rem Defaults to the isolated web-quality development world, never live/staging.
rem Add -CheckOnly for a read-only check. Other explicit profiles retain the operator preflight.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\web\Play-Web.ps1" %*
set "TV_WEB_EXIT=%ERRORLEVEL%"
if not "%TV_WEB_EXIT%"=="0" pause
exit /b %TV_WEB_EXIT%

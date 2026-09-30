@echo off
setlocal
rem Separate from "Play Torn Veil.cmd" (the Unreal client). Runs a read-only preflight, then the loopback web gateway.
rem Add -CheckOnly to only check, -Profile <name> to choose a world profile, -Build to rebuild the client first.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\web\Play-Web.ps1" %*
set "TV_WEB_EXIT=%ERRORLEVEL%"
if not "%TV_WEB_EXIT%"=="0" pause
exit /b %TV_WEB_EXIT%

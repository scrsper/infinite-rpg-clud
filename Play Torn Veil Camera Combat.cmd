@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\web\Play-CameraCombat.ps1" %*
set "TV_SCENE_EXIT=%ERRORLEVEL%"
if not "%TV_SCENE_EXIT%"=="0" pause
exit /b %TV_SCENE_EXIT%

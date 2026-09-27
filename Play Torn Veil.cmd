@echo off
setlocal
if not defined TORN_VEIL_ALPHA_HOME set "TORN_VEIL_ALPHA_HOME=%USERPROFILE%\TornVeilAlpha"
set "TV_PLAY_SCRIPT=%TORN_VEIL_ALPHA_HOME%\playtests\alpha30-450b7e5\Play.ps1"
if not exist "%TV_PLAY_SCRIPT%" (
    echo The prepared Living Alpha installation was not found.
    echo See docs\RUNNING_THE_GAME.md for installation and launch details.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TV_PLAY_SCRIPT%" %*
set "TV_PLAY_EXIT=%ERRORLEVEL%"
if not "%TV_PLAY_EXIT%"=="0" pause
exit /b %TV_PLAY_EXIT%

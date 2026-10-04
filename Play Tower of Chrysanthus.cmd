@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\web\Play-Combat-Gym.ps1" -Tower %*

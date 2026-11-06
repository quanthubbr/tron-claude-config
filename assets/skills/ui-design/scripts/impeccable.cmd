@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0impeccable.ps1" %*
exit /b %errorlevel%

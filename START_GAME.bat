@echo off
cd /d "%~dp0"
start "WHITE NOISE" http://localhost:8000
py -m http.server 8000
pause

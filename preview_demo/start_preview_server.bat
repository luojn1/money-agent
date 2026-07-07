@echo off
setlocal
cd /d "%~dp0\.."
echo Starting preview demo server...
echo.
echo Open this URL in your browser:
echo http://127.0.0.1:8090/preview_demo/index.html
echo.
echo Keep this window open while previewing. Press Ctrl+C to stop.
echo.
python agents\risk_case\web_server.py --port 8090
pause

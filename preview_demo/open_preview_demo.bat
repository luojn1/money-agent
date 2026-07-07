@echo off
setlocal
cd /d "%~dp0\.."

echo Starting C Agent preview demo...
echo.
echo This window is the local web server.
echo Keep it open while using the preview page.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://127.0.0.1:8090/preview_demo/index.html"
python agents\risk_case\web_server.py --port 8090

echo.
echo Server stopped.
pause

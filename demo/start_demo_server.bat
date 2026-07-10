@echo off
setlocal

set "ROOT=%~dp0.."
cd /d "%ROOT%"

set "PYTHON_EXE="
if exist "%USERPROFILE%\anaconda3\python.exe" set "PYTHON_EXE=%USERPROFILE%\anaconda3\python.exe"
if not defined PYTHON_EXE if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not defined PYTHON_EXE if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

echo.
echo Money Agent local demo server
echo.
echo Project root:
echo   %ROOT%
echo.
echo Open this URL after the server starts:
echo   http://127.0.0.1:8091/demo/index.html
echo.
echo Keep this window open while using the page.
echo.

"%PYTHON_EXE%" demo\demo_server.py --host 127.0.0.1 --port 8091

echo.
echo Server stopped or failed to start.
echo If you see an error above, send it to Codex.
pause

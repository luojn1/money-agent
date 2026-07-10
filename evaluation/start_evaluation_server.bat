@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
set "PYTHON=C:\Users\asus\anaconda3\python.exe"

cd /d "%ROOT%"

echo.
echo [看得懂的钱] RAG/规则评测页面本地服务器
echo.
echo 访问地址：
echo   http://127.0.0.1:8080/evaluation/visualization/index.html
echo.
echo 如果 8080 被占用，请关闭占用程序后重试。
echo 这个窗口不要关闭；关闭后网页会断开。
echo.

"%PYTHON%" -m http.server 8080 --bind 127.0.0.1

echo.
echo 服务器已退出。按任意键关闭窗口。
pause >nul

@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "PORT=5178"

where node >nul 2>nul
if not errorlevel 1 goto run_node

where python >nul 2>nul
if not errorlevel 1 goto run_python

echo.
echo 未检测到 Node.js 或 Python。
echo 请安装 Node.js 18+：https://nodejs.org/
echo.
pause
exit /b 1

:run_node
echo.
echo 正在启动「指尖生花」本地服务...
echo 浏览器地址：http://127.0.0.1:%PORT%/
echo 按 Ctrl+C 可停止服务。
echo.
start "" "http://127.0.0.1:%PORT%/"
node server.mjs
goto end

:run_python
echo.
echo 未检测到 Node.js，改用 Python 启动。
echo 浏览器地址：http://127.0.0.1:%PORT%/
echo 按 Ctrl+C 可停止服务。
echo.
start "" "http://127.0.0.1:%PORT%/"
python -m http.server %PORT%
goto end

:end
endlocal

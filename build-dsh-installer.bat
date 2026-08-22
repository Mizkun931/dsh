@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
rem 构建 DeepSeek Harness Windows 安装包（含内置 pnpm，安装后用户可自行安装插件与 skill）
echo ============================================================
echo  [1/2] 全量构建 workspace（lib + web dist）...
echo ============================================================
call pnpm run build
if errorlevel 1 (
  echo [错误] workspace 构建失败
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  [2/2] 构建 Windows 安装包（nsis）...
echo ============================================================
pushd apps\desktop
call pnpm run dist:win
set "CODE=%ERRORLEVEL%"
popd
if not "%CODE%"=="0" (
  echo [错误] 安装包构建失败
  pause
  exit /b %CODE%
)

echo.
echo 完成！安装包位于：
echo   apps\desktop\dist-desktop\DeepSeek Harness Setup 0.1.0-rc.5.exe
echo 安装后可双击启动 DeepSeek Harness；插件与 skill 的用户数据在 ~/.dsh 下。
pause

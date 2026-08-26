@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
rem 打包版 launcher 需要在 checkout 之外启动时找到仓库根（启动时构建 workspace 并运行 dsh web 后端）
set "DSH_DESKTOP_REPO=%~dp0"
set "EXE=%~dp0apps\desktop\dist-desktop\win-unpacked\DeepSeek Harness.exe"
if not exist "%EXE%" (
  echo [错误] 未找到打包应用：%EXE%
  echo 请先在 apps/desktop 下运行 pnpm pack:win 重新打包。
  pause
  exit /b 1
)
start "" "%EXE%"

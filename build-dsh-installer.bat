@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
rem ============================================================
rem  DeepSeek Harness 安装包构建脚本（Windows）
rem  用法: build-dsh-installer.bat [win|all]     缺省 win
rem    win  构建 Windows 独立安装包 (.exe, NSIS)      [缺省]
rem    all  构建 Windows 安装包并提示 macOS 打包方式
rem ============================================================
rem  macOS 包无法在 Windows 上直接构建：electron-builder 26 限制
rem  macOS 目标只能在 macOS 上构建（见 https://electron.build/multi-platform-build）。
rem  请改在 macOS 上运行 ./build-dsh-installer.sh，或使用 GitHub Actions 的
rem  macos runner（.github/workflows 里配 mac 构建 job）。
rem ============================================================
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=win"

rem 读取 desktop 版本号用于输出提示
set "DSH_VERSION="
for /f "usebackq delims=" %%v in (`node -p "JSON.parse(require('fs').readFileSync('apps/desktop/package.json','utf8')).version"`) do set "DSH_VERSION=%%v"
if "%DSH_VERSION%"=="" set "DSH_VERSION=0.1.0-rc.5"

if /i "%TARGET%"=="win" goto :win
if /i "%TARGET%"=="all" goto :all
if /i "%TARGET%"=="mac" goto :machint
if /i "%TARGET%"=="mac:x64" goto :machint
if /i "%TARGET%"=="mac:dmg" goto :machint
echo [错误] 未知目标 "%TARGET%"（可选: win / all）
pause
exit /b 1

:win
echo ============================================================
echo  构建 Windows 安装包（全量构建 + NSIS 独立 exe）...
echo ============================================================
call pnpm desktop:dist
if errorlevel 1 goto :fail
echo.
echo 完成！Windows 独立安装包位于：
echo   apps\desktop\dist-desktop\DeepSeek Harness Setup %DSH_VERSION%.exe
echo 安装后可双击启动 DeepSeek Harness；插件与 skill 的用户数据在 ~/.dsh 下。
pause
exit /b 0

:all
echo ============================================================
echo  构建 Windows 安装包...
echo ============================================================
call pnpm desktop:dist
if errorlevel 1 goto :fail
echo.
echo 完成！Windows 独立安装包位于：
echo   apps\desktop\dist-desktop\DeepSeek Harness Setup %DSH_VERSION%.exe
echo.
echo ============================================================
echo  macOS 包：electron-builder 26 不允许在 Windows 上交叉构建 macOS。
echo  请在 macOS 上运行  ./build-dsh-installer.sh [dmg^|zip^|all]
echo  或使用 GitHub Actions 的 macos runner（配置见 .github/workflows）。
echo ============================================================
pause
exit /b 0

:machint
echo.
echo [提示] macOS 包无法在 Windows 上直接构建：
echo   electron-builder 26 只允许在 macOS 上构建 macOS 目标
echo   （https://electron.build/multi-platform-build）。
echo.
echo   请选择以下方式之一：
echo    1. 在 macOS 上运行  ./build-dsh-installer.sh [dmg^|zip^|all]
echo    2. 使用 GitHub Actions macos runner 自动构建（需在仓库配置 workflow）
echo.
pause
exit /b 0

:fail
echo [错误] 打包失败，请检查上方日志。
pause
exit /b 1

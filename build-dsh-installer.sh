#!/usr/bin/env bash
# ============================================================
#  DeepSeek Harness 安装包构建脚本（macOS 原生）
#  在 macOS 上运行；要求 PATH 上有 pnpm 与 node。
#  用法: ./build-dsh-installer.sh [dmg|zip|all]    缺省 all
#    dmg  构建 .dmg 磁盘映像（含 arm64 内置 pnpm）
#    zip  构建 .zip 安装包（arm64，内置 pnpm）
#    all  依次构建 zip + dmg
#  输出目录: apps/desktop/dist-desktop/
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

command -v pnpm >/dev/null 2>&1 || { echo '[错误] 未找到 pnpm，请先安装 (npm i -g pnpm)' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo '[错误] 未找到 node' >&2; exit 1; }

TARGET="${1:-all}"
case "$TARGET" in
  dmg) pnpm desktop:dist:mac:dmg ;;
  zip) pnpm desktop:dist:mac ;;
  all)
    pnpm desktop:dist:mac
    pnpm desktop:dist:mac:dmg
    ;;
  *)
    echo "[错误] 未知目标 \"$TARGET\"（可选: dmg / zip / all）" >&2
    exit 1
    ;;
esac

echo
echo '完成！安装包位于 apps/desktop/dist-desktop/：'
ls -lh apps/desktop/dist-desktop/*.dmg apps/desktop/dist-desktop/*-mac.zip 2>/dev/null || true

# @deepseek-ai/dsh-desktop

[English](README.md) | 中文

这是基于已发布 Web profile 的 Electron 桌面启动器参考。该包会先显示全屏 DeepSeek Harness 开屏窗口，然后使用 `web --host 127.0.0.1 --port 0` 启动已构建的 `@deepseek-ai/dsh` CLI，等待 `dsh web:` URL 行，再在沙箱化 Electron 窗口中打开这个 loopback URL。

两种启动模式共享同一套开屏到窗口的流程：

- **开发模式**（在 checkout 内）：workspace artifacts 会在开屏窗口背后于后台编译，后端使用 `PATH` 上的 `node` 运行。
- **打包模式**（Windows 安装包或 macOS app）：启动时不编译任何内容。打包的 `node_modules` 已携带构建好的 CLI、bundle 与 web dist；后端直接运行在 Electron 自带运行时（`ELECTRON_RUN_AS_NODE`）上，工作目录为用户主目录，因此已安装的 app 不需要 checkout，也不需要 `PATH` 上有 Node 或 pnpm。内置的 pnpm 二进制（Windows 为 `resources/pnpm/pnpm.exe`，macOS 为 `resources/pnpm/pnpm`）通过 `DSH_PNPM` 导出，使 `dsh plugin` 无需全局安装 pnpm 即可继续管理 profile 插件。

启动器复用 [`@deepseek-ai/dsh-web-app`](../../packages/bundle/web-app/README.zh.md) 持有的浏览器应用和 host 图，不定义第二套前端组合，也不定义独立 API 桥。

## 用户数据与插件、skill 安装

所有用户数据都位于 harness home（`~/.dsh`，可用 `DSH_HOME` 覆盖）之下，绝不写入安装目录：

- 插件通过 `dsh plugin --profile web add <package>` 按 profile 安装（安装包内置 pnpm，无需单独安装 pnpm）。profile 目录 `~/.dsh/profiles/web` 维护自己的 `package.json` 与 `node_modules`。
- skill 会自动从 `~/.dsh/skills/<name>/SKILL.md` 与 `~/.agents/skills/<name>/SKILL.md` 发现；把 skill 目录放进去并重启即可加载。

## Commands

在仓库根目录运行：

```sh
pnpm desktop:dev
pnpm desktop:pack
pnpm desktop:dist
```

`desktop:dev` 会构建 Electron shell 并启动 Electron；workspace Web 和 CLI artifacts 会在 app 打开后于开屏窗口背后编译。开屏使用参考图中的 DeepSeek 图标与字标，追加液态玻璃底的 `Harness` 标记，并保留由启动进度事件驱动的进度条。`desktop:pack` 会在 `apps/desktop/dist-desktop/` 下写入未打包安装器的 Windows 构建。`desktop:dist` 会写入此包配置的 Windows NSIS 安装器（独立 `.exe`）。

macOS 安装包用同一套流水线构建，但只能在 macOS 上执行：electron-builder 26 拒绝在非 macOS 主机上构建 macOS 目标（见 [multi-platform-build](https://electron.build/multi-platform-build)）。请在 macOS 机器（或 macOS CI runner）上运行：

```sh
pnpm desktop:dist:mac        # arm64 zip (Apple Silicon, bundles pnpm)
pnpm desktop:dist:mac:x64    # x64 zip (no bundled pnpm — Intel macs have no standalone pnpm binary)
pnpm desktop:dist:mac:dmg    # dmg image (macOS host only)
```

各主机有一键脚本：Windows 用 `build-dsh-installer.bat [win|all]`，macOS 用 `build-dsh-installer.sh [dmg|zip|all]`。copy-pnpm 脚本支持 `--platform`/`--arch` 参数，用于在 macOS/Linux 主机上为其他操作系统准备跨平台内置 pnpm。

当打包后的 app 不在 checkout 内启动，并且启动器无法从当前进程位置发现仓库根目录时，设置 `DSH_DESKTOP_REPO`。当 `node` 不在 `PATH` 中时，设置 `DSH_DESKTOP_NODE`；当启动期 build 需要指定 `pnpm` 命令时，设置 `DSH_DESKTOP_PNPM`。

## Model Experience

无。该包只启动 Web profile 并渲染 Electron 壳；模型可见上下文仍由 `@deepseek-ai/dsh-web-app` 持有。

## Known Limitations

- 开发模式仍会在启动时编译 workspace，且需要 `PATH` 上有 `pnpm` 与 `node`；打包安装器没有这两项要求。
- 独立 pnpm 二进制不发布 Intel macOS（darwin-x64，上游 Node SEA 缺陷），因此 x64 mac 包不内置 pnpm，会回退到用户 `PATH` 上的 pnpm。
- Electron 窗口加载 loopback Web server。后续原生桌面 host 可以替换为 file-loaded renderer 与 IPC transport，而不改变浏览器插件 roster。

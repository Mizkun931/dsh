# Agent Note: Electron desktop launcher

Status: implemented

[English](2026-08-14-electron-desktop-launcher.md) | 中文

## Problem

DeepSeek Harness 已经有由 `dsh web` 支撑的浏览器 GUI，但桌面启动路径需要应用窗口、Web host 就绪前就能出现的启动状态，以及随窗口生命周期关闭后端进程的位置。在 Web profile 拥有原生桌面 transport 之前，为 Electron 重新构筑 GUI 组合会复制浏览器 roster 和 API transport。

## Decision

`apps/desktop` 是一个 Electron workspace package，用于启动既有 Web profile。它的 main process 会先打开 splash window，再通过 `DSH_DESKTOP_PNPM` 或 `pnpm` 在后台运行 `pnpm --dir <repo> run build` 编译 workspace artifacts，然后通过 `DSH_DESKTOP_NODE` 或 `node` 使用 `web --host 127.0.0.1 --port 0` 启动已构建的 `@deepseek-ai/dsh` CLI，等待 `dsh web:` readiness URL，并把这个 loopback URL 载入沙箱化 `BrowserWindow`。Electron renderer 使用 `nodeIntegration: false`、`contextIsolation: true` 和 `sandbox: true`；外部导航会交给操作系统浏览器，而不是获得 Node 能力。

桌面包持有 `apps/desktop/assets/splash.html` 中的无边框 splash window。该 splash 只显示 DeepSeek logo、`DeepSeek` 字标、`探索未至之境` 标语和一条进度条。进度条宽度由 main process 从启动期 build 与 Web-host readiness 阶段解析出的进度事件驱动，因此前台启动动画会和后台工作保持一致。`packages/client/web/src/AppRoot.tsx` 中的 Web shell loading page 使用相同的 logo-led loading language，用于主窗口载入后插件加载的间隔。

后端进程会在 `before-quit` 期间停止。在 Windows 上，launcher 使用 `taskkill.exe /pid <pid> /t /f`，避免 Web host 下的子进程在 app 关闭后继续占用端口。Electron Builder 保持 app unpacked，并跳过 Electron-native dependency rebuilds，因为后端依赖在 Node 子进程内运行，而不是在 Electron renderer 内运行。

## Alternatives considered

**通过 `file://` 加载 `apps/web/dist`，并用 IPC 桥接 API 调用。** 本次拒绝。Web profile 已经持有基于 HTTP 的 boot manifest 注入、API routes、module delivery 和 browser trust fence。file-loaded renderer 需要新的 IPC transport 和 boot-manifest carrier 才能匹配当前行为。

**在 Electron main process 内运行 Web profile。** 拒绝。既有 CLI boot 持有 process-level shutdown、environment loading 和 profile composition。进程内 import 并运行会把桌面生命周期耦合到 CLI 内部模块，并使 Web boot 失败更难隔离。

**要求固定端口，例如 3080。** 拒绝。`--port 0` 避免与既有浏览器 Web session 冲突，打印出的 URL 仍是权威 readiness signal。

## Consequences

桌面 app 复用已发布的 Web application 和 backend graph，因此继承 Web profile 的行为和测试覆盖，而不是创建第二套组合。该包可以作为 Electron app 开发和打包，同时不改变 agent packages 或 session protocols。

launcher 仍依赖 source checkout、`pnpm`、Node 可执行文件和 `dsh web` HTTP transport。它是桌面 packaging layer，不是原生 Electron transport。后续当 file-loaded renderer 与 IPC bridge 存在时，可以替换 spawned Web host。

## Verification

桌面包为 readiness URL parsing、repository-root detection、backend executable selection 和 build-progress output parsing 提供单元覆盖。Web shell 保留 AppRoot boot-gate 测试；桌面手工验证使用 `pnpm desktop:dev` 确认 splash startup、启动期 build progress、Web URL readiness、主窗口加载以及 quit 时的 backend shutdown。

# @deepseek-ai/dsh-desktop

[English](README.md) | 中文

这是基于已发布 Web profile 的 Electron 桌面启动器参考。该包使用 `web --host 127.0.0.1 --port 0` 启动已构建的 `@deepseek-ai/dsh` CLI，等待 `dsh web:` URL 行，然后在沙箱化 Electron 窗口中打开这个 loopback URL。本地 Web host 到达自身就绪信号前，桌面端会显示一个无边框的 DeepSeek logo 开屏窗口。

启动器复用 [`@deepseek-ai/dsh-web-app`](../../packages/bundle/web-app/README.md) 持有的浏览器应用和 host 图，不定义第二套前端组合，也不定义独立 API 桥。

## Commands

在仓库根目录运行：

```sh
pnpm desktop:dev
pnpm desktop:pack
pnpm desktop:dist
```

`desktop:dev` 会构建工作区并启动 Electron。`desktop:pack` 会在 `apps/desktop/dist-desktop/` 下写入未打包安装器的 Windows 构建。`desktop:dist` 会写入此包配置的 Windows 安装器目标。

当打包后的 app 不在 checkout 内启动，并且启动器无法从当前进程位置发现仓库根目录时，设置 `DSH_DESKTOP_REPO`。当 `node` 不在 `PATH` 中时，设置 `DSH_DESKTOP_NODE`。

## Model Experience

无。该包只启动 Web profile 并渲染 Electron 壳；模型可见上下文仍由 `@deepseek-ai/dsh-web-app` 持有。

## Known Limitations

- 桌面启动器依赖仓库中已构建的 Web 和 CLI 产物以及 Node 可执行文件，因为后端仍是既有 `dsh web` 进程。
- Electron 窗口加载 loopback Web server。后续原生桌面 host 可以替换为 file-loaded renderer 与 IPC transport，而不改变浏览器插件 roster。

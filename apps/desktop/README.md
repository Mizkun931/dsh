# @deepseek-ai/dsh-desktop

English | [中文](README.zh.md)

Reference for the Electron desktop launcher over the shipped Web profile. The package starts the built `@deepseek-ai/dsh` CLI with `web --host 127.0.0.1 --port 0`, waits for the `dsh web:` URL line, then opens that loopback URL in a sandboxed Electron window. A frameless splash window displays the DeepSeek logo while the local Web host reaches its own readiness signal.

The launcher reuses the browser application and host graph owned by [`@deepseek-ai/dsh-web-app`](../../packages/bundle/web-app/README.md); it does not define a second frontend composition or a separate API bridge.

## Commands

Run from the repository root:

```sh
pnpm desktop:dev
pnpm desktop:pack
pnpm desktop:dist
```

`desktop:dev` builds the workspace and starts Electron. `desktop:pack` writes an unpacked Windows build under `apps/desktop/dist-desktop/`. `desktop:dist` writes the Windows installer targets configured in this package.

Set `DSH_DESKTOP_REPO` when launching a packaged app outside the checkout and the launcher cannot discover the repository root from its current process location. Set `DSH_DESKTOP_NODE` when `node` is not on `PATH`.

## Model Experience

None. This package only starts the Web profile and renders an Electron shell; model-visible context remains owned by `@deepseek-ai/dsh-web-app`.

## Known Limitations

- The desktop launcher depends on the repository's built Web and CLI artifacts and a Node executable because the backend is still the existing `dsh web` process.
- The Electron window loads the loopback Web server. A future native desktop host can replace this with a file-loaded renderer plus IPC transport without changing the browser plugin roster.

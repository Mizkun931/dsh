# @deepseek-ai/dsh-desktop

English | [中文](README.zh.md)

Reference for the Electron desktop launcher over the shipped Web profile. The package displays a full-screen frameless DeepSeek Harness splash window first, compiles the workspace artifacts in the background with splash progress updates, starts the built `@deepseek-ai/dsh` CLI with `web --host 127.0.0.1 --port 0`, waits for the `dsh web:` URL line, then opens that loopback URL in a sandboxed Electron window.

The launcher reuses the browser application and host graph owned by [`@deepseek-ai/dsh-web-app`](../../packages/bundle/web-app/README.md); it does not define a second frontend composition or a separate API bridge.

## Commands

Run from the repository root:

```sh
pnpm desktop:dev
pnpm desktop:pack
pnpm desktop:dist
```

`desktop:dev` builds the Electron shell and starts Electron; the workspace Web and CLI artifacts are compiled behind the splash window after the app opens. The splash uses the reference DeepSeek icon and wordmark with a liquid-glass `Harness` badge, plus a progress bar driven by startup progress events. `desktop:pack` writes an unpacked Windows build under `apps/desktop/dist-desktop/`. `desktop:dist` writes the Windows installer targets configured in this package.

Set `DSH_DESKTOP_REPO` when launching a packaged app outside the checkout and the launcher cannot discover the repository root from its current process location. Set `DSH_DESKTOP_NODE` when `node` is not on `PATH`, and set `DSH_DESKTOP_PNPM` when launch-time builds need a specific `pnpm` command.

## Model Experience

None. This package only starts the Web profile and renders an Electron shell; model-visible context remains owned by `@deepseek-ai/dsh-web-app`.

## Known Limitations

- The desktop launcher depends on a source checkout, `pnpm`, and a Node executable because the backend is still compiled at launch and then run as the existing `dsh web` process.
- The Electron window loads the loopback Web server. A future native desktop host can replace this with a file-loaded renderer plus IPC transport without changing the browser plugin roster.

# Agent Note: Electron desktop launcher

Status: implemented

English | [中文](2026-08-14-electron-desktop-launcher.zh.md)

## Problem

DeepSeek Harness already has a browser GUI backed by `dsh web`, but a desktop launch path needs an application window, a startup state that appears before the Web host is ready, and one place to shut down the backend process with the window lifecycle. Rebuilding the GUI composition for Electron would duplicate the browser roster and the API transport before the Web profile has a native desktop transport.

## Decision

`apps/desktop` is an Electron workspace package that launches the existing Web profile. Its main process starts the built `@deepseek-ai/dsh` CLI with `web --host 127.0.0.1 --port 0` through `DSH_DESKTOP_NODE` or `node`, waits for the `dsh web:` readiness URL, and loads that loopback URL into a sandboxed `BrowserWindow`. The Electron renderer has `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`; external navigations leave through the operating system browser instead of receiving Node capabilities.

The desktop package owns a frameless splash window in `apps/desktop/assets/splash.html`. The splash displays the DeepSeek logo and a bounded progress animation while the local Web host binds and settles. The Web shell loading page in `packages/client/web/src/AppRoot.tsx` uses the same logo-led loading language for the plugin-loading interval after the main window loads.

The backend process is stopped during `before-quit`. On Windows the launcher uses `taskkill.exe /pid <pid> /t /f` so child processes under the Web host do not keep the port alive after the app closes. Electron Builder keeps the app unpacked and skips Electron-native dependency rebuilds because the backend dependencies run under the Node subprocess, not inside the Electron renderer.

## Alternatives considered

**Load `apps/web/dist` over `file://` and bridge API calls over IPC.** Rejected for this change. The Web profile already owns boot manifest injection, API routes, module delivery, and the browser trust fence over HTTP. A file-loaded renderer needs a new IPC transport and boot-manifest carrier before it can match current behavior.

**Run the Web profile in the Electron main process.** Rejected. The existing CLI boot owns process-level shutdown, environment loading, and profile composition. Importing and running it in-process would couple desktop lifecycle to internal CLI modules and make a failed Web boot harder to isolate.

**Require a fixed port such as 3080.** Rejected. `--port 0` avoids conflicts with an existing browser Web session, and the printed URL remains the authoritative readiness signal.

## Consequences

The desktop app reuses the shipped Web application and backend graph, so it inherits the Web profile's behavior and test coverage instead of creating a second composition. The package can be developed and packaged as an Electron app without changing agent packages or session protocols.

The launcher still depends on built workspace artifacts, a Node executable, and the `dsh web` HTTP transport. It is a desktop packaging layer, not a native Electron transport. A future file-loaded renderer plus IPC bridge can replace the spawned Web host when that transport exists.

## Verification

The desktop package has unit coverage for readiness URL parsing, repository-root detection, and backend Node executable selection. The Web shell keeps its AppRoot boot-gate tests, and desktop manual verification uses `pnpm desktop:dev` to confirm splash startup, Web URL readiness, main-window loading, and backend shutdown on quit.

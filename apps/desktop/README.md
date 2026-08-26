# @deepseek-ai/dsh-desktop

English | [中文](README.zh.md)

Reference for the Electron desktop launcher over the shipped Web profile. The package displays a full-screen DeepSeek Harness splash window first, starts the built `@deepseek-ai/dsh` CLI with `web --host 127.0.0.1 --port 0`, waits for the `dsh web:` URL line, then opens that loopback URL in a sandboxed Electron window.

Two launch modes share the same splash-to-window flow:

- **Development** (from a checkout): the workspace artifacts are compiled in the background behind the splash, then the backend runs on the `node` from `PATH`.
- **Packaged** (the Windows installer or the macOS app): nothing is compiled at launch. The packaged `node_modules` already carries the built CLI, bundles, and web dist; the backend runs on the Electron runtime itself (`ELECTRON_RUN_AS_NODE`) with the user's home as the working directory, so an installed app needs no checkout, no Node, and no pnpm on `PATH`. The bundled pnpm binary (`resources/pnpm/pnpm.exe` on Windows, `resources/pnpm/pnpm` on macOS) is exported as `DSH_PNPM` so `dsh plugin` keeps managing profile plugins without a global install.

The launcher reuses the browser application and host graph owned by [`@deepseek-ai/dsh-web-app`](../../packages/bundle/web-app/README.md); it does not define a second frontend composition or a separate API bridge.

## User data and installing plugins and skills

All user data lives under the harness home (`~/.dsh`, overridable with `DSH_HOME`), never inside the installation directory:

- Plugins install per profile with `dsh plugin --profile web add <package>` (the installer ships a bundled pnpm, so no separate pnpm install is needed). The profile directory `~/.dsh/profiles/web` keeps its own `package.json` and `node_modules`.
- Skills are discovered automatically from `~/.dsh/skills/<name>/SKILL.md` and `~/.agents/skills/<name>/SKILL.md`; drop a skill directory there and restart to load it.

## Commands

Run from the repository root:

```sh
pnpm desktop:dev
pnpm desktop:pack
pnpm desktop:dist
```

`desktop:dev` builds the Electron shell and starts Electron; the workspace Web and CLI artifacts are compiled behind the splash window after the app opens. The splash uses the reference DeepSeek icon and wordmark with a liquid-glass `Harness` badge, plus a progress bar driven by startup progress events. `desktop:pack` writes an unpacked Windows build under `apps/desktop/dist-desktop/`. `desktop:dist` writes the Windows NSIS installer (a standalone `.exe`) configured in this package.

macOS packages are built with the same pipeline, but only on macOS: electron-builder 26 refuses macOS targets on non-macOS hosts (see [multi-platform-build](https://electron.build/multi-platform-build)). Run on a macOS machine (or a macOS CI runner):

```sh
pnpm desktop:dist:mac        # arm64 zip (Apple Silicon, bundles pnpm)
pnpm desktop:dist:mac:x64    # x64 zip (no bundled pnpm — Intel macs have no standalone pnpm binary)
pnpm desktop:dist:mac:dmg    # dmg image (macOS host only)
```

There is a one-shot script per host: `build-dsh-installer.bat [win|all]` on Windows and `build-dsh-installer.sh [dmg|zip|all]` on macOS. The copy-pnpm script accepts `--platform`/`--arch` to prepare a cross-platform bundled pnpm (used when packaging for another OS on a macOS/Linux host).

Set `DSH_DESKTOP_REPO` when launching a packaged app outside the checkout and the launcher cannot discover the repository root from its current process location. Set `DSH_DESKTOP_NODE` when `node` is not on `PATH`, and set `DSH_DESKTOP_PNPM` when launch-time builds need a specific `pnpm` command.

## Model Experience

None. This package only starts the Web profile and renders an Electron shell; model-visible context remains owned by `@deepseek-ai/dsh-web-app`.

## Known Limitations

- Development mode still compiles the workspace at launch and needs `pnpm` and `node` on `PATH`; the packaged installer has neither requirement.
- The standalone pnpm binary is not published for Intel macOS (darwin-x64, upstream Node SEA bug), so the x64 mac package ships without a bundled pnpm and falls back to a pnpm on the user's `PATH`.
- The Electron window loads the loopback Web server. A future native desktop host can replace this with a file-loaded renderer plus IPC transport without changing the browser plugin roster.

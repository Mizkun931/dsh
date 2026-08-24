/**
 * Desktop host launcher for the Web profile.
 * @module @deepseek-ai/dsh-desktop/launcher
 */

import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const READY_URL_PATTERN = /(?:^|\r?\n)dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)(?=\s|\(|$)/
/** Env var overriding the startup ready deadline (ms). `0` disables the deadline. */
export const READY_TIMEOUT_ENV = 'DSH_DESKTOP_READY_TIMEOUT_MS'
/**
 * Compile-time default ready deadline. Plugin-rich workspaces load more client
 * bundles at boot, so a short default kills the splash mid-startup; 300s leaves
 * headroom while still failing loud on a genuinely wedged backend.
 */
const DEFAULT_READY_TIMEOUT_MS = 300_000

/** User-data file recording the last free Web port, so the desktop reuses one origin. */
const WEB_PORT_FILE = '.web-port'

/** Path of the persisted Web-port file under the DSH user-data directory. */
function webPortFile(): string {
  return join(homedir(), '.dsh', WEB_PORT_FILE)
}

/**
 * Read the port of the last successful Web boot. Reusing it keeps the desktop
 * app on one `http://127.0.0.1:<port>` origin across restarts, so browser
 * storage (localStorage) — the home of client plugin settings and UI state —
 * survives instead of resetting because each launch landed on a fresh random
 * port (and therefore a fresh origin).
 * @returns the persisted port, or undefined when none is recorded.
 */
function readPersistedWebPort(): number | undefined {
  try {
    const port = Number(readFileSync(webPortFile(), 'utf8').trim())
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined
  } catch {
    return undefined
  }
}

/**
 * Record the port the Web profile actually bound, so the next launch reuses
 * that origin. A non-URL or port-less value is ignored.
 * @param url - the ready URL printed by `dsh web`.
 */
function persistWebPort(url: string): void {
  try {
    const port = Number(new URL(url).port)
    if (Number.isInteger(port) && port > 0) {
      writeFileSync(webPortFile(), String(port), { encoding: 'utf8' })
    }
  } catch {
    /* url is not a parseable absolute URL — nothing to persist */
  }
}

/**
 * Resolve the startup ready deadline from the environment. `DSH_DESKTOP_READY_TIMEOUT_MS`
 * overrides the compile-time default; the literal `0` (or any non-positive / non-finite
 * value) disables the deadline entirely so the splash waits as long as the backend needs.
 * @param env - candidate environment.
 * @returns the deadline in ms, or `undefined` when the deadline is disabled.
 */
export function resolveReadyTimeoutMs(env: NodeJS.ProcessEnv): number | undefined {
  const raw = env[READY_TIMEOUT_ENV]
  if (raw === undefined || raw === '') return DEFAULT_READY_TIMEOUT_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.floor(parsed)
}

/** Env var overriding whether the dev relaunch skips the full workspace build when artifacts are ready. */
export const FORCE_BUILD_ENV = 'DSH_DESKTOP_FORCE_BUILD'
/** Workspace-relative artifacts whose presence means the Web profile can boot without a full build. */
const WEB_READY_MARKERS: readonly string[] = [
  join('apps', 'web', 'dist', 'index.html'),
  join('apps', 'cli', 'lib', 'bin.js'),
  join('packages', 'client', 'web', 'lib', 'index.js'),
]
/**
 * Whether the workspace already carries the artifacts a local Web profile boots
 * from, so the dev relaunch can skip the full `pnpm run build`.
 * @param repoRoot - repository root.
 * @returns true when every ready marker exists.
 */
export function workspaceBuildReady(repoRoot: string): boolean {
  return WEB_READY_MARKERS.every(marker => existsSync(join(repoRoot, marker)))
}
/**
 * Whether to skip the full workspace build on a dev relaunch. When the build
 * artifacts are ready AND the caller did not force a rebuild, skip — a manual
 * dev relaunch then boots in seconds. Set `DSH_DESKTOP_FORCE_BUILD=1` to force
 * the full build (e.g. after changing a build-influencing source).
 * @param env - candidate environment.
 * @param repoRoot - repository root.
 * @returns true to skip the build.
 */
export function shouldSkipWorkspaceBuild(env: NodeJS.ProcessEnv, repoRoot: string): boolean {
  const force = env[FORCE_BUILD_ENV]
  if (force !== undefined && force !== '' && force !== '0') return false
  return workspaceBuildReady(repoRoot)
}

const TAIL_LIMIT = 8_000
const REQUIRED_REPO_MARKERS = ['package.json', 'pnpm-lock.yaml', join('apps', 'cli', 'package.json')] as const
/** The dsh CLI manifest inside a packaged app's node_modules (relative to the app root). */
const PACKAGED_DEP_MARKER = join('node_modules', '@deepseek-ai', 'dsh', 'package.json')
const BUILD_START_PROGRESS = 3
const BUILD_DONE_PROGRESS = 86
const SERVER_START_PROGRESS = 92
/**
 * Server URL printed — the client-side boot still runs after this point,
 * so the splash must not read 100% yet; the window layer completes it
 * once the web shell reports its boot settle (see waitForMainAppReady).
 */
export const READY_PROGRESS = 96

/** One build-output milestone the splash progress bar waits for. */
interface BuildProgressMarker {
  /** Output signature (script banner, tool banner, or completion line). */
  pattern: RegExp
  /** Progress percent reported once the pattern has matched enough times. */
  percent: number
  /** Required match count; defaults to 1 (tsdown prints its banner once per build face). */
  occurrences?: number
}

/**
 * Build milestones, in the order the workspace build emits them. Script
 * markers match only the npm script banner (`> pkg@version script`): the
 * command echo line (`> npm run build:lib && npm run build:web`) prints at
 * startup and would otherwise mark every script as started immediately.
 */
const BUILD_PROGRESS_MARKERS: readonly BuildProgressMarker[] = [
  { pattern: /^>\s*\S+@\d\S*\s+build:lib\b/gmu, percent: 14 },
  { pattern: /^>\s*\S+@\d\S*\s+build:lib:host\b/gmu, percent: 24 },
  { pattern: /tsdown v\d/gu, percent: 36 },
  { pattern: /^>\s*\S+@\d\S*\s+build:lib:client\b/gmu, percent: 46 },
  { pattern: /tsdown v\d/gu, percent: 58, occurrences: 2 },
  { pattern: /^>\s*\S+@\d\S*\s+build:web\b/gmu, percent: 70 },
  { pattern: /\bbuilt in\b/gu, percent: 80 },
]

/** Build milestones in ascending percent order (deduplicated). */
const BUILD_MILESTONES = [...new Set(BUILD_PROGRESS_MARKERS.map(marker => marker.percent))].sort((a, b) => a - b)

/** Exponential approach time constant for silent-phase estimation (ms). */
const ESTIMATE_TAU_MS = 4_000

/** A launched Web profile process and its ready browser URL. */
export interface HarnessWebServer {
  /** The canonical loopback URL printed by the Web profile after Loader settlement. */
  url: string
  /** The child process running `dsh web`. */
  process: ChildProcess
}

/** Startup phase reported to the desktop splash progress bar. */
export type HarnessStartupPhase = 'build' | 'server' | 'ready'

/** Progress update for the Electron splash window. */
export interface HarnessStartupProgress {
  /** Coarse lifecycle phase currently running in the background. */
  phase: HarnessStartupPhase
  /** Monotonic startup percentage in the inclusive range 0..100. */
  percent: number
}

/** Callback receiving background startup progress. */
export type HarnessStartupProgressSink = (progress: HarnessStartupProgress) => void

/** Options for compiling the workspace before the local Web profile starts. */
export interface HarnessBuildOptions {
  /** Repository root containing the dsh workspace. Defaults to auto-detection. */
  repoRoot?: string
  /** Startup progress callback. */
  onProgress?: HarnessStartupProgressSink
}

/** Options for starting the local Web profile from Electron. */
export interface StartHarnessWebServerOptions {
  /** Repository root containing the dsh workspace. Defaults to auto-detection. */
  repoRoot?: string
  /**
   * Whether this is a packaged install. Defaults to file-system detection:
   * a packaged app materializes the dsh CLI under node_modules while the
   * workspace layout symlinks it.
   */
  packaged?: boolean
  /** Startup timeout. Defaults to 60 seconds. */
  timeoutMs?: number
  /** Startup progress callback. */
  onProgress?: HarnessStartupProgressSink
}

/** Parse the ready URL from accumulated `dsh web` stdout. */
export function parseReadyUrl(output: string): string | undefined {
  const match = READY_URL_PATTERN.exec(output)
  return match?.[1]
}

/**
 * Infer the workspace-build percentage from the accumulated pnpm/npm output.
 * @param output - accumulated build output so far.
 * @returns the highest milestone percent whose pattern has matched, or undefined.
 */
export function progressForBuildOutput(output: string): number | undefined {
  let progress: number | undefined
  for (const marker of BUILD_PROGRESS_MARKERS) {
    if (markerReached(marker, output)) progress = Math.max(progress ?? 0, marker.percent)
  }
  return progress
}

function markerReached(marker: BuildProgressMarker, output: string): boolean {
  return (output.match(marker.pattern) ?? []).length >= (marker.occurrences ?? 1)
}

function progressStepsForBuildOutput(output: string): number[] {
  const steps: number[] = []
  for (const marker of BUILD_PROGRESS_MARKERS) {
    if (markerReached(marker, output)) steps.push(marker.percent)
  }
  return steps
}

/**
 * Estimated progress during a phase with no real progress events: an
 * exponential approach from the last real milestone toward the next one,
 * so the bar keeps creeping forward without ever reaching the next
 * milestone. Real events realign it instantly.
 * @param base - percent of the last real milestone.
 * @param next - percent of the next real milestone.
 * @param elapsedMs - time since the last real progress event.
 * @returns the estimated percent, strictly between base and next.
 */
export function estimateProgress(base: number, next: number, elapsedMs: number): number {
  const gap = next - base
  return next - 0.1 - (gap - 0.1) * Math.exp(-elapsedMs / ESTIMATE_TAU_MS)
}

/** Return whether a directory has the repo files the desktop launcher needs. */
export function isHarnessRepoRoot(path: string): boolean {
  return REQUIRED_REPO_MARKERS.every(marker => existsSync(join(path, marker)))
}

/**
 * Whether `appRoot` is an installed app rather than a checkout. The packaged
 * electron-builder layout materializes the dsh CLI package as a real
 * directory under `node_modules/@deepseek-ai/dsh`, while the pnpm workspace
 * layout used for development symlinks it to the checkout — so the link kind
 * is the distinguishing signal.
 * @param appRoot - the directory holding the desktop app's `package.json`.
 * @returns true when the app is a packaged install.
 */
export function isPackagedInstall(appRoot: string): boolean {
  const dshManifest = join(appRoot, PACKAGED_DEP_MARKER)
  if (!existsSync(dshManifest)) return false
  try {
    return !lstatSync(dirname(dshManifest)).isSymbolicLink()
  } catch {
    return true
  }
}

/**
 * Resolve the workspace root for the launched backend.
 * @param startDir - directory of the compiled desktop app.
 * @param env - process environment; `DSH_DESKTOP_REPO` overrides discovery.
 * @returns absolute repository root.
 */
export function resolveHarnessRepoRoot(startDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const envRoot = env.DSH_DESKTOP_REPO
  if (envRoot !== undefined && envRoot !== '') {
    const resolved = resolve(envRoot)
    if (isHarnessRepoRoot(resolved)) return resolved
    throw new Error(`DSH_DESKTOP_REPO does not point to a DeepSeek Harness checkout: ${resolved}`)
  }

  const candidates = [
    process.cwd(),
    resolve(startDir, '..', '..', '..'),
    resolve(startDir, '..', '..'),
  ]
  for (const candidate of candidates) {
    const resolved = resolve(candidate)
    if (isHarnessRepoRoot(resolved)) return resolved
  }
  throw new Error('DeepSeek Harness checkout not found. Set DSH_DESKTOP_REPO to the repository root.')
}

/** Resolve the built dsh CLI bin shipped by the workspace dependency graph. */
export function resolveDshBin(): string {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
  return join(dirname(manifestPath), 'lib', 'bin.js')
}

/** Resolve the Node executable used for the backend subprocess. */
export function resolveNodeExecutable(env: NodeJS.ProcessEnv = process.env): string {
  return env.DSH_DESKTOP_NODE === undefined || env.DSH_DESKTOP_NODE === '' ? 'node' : env.DSH_DESKTOP_NODE
}

/**
 * Resolve the pnpm executable used for launch-time workspace builds. The
 * packaged launcher sets `DSH_PNPM` to the pnpm binary shipped inside the
 * app, so a user machine never needs pnpm on PATH to manage plugins; an
 * explicit `DSH_DESKTOP_PNPM` still outranks it for development.
 */
export function resolvePnpmExecutable(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DSH_PNPM !== undefined && env.DSH_PNPM !== '') return env.DSH_PNPM
  return env.DSH_DESKTOP_PNPM === undefined || env.DSH_DESKTOP_PNPM === '' ? 'pnpm' : env.DSH_DESKTOP_PNPM
}

function appendTail(current: string, chunk: string): string {
  const next = current + chunk
  return next.length > TAIL_LIMIT ? next.slice(next.length - TAIL_LIMIT) : next
}

function startupFailure(reason: string, stdout: string, stderr: string): Error {
  const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
  return new Error(detail === '' ? reason : `${reason}\n${detail}`)
}

function emitProgress(onProgress: HarnessStartupProgressSink | undefined, phase: HarnessStartupPhase, percent: number): void {
  onProgress?.({ phase, percent })
}

function validateWindowsCommand(command: string): void {
  if (/["\r\n&|<>^%]/u.test(command)) {
    throw new Error('Cannot launch pnpm because the Windows command contains unsupported shell metacharacters.')
  }
}

function spawnPnpm(args: readonly string[], options: SpawnOptions): ChildProcess {
  const command = resolvePnpmExecutable()
  if (process.platform !== 'win32') return spawn(command, args, options)
  validateWindowsCommand(command)
  return spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], options)
}

function resolveLaunchRepoRoot(repoRoot: string | undefined): string {
  const startDir = dirname(fileURLToPath(import.meta.url))
  return repoRoot ?? resolveHarnessRepoRoot(startDir)
}

/** Compile the workspace artifacts required by the local Web profile. */
export function runHarnessBuild(options: HarnessBuildOptions = {}): Promise<void> {
  const repoRoot = resolveLaunchRepoRoot(options.repoRoot)
  const onProgress = options.onProgress
  let child: ChildProcess
  try {
    child = spawnPnpm(['--dir', repoRoot, 'run', 'build'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }

  let settled = false
  let stdout = ''
  let stderr = ''
  let lastProgress = BUILD_START_PROGRESS
  let lastProgressAt = Date.now()

  emitProgress(onProgress, 'build', lastProgress)

  // Silent phases (tsc, tsdown, vite) emit no progress lines; estimate
  // forward between milestones so the bar keeps moving. Real events
  // realign it instantly.
  const estimateTicker = setInterval(() => {
    const next = BUILD_MILESTONES.find(milestone => milestone > lastProgress) ?? BUILD_DONE_PROGRESS
    emitProgress(onProgress, 'build', estimateProgress(lastProgress, next, Date.now() - lastProgressAt))
  }, 300)

  return new Promise<void>((resolvePromise, rejectPromise) => {
    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      clearInterval(estimateTicker)
      if (!child.killed && child.exitCode === null) child.kill()
      rejectPromise(error)
    }
    const resolveOnce = (): void => {
      if (settled) return
      settled = true
      clearInterval(estimateTicker)
      emitProgress(onProgress, 'build', BUILD_DONE_PROGRESS)
      resolvePromise()
    }
    const recordOutput = (stream: 'stdout' | 'stderr', chunk: string): void => {
      if (stream === 'stdout') {
        stdout = appendTail(stdout, chunk)
      } else {
        stderr = appendTail(stderr, chunk)
      }
      for (const progress of progressStepsForBuildOutput(`${stdout}\n${stderr}`)) {
        if (progress > lastProgress) {
          lastProgress = progress
          lastProgressAt = Date.now()
          emitProgress(onProgress, 'build', progress)
        }
      }
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      recordOutput('stdout', chunk)
    })
    child.stderr?.on('data', (chunk: string) => {
      recordOutput('stderr', chunk)
    })
    child.once('error', (error) => {
      rejectOnce(startupFailure(`Failed to build DeepSeek Harness: ${error.message}`, stdout, stderr))
    })
    child.once('exit', (code, signal) => {
      if (settled) return
      if (code === 0) {
        resolveOnce()
        return
      }
      const exit = signal === null ? `exit code ${String(code)}` : `signal ${signal}`
      rejectOnce(startupFailure(`DeepSeek Harness build failed (${exit}).`, stdout, stderr))
    })
  })
}

/**
 * The packaged backend launch: run the dsh CLI on the Electron runtime
 * itself (`ELECTRON_RUN_AS_NODE` turns the app binary into a plain Node
 * process) with the user's home as the workspace, so an installed app needs
 * neither a checkout nor a Node on PATH. The working directory seeds the
 * sandbox workspace root and the project skill roots; the home is the one
 * directory every user can write to without elevation.
 * @param appRoot - the packaged app directory.
 * @returns the backend command, working directory, and environment.
 */
function packagedBackendLaunch(appRoot: string): { command: string; cwd: string; env: NodeJS.ProcessEnv } {
  const pnpm = packagedPnpmPath(appRoot)
  return {
    command: process.execPath,
    cwd: homedir(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...pnpm !== undefined && { DSH_PNPM: pnpm },
    },
  }
}

/** Outcome of reclaiming the task-board ledger lock before boot. */
export type LedgerReclaimResult = 'absent' | 'cleared' | 'killed' | 'failed'

/**
 * Take over the task-board ledger lock (`~/.dsh/task-board/ledger-v2.lock`)
 * held by a previous Web profile instance. A leftover browser/dev instance
 * keeps this single-instance lock, so the desktop backend would fail its
 * plugin tree boot with "task-board ledger is already owned by process N";
 * the lock file also survives a killed owner as a stale PID. Terminate a live
 * owner and remove the lock either way, so the desktop launch never depends
 * on another instance's lifecycle.
 * @param lockPath - ledger lock path; defaults to the user data location.
 * @returns what was done to the lock.
 */
export function reclaimTaskBoardLedger(lockPath = join(homedir(), '.dsh', 'task-board', 'ledger-v2.lock')): LedgerReclaimResult {
  try {
    if (!existsSync(lockPath)) return 'absent'
    const { pid } = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid?: unknown }
    if (typeof pid !== 'number') return 'failed'
    let alive = true
    try {
      process.kill(pid, 0)
    } catch {
      alive = false
    }
    if (alive) {
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      } else {
        try { process.kill(pid) } catch { /* already exiting */ }
      }
    }
    rmSync(lockPath, { force: true })
    return alive ? 'killed' : 'cleared'
  } catch {
    return 'failed'
  }
}

/** The pnpm binary shipped inside a packaged app, when present. */
function packagedPnpmPath(appRoot: string): string | undefined {
  const pnpm = join(dirname(appRoot), 'pnpm', 'pnpm.exe')
  return existsSync(pnpm) ? pnpm : undefined
}

/** Build, start `dsh web` on a persisted Web port (random on first run, then reused), and resolve after it prints the ready URL. */
export async function startHarnessWebServer(options: StartHarnessWebServerOptions = {}): Promise<HarnessWebServer> {
  const libDir = dirname(fileURLToPath(import.meta.url))
  const appRoot = dirname(libDir)
  const packaged = options.packaged ?? isPackagedInstall(appRoot)
  // options.timeoutMs wins; otherwise the env-var resolveReadyTimeoutMs (0 disables the deadline).
  const timeoutMs = options.timeoutMs ?? resolveReadyTimeoutMs(process.env)

  let backend: { command: string; cwd: string; env: NodeJS.ProcessEnv }
  if (packaged) {
    // No launch-time build: the packaged node_modules already carries the
    // built CLI, bundles, and web dist. The progress jumps straight to the
    // server phase.
    emitProgress(options.onProgress, 'server', SERVER_START_PROGRESS)
    backend = packagedBackendLaunch(appRoot)
  } else {
    const repoRoot = resolveLaunchRepoRoot(options.repoRoot)
    const buildOptions: HarnessBuildOptions = { repoRoot }
    if (options.onProgress !== undefined) buildOptions.onProgress = options.onProgress
    // Artifacts already present (and the caller did not force a rebuild): skip
    // the full workspace build so a manual dev relaunch boots in seconds. This
    // trusts the existing build; change it with `pnpm run build` or a dev:web
    // watcher, or set DSH_DESKTOP_FORCE_BUILD=1 to rebuild on next launch.
    if (shouldSkipWorkspaceBuild(process.env, repoRoot)) {
      emitProgress(options.onProgress, 'server', SERVER_START_PROGRESS)
    } else {
      await runHarnessBuild(buildOptions)
      emitProgress(options.onProgress, 'server', SERVER_START_PROGRESS)
    }
    backend = { command: resolveNodeExecutable(), cwd: repoRoot, env: process.env }
  }

  // A previous Web profile instance (browser/dev/other desktop launch) keeps
  // the task-board single-instance lock; take it over so this backend's
  // plugin tree can boot regardless of that instance's lifecycle.
  reclaimTaskBoardLedger()

  // The profile boot mounts a watch-only HMR instance for live user patches,
  // which requires the internal module loader; the flag must sit in execArgv
  // (NODE_OPTIONS is not guaranteed to land there on every runtime).
  // --no-open: dsh web opens the default browser by default; the desktop app
  // renders the page itself, so the backend must not pop a browser tab.
  // Reuse the last Web port so the desktop stays on one origin across
  // restarts (browser storage is origin-scoped; a fresh random port would
  // reset every client-persisted setting). Fall back to a random port only
  // when none is recorded.
  const persistedPort = readPersistedWebPort()
  const portArg = persistedPort === undefined ? '0' : String(persistedPort)
  const child = spawn(backend.command, ['--expose-internals', resolveDshBin(), 'web', '--host', '127.0.0.1', '--port', portArg, '--no-open'], {
    cwd: backend.cwd,
    env: {
      ...backend.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let settled = false
  let stdout = ''
  let stderr = ''
  // dsh web prints nothing until its URL; estimate forward while waiting.
  const serverStartedAt = Date.now()
  const estimateTicker = setInterval(() => {
    emitProgress(options.onProgress, 'server', estimateProgress(SERVER_START_PROGRESS, READY_PROGRESS, Date.now() - serverStartedAt))
  }, 300)

  return new Promise<HarnessWebServer>((resolvePromise, rejectPromise) => {
    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      clearInterval(estimateTicker)
      clearTimeout(timeout)
      // The persisted port is now suspect (e.g. claimed by another process);
      // drop it so the next launch picks a fresh port instead of wedging here.
      if (persistedPort !== undefined) rmSync(webPortFile(), { force: true })
      stopHarnessWebServer({ url: '', process: child })
      rejectPromise(error)
    }
    const resolveOnce = (url: string): void => {
      if (settled) return
      settled = true
      clearInterval(estimateTicker)
      clearTimeout(timeout)
      persistWebPort(url)
      resolvePromise({ url, process: child })
    }

    // timeoutMs === undefined (env 0) disables the deadline: the splash waits
    // as long as the backend needs. clearTimeout(undefined) is a no-op.
    const timeout = timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
        rejectOnce(startupFailure(`Timed out waiting ${String(timeoutMs)}ms for dsh web to print its URL.`, stdout, stderr))
      }, timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout = appendTail(stdout, chunk)
      const url = parseReadyUrl(stdout)
      if (url !== undefined) {
        emitProgress(options.onProgress, 'ready', READY_PROGRESS)
        resolveOnce(url)
      }
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr = appendTail(stderr, chunk)
    })
    child.once('error', (error) => {
      rejectOnce(startupFailure(`Failed to start dsh web: ${error.message}`, stdout, stderr))
    })
    child.once('exit', (code, signal) => {
      if (settled) return
      const exit = signal === null ? `exit code ${String(code)}` : `signal ${signal}`
      rejectOnce(startupFailure(`dsh web exited before printing its URL (${exit}).`, stdout, stderr))
    })
  })
}

/** Stop the child Web profile process, including its Windows child tree. */
export function stopHarnessWebServer(server: HarnessWebServer | undefined): void {
  if (server === undefined || server.process.killed || server.process.exitCode !== null) return
  const pid = server.process.pid
  if (process.platform === 'win32' && pid !== undefined) {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.once('error', () => { server.process.kill() })
    return
  }
  server.process.kill()
}

/**
 * Desktop host launcher for the Web profile.
 * @module @deepseek-ai/dsh-desktop/launcher
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const READY_URL_PATTERN = /(?:^|\r?\n)dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)(?=\s|\(|$)/
const DEFAULT_READY_TIMEOUT_MS = 60_000
const TAIL_LIMIT = 8_000
const REQUIRED_REPO_MARKERS = ['package.json', 'pnpm-lock.yaml', join('apps', 'cli', 'package.json')] as const

/** A launched Web profile process and its ready browser URL. */
export interface HarnessWebServer {
  /** The canonical loopback URL printed by the Web profile after Loader settlement. */
  url: string
  /** The child process running `dsh web`. */
  process: ChildProcess
}

/** Options for starting the local Web profile from Electron. */
export interface StartHarnessWebServerOptions {
  /** Repository root containing the dsh workspace. Defaults to auto-detection. */
  repoRoot?: string
  /** Startup timeout. Defaults to 60 seconds. */
  timeoutMs?: number
}

/** Parse the ready URL from accumulated `dsh web` stdout. */
export function parseReadyUrl(output: string): string | undefined {
  const match = READY_URL_PATTERN.exec(output)
  return match?.[1]
}

/** Return whether a directory has the repo files the desktop launcher needs. */
export function isHarnessRepoRoot(path: string): boolean {
  return REQUIRED_REPO_MARKERS.every(marker => existsSync(join(path, marker)))
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

function appendTail(current: string, chunk: string): string {
  const next = current + chunk
  return next.length > TAIL_LIMIT ? next.slice(next.length - TAIL_LIMIT) : next
}

function startupFailure(reason: string, stdout: string, stderr: string): Error {
  const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
  return new Error(detail === '' ? reason : `${reason}\n${detail}`)
}

/** Start `dsh web --port 0` and resolve after it prints the ready URL. */
export function startHarnessWebServer(options: StartHarnessWebServerOptions = {}): Promise<HarnessWebServer> {
  const startDir = dirname(fileURLToPath(import.meta.url))
  const repoRoot = options.repoRoot ?? resolveHarnessRepoRoot(startDir)
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  const child = spawn(resolveNodeExecutable(), [resolveDshBin(), 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let settled = false
  let stdout = ''
  let stderr = ''

  return new Promise<HarnessWebServer>((resolvePromise, rejectPromise) => {
    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      stopHarnessWebServer({ url: '', process: child })
      rejectPromise(error)
    }
    const resolveOnce = (url: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolvePromise({ url, process: child })
    }

    const timeout = setTimeout(() => {
      rejectOnce(startupFailure(`Timed out waiting ${String(timeoutMs)}ms for dsh web to print its URL.`, stdout, stderr))
    }, timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout = appendTail(stdout, chunk)
      const url = parseReadyUrl(stdout)
      if (url !== undefined) resolveOnce(url)
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

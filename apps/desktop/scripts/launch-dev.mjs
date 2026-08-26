/**
 * Dev launcher for the Electron app.
 *
 * ELECTRON_RUN_AS_NODE is the packaged backend's flag for running the app
 * binary as a plain Node process (see launcher.ts packagedBackendLaunch). If
 * it leaks into the shell environment (e.g. after debugging a packaged build),
 * `electron .` boots in pure Node mode and crashes with "the requested module
 * 'electron' does not provide an export named 'BrowserWindow'". Clear it here
 * so dev startup never inherits the packaged flag.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

delete process.env.ELECTRON_RUN_AS_NODE
const require = createRequire(import.meta.url)
// The electron package's default export is the executable path.
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env: process.env })
child.on('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

/**
 * Copy the bundled pnpm executable into build/pnpm as a real file, so
 * electron-builder can ship it as extraResources without carrying the
 * store-backed hardlink from the pnpm workspace layout.
 * @module @deepseek-ai/dsh-desktop/copy-pnpm
 */

import { cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The standalone pnpm binary is a Node SEA executable: at runtime it loads
// dist/pnpm.mjs and its vendor tree relative to the exe, so the whole
// @pnpm/exe package must ship, not just the exe. The copy is real files
// (cpSync dereferences the pnpm workspace link), so electron-builder ships
// a self-contained pnpm.
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(appRoot, 'node_modules', '@pnpm', 'exe')
const dest = join(appRoot, 'build', 'pnpm')

rmSync(dest, { recursive: true, force: true })
// dereference: ship real files, not the workspace/`.bin` links (Windows symlink creation is unprivileged here)
cpSync(source, dest, { recursive: true, dereference: true })
console.log(`copied ${source} -> ${dest}`)

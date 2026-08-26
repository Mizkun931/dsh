/**
 * Copy the bundled pnpm executable into build/pnpm as a real file, so
 * electron-builder can ship it as extraResources without carrying the
 * store-backed hardlink from the pnpm workspace layout.
 *
 * The standalone pnpm binary is a Node SEA executable: at runtime it loads
 * dist/pnpm.mjs and its vendor tree relative to the exe, so the whole
 * @pnpm/exe package must ship, not just the exe. The copy is real files
 * (cpSync dereferences the pnpm workspace link), so electron-builder ships
 * a self-contained pnpm.
 *
 * The binary itself is platform-specific: @pnpm/exe's preinstall hardlinks
 * the binary for the installing OS. Cross-packaging (e.g. building the macOS
 * app from a Windows host) must substitute the target platform's binary from
 * its published platform package (@pnpm/macos-arm64, @pnpm/win-x64, ...).
 * Intel macOS (darwin-x64) ships no working standalone binary upstream (Node
 * SEA injection corrupts x64 Mach-O — see pnpm#11423), so a cross build for
 * it warns and skips the bundled pnpm; the packaged launcher then falls back
 * to a pnpm on the user's PATH.
 *
 * Usage: node scripts/copy-pnpm.mjs [--platform <win32|darwin|linux>] [--arch <x64|arm64>]
 * Defaults to the current host platform/arch.
 * @module @deepseek-ai/dsh-desktop/copy-pnpm
 */

import { copyFileSync, cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Published @pnpm/exe platform packages, keyed by target platform-arch. */
const PLATFORM_PACKAGES = {
  'win32-x64': '@pnpm/win-x64',
  'win32-arm64': '@pnpm/win-arm64',
  'darwin-arm64': '@pnpm/macos-arm64',
  'linux-x64': '@pnpm/linux-x64',
  'linux-arm64': '@pnpm/linux-arm64',
}

/** Parse --platform/--arch from argv; defaults to the host values. */
function parseTarget(args) {
  let platform = process.platform
  let arch = process.arch
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform') platform = args[++i] ?? platform
    else if (args[i] === '--arch') arch = args[++i] ?? arch
  }
  return { platform, arch }
}

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const exeSource = join(appRoot, 'node_modules', '@pnpm', 'exe')
const dest = join(appRoot, 'build', 'pnpm')

const { platform, arch } = parseTarget(process.argv.slice(2))
const target = `${platform}-${arch}`
const host = `${process.platform}-${process.arch}`

// Remove any previous target's copy first; a stale build/pnpm from another
// platform would otherwise be shipped in the current package.
rmSync(dest, { recursive: true, force: true })

// Host build: @pnpm/exe's preinstall already linked the binary for this OS.
if (target === host) {
  cpSync(exeSource, dest, { recursive: true, dereference: true })
  console.log(`copied ${exeSource} -> ${dest} (${target})`)
  process.exit(0)
}

// Cross build: substitute the target platform's binary.
const pkgName = PLATFORM_PACKAGES[target]
if (pkgName === undefined) {
  console.warn(
    `[warn] @pnpm/exe ships no standalone binary for ${target}; skipping the bundled pnpm. ` +
    'The packaged app will fall back to a pnpm on the user PATH (DSH_PNPM unset).',
  )
  process.exit(0)
}

const binName = platform === 'win32' ? 'pnpm.exe' : 'pnpm'
const platformBin = join(appRoot, 'node_modules', pkgName, binName)
if (!existsSync(platformBin)) {
  throw new Error(`platform binary not found: ${platformBin} (install ${pkgName} as a devDependency)`)
}

// Start from the full @pnpm/exe package (dist/pnpm.mjs + vendor tree + metadata).
cpSync(exeSource, dest, { recursive: true, dereference: true })

// Drop the host platform's binaries first so the target binary copied below
// is not removed again (pnpm without extension is the shared SEA name).
const HOST_BINS = {
  win32: ['pnpm.exe', 'pn.exe', 'pnpx.exe', 'pnx.exe'],
  darwin: ['pnpm'],
  linux: ['pnpm'],
}
for (const bin of HOST_BINS[process.platform] ?? []) {
  rmSync(join(dest, bin), { force: true })
}

// Then substitute the target platform's binary.
copyFileSync(platformBin, join(dest, binName))

if (platform === 'win32') {
  // Windows aliases are .exe hardlinks of the SEA binary; recreate from the target binary.
  for (const alias of ['pn', 'pnpx', 'pnx']) {
    copyFileSync(join(dest, binName), join(dest, `${alias}.exe`))
  }
}
console.log(`copied ${platformBin} -> ${dest} (cross ${host} -> ${target})`)

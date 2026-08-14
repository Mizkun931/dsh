import { describe, expect, it } from 'vitest'
import { lstatSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  estimateProgress,
  isHarnessRepoRoot,
  isPackagedInstall,
  parseReadyUrl,
  progressForBuildOutput,
  resolveHarnessRepoRoot,
  resolveNodeExecutable,
  resolvePnpmExecutable,
} from '../src/launcher.ts'

describe('desktop launcher helpers', () => {
  it('parses the dsh web readiness URL from stdout', () => {
    expect(parseReadyUrl('booting\ndsh web: http://127.0.0.1:49210\n')).toBe('http://127.0.0.1:49210')
    expect(parseReadyUrl('dsh web: http://127.0.0.1:49210 (LAN: http://10.0.0.2:49210)'))
      .toBe('http://127.0.0.1:49210')
    expect(parseReadyUrl('waiting')).toBeUndefined()
  })

  it('accepts only directories with the workspace markers', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-root-'))
    try {
      expect(isHarnessRepoRoot(root)).toBe(false)
      mkdirSync(join(root, 'apps', 'cli'), { recursive: true })
      writeFileSync(join(root, 'package.json'), '{}')
      writeFileSync(join(root, 'pnpm-lock.yaml'), '')
      writeFileSync(join(root, 'apps', 'cli', 'package.json'), '{}')
      expect(isHarnessRepoRoot(root)).toBe(true)
      expect(resolveHarnessRepoRoot('C:\\missing', { DSH_DESKTOP_REPO: root })).toBe(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('allows the backend Node executable to be configured', () => {
    expect(resolveNodeExecutable({})).toBe('node')
    expect(resolveNodeExecutable({ DSH_DESKTOP_NODE: 'C:\\Tools\\node.exe' })).toBe('C:\\Tools\\node.exe')
  })

  it('allows the launch-time pnpm executable to be configured', () => {
    expect(resolvePnpmExecutable({})).toBe('pnpm')
    expect(resolvePnpmExecutable({ DSH_DESKTOP_PNPM: 'C:\\Tools\\pnpm.cmd' })).toBe('C:\\Tools\\pnpm.cmd')
    expect(resolvePnpmExecutable({ DSH_PNPM: 'D:\\App\\resources\\pnpm\\pnpm.exe' })).toBe('D:\\App\\resources\\pnpm\\pnpm.exe')
    expect(resolvePnpmExecutable({ DSH_PNPM: 'D:\\App\\resources\\pnpm\\pnpm.exe', DSH_DESKTOP_PNPM: 'pnpm.cmd' })).toBe('D:\\App\\resources\\pnpm\\pnpm.exe')
  })

  it('detects packaged installs by the dsh CLI link kind', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-pkg-'))
    try {
      // A packaged app materializes the dsh CLI as a real directory.
      const packaged = join(root, 'packaged')
      mkdirSync(join(packaged, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
      writeFileSync(join(packaged, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), '{}')
      expect(lstatSync(join(packaged, 'node_modules', '@deepseek-ai', 'dsh')).isSymbolicLink()).toBe(false)
      expect(isPackagedInstall(packaged)).toBe(true)

      // A checkout holds the dsh CLI as a workspace symlink: not packaged.
      const checkout = join(root, 'checkout')
      mkdirSync(join(checkout, 'node_modules', '@deepseek-ai'), { recursive: true })
      symlinkSync(join(packaged, 'node_modules', '@deepseek-ai', 'dsh'), join(checkout, 'node_modules', '@deepseek-ai', 'dsh'), 'junction')
      expect(lstatSync(join(checkout, 'node_modules', '@deepseek-ai', 'dsh')).isSymbolicLink()).toBe(true)
      expect(isPackagedInstall(checkout)).toBe(false)

      // No dsh manifest at all: not packaged.
      expect(isPackagedInstall(join(root, 'empty'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers build progress from workspace script output at every milestone', () => {
    expect(progressForBuildOutput('waiting')).toBeUndefined()
    expect(progressForBuildOutput('> @deepseek-ai/dsh-root@0.1.0-rc.5 build:lib')).toBe(14)
    expect(progressForBuildOutput('> @deepseek-ai/dsh-root@0.1.0-rc.5 build:lib:host')).toBe(24)
    expect(progressForBuildOutput('ℹ tsdown v0.22.2 powered by rolldown v1.1.1')).toBe(36)
    expect(progressForBuildOutput('> @deepseek-ai/dsh-root@0.1.0-rc.5 build:lib:client')).toBe(46)
    expect(progressForBuildOutput([
      'ℹ tsdown v0.22.2 powered by rolldown v1.1.1',
      'ℹ tsdown v0.22.2 powered by rolldown v1.1.1',
    ].join('\n'))).toBe(58)
    expect(progressForBuildOutput([
      '> @deepseek-ai/dsh-root@0.1.0-rc.5 build:web',
      '> pnpm --filter @deepseek-ai/dsh-web-frontend run build',
    ].join('\n'))).toBe(70)
    expect(progressForBuildOutput('✓ built in 2.31s')).toBe(80)
  })

  it('ignores npm/pnpm command echo lines that name scripts before they run', () => {
    expect(progressForBuildOutput('> npm run build:lib && npm run build:web')).toBeUndefined()
    expect(progressForBuildOutput('$ npm run build:lib && npm run build:web')).toBeUndefined()
    expect(progressForBuildOutput('> tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host')).toBeUndefined()
  })

  it('estimates silent-phase progress as an approach to the next milestone', () => {
    expect(estimateProgress(24, 36, 0)).toBe(24)
    expect(estimateProgress(24, 36, 4_000)).toBeGreaterThan(24)
    expect(estimateProgress(24, 36, 4_000)).toBeLessThan(35.9)
    expect(estimateProgress(24, 36, 60_000)).toBeGreaterThan(35.5)
    expect(estimateProgress(24, 36, 60_000)).toBeLessThan(35.9)
  })
})

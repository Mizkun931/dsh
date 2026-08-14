import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  estimateProgressGain,
  isHarnessRepoRoot,
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
    expect(progressForBuildOutput('build:lib\nbuild:web')).toBe(70)
    expect(progressForBuildOutput('✓ built in 2.31s')).toBe(80)
  })

  it('estimates silent-phase progress gain capped below the next milestone', () => {
    expect(estimateProgressGain(0)).toBe(0)
    expect(estimateProgressGain(350)).toBeCloseTo(1)
    expect(estimateProgressGain(3_500)).toBeCloseTo(9.9)
    expect(estimateProgressGain(60_000)).toBeCloseTo(9.9)
  })
})

import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isHarnessRepoRoot, parseReadyUrl, resolveHarnessRepoRoot, resolveNodeExecutable } from '../src/launcher.ts'

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
})

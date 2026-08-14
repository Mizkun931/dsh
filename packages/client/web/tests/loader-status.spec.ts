// @vitest-environment jsdom
/**
 * Boot-state publisher spec: pins the data-dsh-boot handoff contract on
 * <html> that the desktop launcher polls to gate its window switch. The
 * remaining kernel signal/store factories are exercised through the
 * AppRoot gate spec.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { publishBootState } from '@deepseek-ai/dsh-client-web/src/loader-status.ts'

afterEach(() => {
  delete document.documentElement.dataset.dshBoot
})

describe('publishBootState', () => {
  it('publishes each boot state on the html element dataset', () => {
    publishBootState('loading')
    expect(document.documentElement.dataset.dshBoot).toBe('loading')
    publishBootState('ready')
    expect(document.documentElement.dataset.dshBoot).toBe('ready')
    publishBootState('failed')
    expect(document.documentElement.dataset.dshBoot).toBe('failed')
  })
})

/** Label for each fiber state, keyed by member (inlining-safe — no reverse mapping). */
export const STATE_LABELS: Record<FiberState, LoaderEntryState> = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: 'disposed',
  [FIBER_STATE.UNLOADING]: 'unloading',
}

/** Boot lifecycle states published on <html> for window hosts. */
export type BootState = 'loading' | 'ready' | 'failed'

/**
 * Publish the kernel boot state as data-dsh-boot on <html>. The desktop
 * launcher polls this machine-readable signal to gate its window handoff
 * instead of guessing from page text.
 * @param state - the current boot lifecycle state.
 */
export function publishBootState(state: BootState): void {
  document.documentElement.dataset.dshBoot = state
}

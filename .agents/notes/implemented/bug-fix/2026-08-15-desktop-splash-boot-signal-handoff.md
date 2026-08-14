# Agent Note: Desktop splash hands the window off on a published boot signal, and its shimmer sweeps only the filled region

Status: implemented

English | [中文](2026-08-15-desktop-splash-boot-signal-handoff.zh.md)

## Problem

The desktop launcher showed two splash animations back to back. The framed fullscreen splash window (the real one, driven by actual build/server progress) closed and revealed the main window, which still rendered the web shell's own boot page — the superseded animation — before flipping to the real UI one frame later. The handoff condition was the cause: `waitForMainAppReady` guessed boot completion from page text (`document.body.innerText` containing `Loading plugins…`), and the launcher already reported 100% progress the moment `dsh web` printed its URL — while the client-side boot (bundle fetch + cordis Loader settle) was only starting. Progress read complete while the superseded animation still had to play, so the switch landed on it.

The splash progress bar had a second, separate defect. The shimmer was a sibling of the fill inside the track, and its sweep animation translated the element across the whole track regardless of `progress-fill` width, so the sweep crossed unfilled track at every fill level.

## Decision

The web shell kernel publishes an authoritative boot state instead of leaving the launcher to match copy. `publishBootState` in [loader-status.ts](../../../packages/client/web/src/loader-status.ts) writes `data-dsh-boot` (`loading` / `ready` / `failed`) on `<html>`; [boot.tsx](../../../packages/client/web/src/boot.tsx) publishes `loading` when `run()` starts, `ready` after the settle, and `failed` in the fail-loud catch.

`waitForMainAppReady` in [main.ts](../../../apps/desktop/src/main.ts) polls that dataset signal (50 ms cadence, 30 s timeout; a `failed` state raises the boot failure with the page text as detail). The text-matching guesses and the 260 ms stability window are gone — the signal is terminal, so stability adds nothing.

Splash progress no longer tops out before the handoff. `READY_PROGRESS` in [launcher.ts](../../../apps/desktop/src/launcher.ts) drops from 100 to 96 when the server URL is printed, and `bootDesktop` sets the final 100 only after `waitForMainAppReady` resolves, immediately before `mainWindow.show()`. 100% and the visible switch now coincide.

The shimmer in [splash.html](../../../apps/desktop/assets/splash.html) moves inside `.progress-fill`, which gains `overflow: hidden`. The sweep still runs `translateX(-120%) → 320%`, but the fill clips it, so the sweep travels only across the filled region at every fill level; the script's width/toggle contract is unchanged.

## Alternatives considered

**Keep the innerText match and only fix the timing.** The text guess already covered the common cases, so a narrower change was tempting. Rejected: the match is fragile by construction — it breaks when the loading copy changes, localizes, or appears inside real session content — and it cannot distinguish the loading page from a ready UI except through that copy.

**Poll a DOM signature of the real UI (e.g. a stable selector) instead of a kernel signal.** It would avoid touching the shell kernel. Rejected: a selector is another guess, owned by whichever UI package renders it, while the boot kernel already owns the only authoritative fact — the settle.

**Keep the shimmer as a track-level element and animate its width with the fill.** That is what an earlier revision did (`progressShimmer.style.width = percent%` with an inner sweep). Rejected: it couples the script to two elements and duplicates the fill's geometry; nesting inside the fill gets the clipping for free from CSS.

**Remove the web shell boot page entirely.** The loading page is still the fail-loud surface for browser users who open `dsh web` directly and for boot failures, so it stays; the desktop fix is to never reveal it, not to delete it.

## Consequences

The desktop launch now shows exactly one splash animation: the window hands off when the web shell is settled, so the main window appears on the real UI. The superseded boot page can still flash for a direct browser visitor, which is its intended job there.

The boot-state signal is a new cross-surface contract: desktop and web shell must ship together. A desktop build polling the signal against a web shell that predates it sees no dataset value and falls through to the 30 s timeout — a degraded but safe path, not a failure. The README of `dsh-client-web` documents the signal.

Splash progress now dwells at 96% during the client boot and jumps to 100% at the switch; the fill transition smooths the jump. Build output markers resolve to seven finer milestones (14/24/36/46/58/70/80), and silent phases — tsc, tsdown, vite, the quiet server boot, and the client boot — estimate forward at 350 ms per percent, capped just below the next real milestone: the bar keeps moving through every quiet stretch and real events realign it instantly.

## Testing

`packages/client/web/tests/loader-status.spec.ts` pins the dataset contract for all three states. `packages/client/web/tests/app-root.client.spec.tsx` keeps pinning the AppRoot gate, and `apps/desktop/tests/launcher.spec.ts` keeps pinning the launcher helpers; the Electron window handoff itself remains manual-verification territory (no GUI harness runs Electron).

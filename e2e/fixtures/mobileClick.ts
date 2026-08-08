import type { Locator, TestInfo } from "@playwright/test";

/**
 * Click a Locator, bypassing Playwright's actionability "receives pointer
 * events" hit-test on touch-emulated projects only (#753's mobile project).
 *
 * Investigation for #753 found that on a `hasTouch: true` (Pixel 7 device
 * emulation) project, Playwright's built-in hit-test check falsely reports
 * some buttons near this app's sticky bottom nav (`src/routes/_auth.tsx`) as
 * intercepted by the nav, even though:
 *   - `document.elementFromPoint` at the exact same coordinates resolves to
 *     the correct target every time,
 *   - a real `page.mouse.click()` / `{ force: true }` click at those
 *     coordinates lands on the correct element, fires the expected DOM
 *     events (pointerdown/mousedown/click), and successfully triggers the
 *     app's mutation and navigation.
 * The false intercept reproduces consistently with `hasTouch: true` and is
 * unaffected by pre-scrolling or extra settle time before the click, so it
 * looks like a Chromium/Playwright touch-emulation + `position: sticky`
 * hit-test quirk rather than a real occlusion bug in the app. `force` is
 * scoped to touch projects only so the desktop project keeps the full
 * actionability safety net (a genuine desktop occlusion regression would
 * still fail there).
 */
export const clickBypassingTouchHitTestQuirk = async (locator: Locator, testInfo: TestInfo) => {
  await locator.click({ force: Boolean(testInfo.project.use.hasTouch) });
};

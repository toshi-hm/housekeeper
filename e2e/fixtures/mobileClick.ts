import type { Locator, TestInfo } from "@playwright/test";

/**
 * Click a Locator on touch-emulated projects (#753's `mobile-chromium`)
 * using our own reachability check instead of Playwright's built-in
 * actionability "receives pointer events" hit-test, which we found to be
 * unreliable there. On non-touch projects this is a plain `.click()`.
 *
 * Investigation for #753 found two compounding issues on a `hasTouch: true`
 * (Pixel 7 device emulation) project only — never on the desktop project:
 *
 * 1. Playwright's `locator.boundingBox()` (which its actionability engine
 *    also relies on internally) can return a stale/offset box — observed
 *    ~20px off from the element's *actual* live `getBoundingClientRect()`
 *    queried in-page at essentially the same instant, with the on-screen
 *    position otherwise static (no real layout shift). That stale box is
 *    enough to make the hit-test probe sample a point that's just outside
 *    the real element (landing on whatever sits above it instead), which
 *    Playwright then reports as "element intercepts pointer events" —
 *    even though the element is genuinely reachable at its real position.
 * 2. Once reachability is checked from the correct, live position, the
 *    actual click still needs `force: true` to bypass Playwright's own
 *    (similarly affected) probe — plain `.click()` keeps retrying against
 *    the stale box and times out, while `.click({ force: true })` reliably
 *    lands on and activates the right element and completes the app's
 *    mutation/navigation.
 *
 * So rather than blindly `force: true` past every check (which would also
 * swallow a *real* future occlusion regression — the exact thing this mobile
 * project exists to catch, e.g. the bottom nav genuinely covering a form's
 * submit button), this does its own reachability check using
 * `getBoundingClientRect()` + `document.elementFromPoint`, both computed
 * in-page inside a single `locator.evaluate()` call so they can't disagree
 * with each other the way Playwright's separately-queried `boundingBox()`
 * did. It samples the target's center plus its four corners (inset a few px
 * to dodge rounded corners) and asserts each point's hit-test result is the
 * target element itself (or a descendant, e.g. an inner `<span>`). Only once
 * that passes does it force-click.
 */
export const clickBypassingTouchHitTestQuirk = async (locator: Locator, testInfo: TestInfo) => {
  if (!testInfo.project.use.hasTouch) {
    await locator.click();
    return;
  }

  await locator.scrollIntoViewIfNeeded();

  const allReachable = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const inset = Math.min(4, rect.width / 4, rect.height / 4);
    const points: Array<[number, number]> = [
      [rect.x + rect.width / 2, rect.y + rect.height / 2], // center
      [rect.x + inset, rect.y + inset], // top-left
      [rect.x + rect.width - inset, rect.y + inset], // top-right
      [rect.x + inset, rect.y + rect.height - inset], // bottom-left
      [rect.x + rect.width - inset, rect.y + rect.height - inset], // bottom-right
    ];
    return points.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === node || node.contains(hit));
    });
  });

  if (!allReachable) {
    throw new Error(
      "clickBypassingTouchHitTestQuirk: target is genuinely covered by another element " +
        "at one or more sample points (real occlusion, not the known Playwright touch " +
        "hit-test quirk) — refusing to force-click.",
    );
  }

  await locator.click({ force: true });
};

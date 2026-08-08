import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Runs axe-core against the *currently rendered, routed* page and asserts no
 * violations, for use at real interaction checkpoints in e2e specs (an open
 * dialog, a focus-trapped modal, etc.) rather than isolated Storybook
 * snapshots (#754).
 *
 * This complements, not replaces, `.github/workflows/_a11y.yml`'s
 * `@storybook/test-runner` + `axe-playwright` sweep of `.stories.tsx` files:
 * that check can't see real routing, real user-triggered dialog opens, or
 * focus-trap state, all of which axe-core still can't verify by itself
 * (focus order / keyboard-trap *correctness* and screen-reader announcement
 * quality remain manual-walkthrough territory, see
 * docs/specs/accessibility.md's Known gaps), but it does catch the
 * static-DOM subset (contrast, missing/invalid aria attributes, roles,
 * labels) against the actual DOM the user would see at that moment, which a
 * component-only story render can miss (e.g. dialogs portalled/positioned
 * relative to real page content, or state only reachable via a real user
 * flow).
 *
 * `scope` narrows the scan to a specific element (e.g. `[role="dialog"]`)
 * when only that region is the point of interest, avoiding flagging
 * pre-existing violations elsewhere on the page that are out of scope for
 * the checkpoint being tested.
 */
export const expectNoA11yViolations = async (page: Page, scope?: string): Promise<void> => {
  const builder = new AxeBuilder({ page });
  if (scope) builder.include(scope);
  const results = await builder.analyze();
  expect(results.violations, formatViolations(results.violations)).toEqual([]);
};

const formatViolations = (
  violations: { id: string; help: string; nodes: { html: string }[] }[],
): string => {
  if (violations.length === 0) return "";
  return violations
    .map(
      (v) =>
        `- [${v.id}] ${v.help} (${v.nodes.length} node(s): ${v.nodes.map((n) => n.html).join(", ")})`,
    )
    .join("\n");
};

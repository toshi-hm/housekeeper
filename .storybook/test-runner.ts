import type { TestRunnerConfig } from "@storybook/test-runner";
import { getStoryContext, waitForPageReady } from "@storybook/test-runner";
import { checkA11y, configureAxe, injectAxe } from "axe-playwright";
import { toMatchImageSnapshot } from "jest-image-snapshot";

import { A11Y_BASELINE } from "./a11y-baseline.ts";

/**
 * axe-core + axe-playwright driven accessibility checks, run against every
 * `.stories.tsx` via `@storybook/test-runner` (bun run test-storybook).
 *
 * Rationale / how this differs from `@storybook/addon-a11y`'s in-browser
 * panel: the addon is interactive-only (Storybook UI, local dev). This
 * config is what makes the same axe-core engine runnable headlessly in CI
 * (see docs/specs/storybook.md and issue #497).
 *
 * Staged rollout (per #497): stories with pre-existing violations that
 * were not trivial to fix are listed in `./a11y-baseline.ts` and skipped
 * here rather than failing the whole build. Any *new* story is checked
 * unconditionally, so regressions and newly-added violations are caught
 * immediately. Shrink the baseline over time as each entry gets fixed.
 *
 * Visual regression (#807): the same run also takes a screenshot of every
 * story and compares it against a committed baseline PNG
 * (`.storybook/__image_snapshots__/`) via `jest-image-snapshot`'s official
 * recipe for `@storybook/test-runner` (see its README, "Image snapshot").
 * Reusing this single test-runner pass (rather than a second harness/CI
 * job) avoids rebuilding and re-serving Storybook twice per PR (#835).
 * A small `failureThreshold` absorbs font-rendering/anti-aliasing noise
 * between machines instead of requiring pixel-perfect equality. A story
 * opts out via `parameters.vrt.disable` (e.g. for genuinely
 * non-deterministic content) the same way `parameters.a11y.disable` works.
 */
const customSnapshotsDir = `${process.cwd()}/.storybook/__image_snapshots__`;

const config: TestRunnerConfig = {
  setup() {
    expect.extend({ toMatchImageSnapshot });
  },
  async preVisit(page) {
    await injectAxe(page);
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    // Run VRT and a11y independently and collect failures from both instead
    // of letting a VRT mismatch throw before the a11y check ever runs (which
    // would silently hide a real a11y regression behind the VRT failure).
    const errors: unknown[] = [];

    if (!storyContext.parameters?.vrt?.disable) {
      await waitForPageReady(page);
      const image = await page.screenshot();
      try {
        expect(image).toMatchImageSnapshot({
          customSnapshotsDir,
          customSnapshotIdentifier: context.id,
          failureThreshold: 0.02,
          failureThresholdType: "percent",
        });
      } catch (error) {
        errors.push(error);
      }
    }

    const a11yEnabled = !storyContext.parameters?.a11y?.disable && !A11Y_BASELINE.has(context.id);

    if (a11yEnabled) {
      await configureAxe(page, {
        rules: storyContext.parameters?.a11y?.config?.rules,
      });

      try {
        await checkA11y(page, "#storybook-root", {
          axeOptions: storyContext.parameters?.a11y?.options,
          detailedReport: true,
          detailedReportOptions: { html: false },
        });
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `Storybook checks failed (${errors.length})`);
    }
  },
};

export default config;

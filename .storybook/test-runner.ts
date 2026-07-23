import type { TestRunnerConfig } from "@storybook/test-runner";
import { getStoryContext } from "@storybook/test-runner";
import { checkA11y, configureAxe, injectAxe } from "axe-playwright";

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
 */
const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page);
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);

    if (storyContext.parameters?.a11y?.disable) {
      return;
    }

    if (A11Y_BASELINE.has(context.id)) {
      return;
    }

    await configureAxe(page, {
      rules: storyContext.parameters?.a11y?.config?.rules,
    });

    await checkA11y(page, "#storybook-root", {
      axeOptions: storyContext.parameters?.a11y?.options,
      detailedReport: true,
      detailedReportOptions: { html: false },
    });
  },
};

export default config;

/**
 * Known, not-yet-fixed axe-core violations, keyed by Storybook story id
 * (`<title-kebab>--<story-name-kebab>`, e.g. `atoms-expirybadge--expired`).
 *
 * This is the staged-rollout mechanism from issue #497: `.storybook/test-runner.ts`
 * skips the axe check entirely for any id listed here, so the CI job doesn't
 * fail the whole build on pre-existing issues that need a real component
 * fix rather than a CI-wiring change.
 *
 * Starts empty: axe-core could not actually be executed against the full
 * story set in the environment this PR was authored in (Playwright's
 * headless Chromium build wasn't downloadable there — see PR description),
 * so the real violation set is unverified. Expect the first CI run on this
 * PR to surface failures; triage each one by fixing it directly if it's a
 * quick win (e.g. missing `aria-label`), or adding its story id here (with
 * a short reason) if it needs a larger change, so the job goes green.
 *
 * Do not add new entries for newly-introduced stories going forward — new
 * stories are expected to pass. Shrink this list as each entry gets fixed;
 * see docs/specs/accessibility.md for the broader a11y conventions.
 */
export const A11Y_BASELINE = new Set<string>([]);

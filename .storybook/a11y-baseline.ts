/**
 * Known, not-yet-fixed axe-core violations, keyed by Storybook story id
 * (`<title-kebab>--<story-name-kebab>`, e.g. `atoms-expirybadge--expired`).
 *
 * This is the staged-rollout mechanism from issue #497: `.storybook/test-runner.ts`
 * skips the axe check entirely for any id listed here, so the CI job doesn't
 * fail the whole build on pre-existing issues that need a real component
 * fix rather than a CI-wiring change.
 *
 * Populated from the first real CI run of this workflow (the environment this
 * PR was authored in couldn't execute axe-core locally — see PR description).
 * Two `select-name` (critical) violations that were trivial one-line
 * `aria-label` additions were fixed directly instead of baselined
 * (LanguageToggle, ThemeToggle, BulkMoveDialog). Everything below is a
 * `color-contrast` (serious, WCAG 2 AA) violation: the affected colors
 * (e.g. `text-green-600`, `TagBadge`'s default gray `#6b7280`) need an
 * actual palette decision with visual review, not a mechanical value swap,
 * so they're deferred here rather than guessed at blind.
 *
 * Do not add new entries for newly-introduced stories going forward — new
 * stories are expected to pass. Shrink this list as each entry gets fixed;
 * see docs/specs/accessibility.md for the broader a11y conventions.
 */
export const A11Y_BASELINE = new Set<string>([
  // atoms/PasswordStrength: text-green-600 / text-destructive on the
  // component's background fails WCAG AA contrast.
  "components-atoms-passwordstrength--too-short",
  "components-atoms-passwordstrength--only-lowercase",
  "components-atoms-passwordstrength--two-types",
  "components-atoms-passwordstrength--three-types",
  "components-atoms-passwordstrength--all-four-types",
  // atoms/TagBadge: default tag color #6b7280 (gray-500) at low opacity
  // fails contrast against its own tinted background.
  "components-atoms-tagbadge--default",
  "components-atoms-tagbadge--no-color",
  "components-atoms-tagbadge--removable",
  // atoms/ExpiryBadge: the "expired" status color fails contrast. ItemCard /
  // ItemListRow embed this same badge for expired/low-stock items.
  "components-atoms-expirybadge--expired",
  "components-molecules-itemcard--expired",
  "components-molecules-itemlistrow--expired",
  "components-molecules-itemlistrow--empty-stock",
  "components-molecules-itemlistrow--selection-mode-selected",
  // atoms/ErrorBoundary: fallback UI text/background contrast.
  "components-atoms-errorboundary--with-custom-fallback",
  // molecules/ConfirmDialog, BulkActionBar, MultiTagSelect, ShoppingRow,
  // ExpiryRecipeSuggestions, DeletionReasonDialog: shared muted/secondary
  // text color combinations fail contrast in these contexts.
  "components-molecules-confirmdialog--default",
  "components-molecules-bulkactionbar--default",
  "components-molecules-multitagselect--none-selected",
  "components-molecules-multitagselect--some-selected",
  "components-molecules-shoppingrow--auto-added",
  "components-molecules-shoppingrow--purchased",
  "components-molecules-shoppingrow--purchased-no-actions",
  "components-molecules-expiryrecipesuggestions--no-image",
  "components-molecules-expiryrecipesuggestions--with-suggestions",
  "components-molecules-deletionreasondialog--default",
  "components-molecules-deletionreasondialog--bulk-delete",
  // organisms/ExpiryCalendar, pages/CalendarPage: same contrast issue
  // surfacing through the calendar's expiry-status coloring.
  "components-organisms-expirycalendar--default",
  "components-organisms-expirycalendar--empty",
  "components-pages-calendarpage--default",
  "components-pages-calendarpage--empty",
]);

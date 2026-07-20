# Accessibility Spec

## Status

This is a **baseline document**, not a compliance claim. It records the target
level, the conventions this codebase already uses (so new code stays
consistent), and an honest list of known gaps. It does not mean the app is
fully WCAG 2.1 AA compliant today — see [Known gaps](#known-gaps).

Originating issue: [#394](https://github.com/toshi-hm/housekeeper/issues/394)
(comprehensive a11y proposal). This PR is a first, scoped slice of that
proposal — see that issue for the full multi-phase rollout plan.

## Target

- **WCAG 2.1 Level AA** is the target conformance level for this app.
- Single-user, self-hosted context: there is no legal/contractual driver for
  this target, but it is the right bar for a mobile-first app that is
  sometimes used one-handed, in a kitchen, with wet/full hands, or while
  walking during shopping (see `.claude/skills/dev/uiux-review/PROJECT.md`
  for the usage-context notes that also motivate this).
- Conformance is **not automatically enforced yet**. Wiring
  `@storybook/addon-a11y` (already installed) into a CI-runnable check is
  tracked separately in [#497](https://github.com/toshi-hm/housekeeper/issues/497) —
  this doc does not duplicate that work.

## Conventions used in this codebase

### 1. Accessible names for icon-only controls

Most interactive elements in this app that render only an icon (no visible
text) must have an accessible name via `aria-label`. Preferred sources, in
order:

1. An i18n key already used for a visible label elsewhere in the same flow
   (e.g. reuse a `cancelLabel` / `confirmLabel` prop that's already passed
   in, rather than inventing new text).
2. A dedicated key in the relevant feature namespace
   (`src/locales/{ja,en}/<namespace>.json`), e.g. `items.back`.
3. The shared `common` namespace for generic actions that repeat across
   features (`common.close`, `common.delete`). Pull it in with a second
   `useTranslation` call when the component's primary `t` is bound to a
   different namespace:

   ```tsx
   const { t } = useTranslation("items");
   const { t: tCommon } = useTranslation("common");
   // ...
   <Button size="icon" onClick={onClose} aria-label={tCommon("close")}>
     <X className="h-5 w-5" />
   </Button>;
   ```

   This pattern is already established in `PurchaseDialog.tsx` and is now
   also used in `BarcodeScanner.tsx`, `ScanToShoppingDialog.tsx`, and
   `ImageUploader.tsx`.

`title` alone is not sufficient going forward for new icon-only buttons —
it does provide an accessible name via the accname algorithm, but it also
implies a hover tooltip that mobile/touch users never see, and doesn't show
up in a screen reader's rotor/gesture navigation as clearly as
`aria-label`. Prefer `aria-label` (optionally alongside `title` if a visual
tooltip is also useful on desktop, as `ChatComposer`'s send button does).

### 2. Form inputs and error messages

Associate validation/error text with its input via `aria-describedby`
pointing at the element that renders the message, so screen readers
announce the error when the field receives focus. Follow existing examples
in `ItemForm.tsx` and the `Input`/`Textarea` primitives in
`src/components/ui/`.

### 3. Live regions for dynamic updates (toasts)

Toast notifications already announce themselves to assistive tech — no new
work was needed for this in the current PR, but the pattern is documented
here since it's the reference for any future dynamic-update UI (e.g. an
in-page "N items low on stock" banner that updates without navigation):

- `src/lib/toast.tsx`'s `ToastContainer` wraps all toasts in a container
  with `aria-live="polite"` and `aria-atomic="false"`, mounted once at the
  app root via `ToastProvider` in `src/main.tsx`.
- Each individual toast gets `role="status"` for informational/success/
  warning toasts, or `role="alert"` for error toasts (the latter is
  implicitly assertive, which is appropriate — errors should interrupt).

Any new "ambient" status UI (stock-change banners, background sync
indicators, etc.) should either reuse the toast system or follow this same
`aria-live="polite"` (or `role="status"`) pattern rather than relying on
purely visual feedback.

### 4. Focus trap / modal dialogs

This app does not use Radix's `Dialog` primitive for its custom overlay
components (`ConfirmDialog`, `PurchaseDialog`, `InventoryChatPanel`, the
various bottom-sheet dialogs like `BulkMoveDialog` /
`ScanToShoppingDialog`) — they're hand-rolled `fixed inset-0` overlays.
That means focus trapping, initial focus, and focus restoration are **not**
free from the framework and must be implemented per component.

The canonical pattern for this is the focus trap implemented for
`InventoryChatPanel` for [#556](https://github.com/toshi-hm/housekeeper/issues/556)
(PR [#577](https://github.com/toshi-hm/housekeeper/pull/577)). Shape:

```tsx
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// On open: remember document.activeElement, then move focus into the panel
// (typically the primary input). On close: restore focus to what was
// remembered.
useEffect(() => {
  if (open) {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();
  } else if (previousFocusRef.current) {
    previousFocusRef.current.focus();
    previousFocusRef.current = null;
  }
}, [open]);

// In the existing Escape-key keydown listener, also handle Tab: compute the
// panel's focusable elements, and when Tab/Shift+Tab would move focus
// outside the first/last one, preventDefault() and wrap around instead.
```

New modal-style components should follow this same shape (own `dialogRef`,
own `previousFocusRef`, reuse the existing Escape-to-close listener to also
handle Tab-wrapping) rather than inventing a different mechanism. If a
future refactor consolidates these into a shared `useFocusTrap` hook or
switches to Radix `Dialog`, update this doc.

## Known gaps

This list exists so the next contributor doesn't have to rediscover these
by hand. None of these are fixed by this PR — they're scoped out
deliberately (see PR description) and are good candidates for follow-up
issues:

- **`ConfirmDialog` and `PurchaseDialog` have no focus trap.** Both have
  `role="alertdialog"`/dialog semantics and an Escape handler, but (unlike
  `InventoryChatPanel` after #556/#577) Tab can still move focus to
  elements behind the overlay, and focus is not moved into the dialog on
  open or restored to the trigger on close.
- **`BulkMoveDialog` and `ScanToShoppingDialog` (bottom-sheet dialogs) have
  no `role="dialog"`/`aria-modal` at all**, in addition to no focus trap.
- **No automated accessibility testing is wired into CI.** `@storybook/addon-a11y`
  is installed and available in the Storybook UI during local development,
  but nothing fails a build or PR check based on its findings yet. Tracked
  in [#497](https://github.com/toshi-hm/housekeeper/issues/497).
- **No `vitest-axe`/`@axe-core/react` in the unit test suite.** Accessibility
  regressions on custom components (icon-button labels, dialog semantics,
  etc.) are only caught by manual review or Storybook's addon, not by
  `bun test`.
- **This PR's icon-button sweep was not exhaustive.** It covered
  `src/components/` and fixed the icon-only buttons found missing an
  accessible name at the time of writing. `src/routes/` was not swept, and
  future components should be checked against the convention in
  [§1](#1-accessible-names-for-icon-only-controls) rather than assumed
  covered.
- **Color-only state is avoided in some but not all places.** `ExpiryBadge`
  intentionally pairs color with text per the `uiux-review` skill's
  project notes, but this has not been audited component-by-component
  across the whole app.
- **Keyboard-only manual walkthroughs have not been performed** for every
  screen (only spot-checked where issues were reported, e.g. #556). A full
  keyboard-nav pass across all routes is part of the original #394
  proposal's scope, not this PR's.

## Related specs and issues

- Full original proposal: [#394](https://github.com/toshi-hm/housekeeper/issues/394)
- Focus trap reference implementation: [#556](https://github.com/toshi-hm/housekeeper/issues/556) / [#577](https://github.com/toshi-hm/housekeeper/pull/577)
- CI automation for `@storybook/addon-a11y`: [#497](https://github.com/toshi-hm/housekeeper/issues/497)
- Inventory chat panel a11y requirements: `docs/specs/features/inventory-chat.md`
- UI/UX review checklist (includes a11y-adjacent usage-context notes):
  `.claude/skills/dev/uiux-review/PROJECT.md`

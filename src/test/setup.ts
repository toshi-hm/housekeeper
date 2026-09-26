import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "bun:test";

GlobalRegistrator.register();

// #1114: testing-library's default `waitFor`/`findBy*` timeout (1000ms) is
// tight enough that a few genuinely-correct-but-not-instant async chains
// (FileReader + React state update in DataImportPanel.test.tsx, userEvent
// typing + mutation in SecurityQuestionSettings.test.tsx) intermittently hit
// it under CI's more loaded/shared runners, even though the same assertions
// never come close to it locally. Raising the ceiling doesn't change what's
// asserted, only how long a genuinely-passing case is allowed to take.
configure({ asyncUtilTimeout: 5000 });

// #1114: warm up modules that different test files import both statically
// (e.g. src/routes/-_auth.settings.test.tsx) and dynamically after
// `mock.module("@/lib/supabase", ...)` (useNotificationPreferences.test.ts).
// Bun's ESM linker has a known race when a module's *first* import happens
// concurrently with other test files' own first imports during the initial
// file-load phase (https://github.com/AsafMah/dafman/issues/259) — it can
// leave the module's export table linked incorrectly for every later
// importer ("Export named 'subscribePush' not found" even though the export
// is statically present). Importing it once here, synchronously, before any
// test file runs, makes every later import — static or dynamic — a cache
// hit instead of a fresh (and possibly racy) link. Its own `supabase` import
// stays a live binding regardless, so per-test `mock.module("@/lib/supabase",
// ...)` calls (see useNotificationPreferences.test.ts) still apply normally.
import "@/hooks/useNotificationPreferences";

afterEach(cleanup);

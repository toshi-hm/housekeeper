import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  subscribePush as SubscribePushFn,
  unsubscribePush as UnsubscribePushFn,
  unsubscribePushOnSignOut as UnsubscribePushOnSignOutFn,
} from "@/hooks/useNotificationPreferences";

interface InvokeResponse {
  data: unknown;
  error: unknown;
}

let invokeResponse: InvokeResponse = { data: {}, error: null };
const invokeMock = mock(() => Promise.resolve(invokeResponse));

// #1113: `mock.module` only takes effect for imports resolved *after* it
// runs, so intercepting `@/lib/supabase` requires deferring the import of
// the module under test (a bare top-level `await import()`, evaluated as
// soon as this file is parsed) until after this call. Doing that at the very
// top of the file — racing dozens of other test files' own top-level dynamic
// imports during Bun's initial file-load phase — is what triggered a Bun
// ESM-linker race under CI specifically (non-reproducible locally even with
// a matching Bun version): "Export named 'subscribePush' not found" even
// though the export is statically present
// (https://github.com/AsafMah/dafman/issues/259 documents the same class of
// flake). Moving the mock + dynamic import into `beforeAll` defers it to
// this file's own dedicated test-execution phase instead, after the
// concurrent file-loading phase has settled.
let subscribePush: SubscribePushFn;
let unsubscribePush: UnsubscribePushFn;
let unsubscribePushOnSignOut: UnsubscribePushOnSignOutFn;

beforeAll(async () => {
  mock.module("@/lib/supabase", () => ({
    supabase: { functions: { invoke: invokeMock } },
  }));
  ({ subscribePush, unsubscribePush, unsubscribePushOnSignOut } =
    await import("@/hooks/useNotificationPreferences"));
});

const originalServiceWorker = navigator.serviceWorker;

const setServiceWorker = (value: unknown) => {
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value });
};

beforeEach(() => {
  invokeResponse = { data: {}, error: null };
  invokeMock.mockClear();
});

afterEach(() => {
  setServiceWorker(originalServiceWorker);
});

// #759: subscribePush/unsubscribePush previously discarded the `{ error }`
// returned by `supabase.functions.invoke("subscribe-push", ...)` — a failed
// Edge Function call (e.g. an RLS conflict on a shared `endpoint`) looked
// identical to success, so the caller (NotificationSettings.handlePushToggle)
// persisted `push_enabled: true` and showed a success toast even though no
// push_subscriptions row was ever written server-side.
describe("subscribePush", () => {
  const subscriptionToJSON = () => ({
    endpoint: "https://push.example/abc",
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  });

  test("throws when the Edge Function call returns an error", async () => {
    invokeResponse = { data: null, error: { message: "rls violation" } };
    setServiceWorker({
      ready: Promise.resolve({
        pushManager: { subscribe: mock(() => Promise.resolve({ toJSON: subscriptionToJSON })) },
      }),
    });

    await expect(subscribePush()).rejects.toEqual({ message: "rls violation" });
  });

  test("invokes subscribe-push with the subscription's endpoint and keys on success", async () => {
    setServiceWorker({
      ready: Promise.resolve({
        pushManager: { subscribe: mock(() => Promise.resolve({ toJSON: subscriptionToJSON })) },
      }),
    });

    await subscribePush();

    expect(invokeMock).toHaveBeenCalledWith("subscribe-push", {
      body: {
        endpoint: "https://push.example/abc",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
    });
  });
});

describe("unsubscribePush", () => {
  test("returns without calling the Edge Function when there is no active subscription", async () => {
    setServiceWorker({ ready: Promise.resolve({ pushManager: { getSubscription: () => null } }) });

    await unsubscribePush();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("throws when the Edge Function call returns an error, without unsubscribing locally", async () => {
    invokeResponse = { data: null, error: { message: "network error" } };
    const unsubscribe = mock(() => Promise.resolve(true));
    setServiceWorker({
      ready: Promise.resolve({
        pushManager: {
          getSubscription: () =>
            Promise.resolve({ endpoint: "https://push.example/abc", unsubscribe }),
        },
      }),
    });

    await expect(unsubscribePush()).rejects.toEqual({ message: "network error" });
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  test("invokes subscribe-push with action=unsubscribe and unsubscribes locally on success", async () => {
    const unsubscribe = mock(() => Promise.resolve(true));
    setServiceWorker({
      ready: Promise.resolve({
        pushManager: {
          getSubscription: () =>
            Promise.resolve({ endpoint: "https://push.example/abc", unsubscribe }),
        },
      }),
    });

    await unsubscribePush();

    expect(invokeMock).toHaveBeenCalledWith("subscribe-push", {
      body: { action: "unsubscribe", endpoint: "https://push.example/abc" },
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

// #1086: サインアウト処理（AuthProvider.tsx）からベストエフォートで呼ばれる想定の
// ラッパー。unsubscribePush() 自体が失敗しても、ログアウト処理を止めないために
// 例外を外へ伝播させないことを確認する。
describe("unsubscribePushOnSignOut", () => {
  test("does not throw when the Edge Function call returns an error", async () => {
    invokeResponse = { data: null, error: { message: "network error" } };
    setServiceWorker({
      ready: Promise.resolve({
        pushManager: {
          getSubscription: () =>
            Promise.resolve({
              endpoint: "https://push.example/abc",
              unsubscribe: mock(() => Promise.resolve(true)),
            }),
        },
      }),
    });

    await expect(unsubscribePushOnSignOut()).resolves.toBeUndefined();
  });

  test("does not throw when there is no Service Worker registration (e.g. requireOnline/ready rejects)", async () => {
    setServiceWorker({ ready: Promise.reject(new Error("no service worker")) });

    await expect(unsubscribePushOnSignOut()).resolves.toBeUndefined();
  });

  test("resolves without invoking the Edge Function when there is no active subscription", async () => {
    setServiceWorker({ ready: Promise.resolve({ pushManager: { getSubscription: () => null } }) });

    await unsubscribePushOnSignOut();

    expect(invokeMock).not.toHaveBeenCalled();
  });
});

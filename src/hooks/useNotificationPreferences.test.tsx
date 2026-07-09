import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";
import type { NotificationPreferences } from "@/types/user";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const {
  subscribePush,
  unsubscribePush,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} = await import("@/hooks/useNotificationPreferences");

const makePrefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  user_id: "user-1",
  push_enabled: true,
  email_enabled: false,
  email_address: null,
  threshold_days: 3,
  notify_at: "09:00",
  ...overrides,
});

interface MockSubscription {
  endpoint: string;
  toJSON: () => { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  unsubscribe: () => Promise<boolean>;
}

const installServiceWorkerMock = (subscription: MockSubscription | null) => {
  const subscribeCalls: unknown[] = [];
  const registration = {
    pushManager: {
      subscribe: (options: unknown) => {
        subscribeCalls.push(options);
        return Promise.resolve(subscription);
      },
      getSubscription: () => Promise.resolve(subscription),
    },
  };
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  });
  return { subscribeCalls };
};

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useNotificationPreferences", () => {
  test("設定を取得する", async () => {
    const prefs = makePrefs();
    sb.enqueue("notification_preferences", { data: prefs });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(prefs);
  });

  test("取得エラーで isError になる", async () => {
    sb.enqueue("notification_preferences", { error: { message: "boom" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateNotificationPreferences", () => {
  test("user_id を付与して upsert する", async () => {
    const prefs = makePrefs({ threshold_days: 7 });
    sb.enqueue("notification_preferences", { data: prefs });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpdateNotificationPreferences(), { wrapper });

    let value: NotificationPreferences | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({ threshold_days: 7 });
    });

    expect(value?.threshold_days).toBe(7);

    const [query] = sb.queriesFor("notification_preferences");
    expect(query?.ops[0]?.method).toBe("upsert");
    expect(query?.ops[0]?.args[0]).toMatchObject({ threshold_days: 7, user_id: "user-1" });
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpdateNotificationPreferences(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ threshold_days: 7 })).rejects.toThrow(
        "Not authenticated",
      );
    });
  });

  test("upsert エラーは throw する (トーストなし)", async () => {
    sb.enqueue("notification_preferences", { error: { message: "upsert failed" } });

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateNotificationPreferences(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ threshold_days: 7 })).rejects.toBeDefined();
    });

    expect(toastCalls).toHaveLength(0);
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateNotificationPreferences(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ threshold_days: 7 })).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("subscribePush", () => {
  test("push 購読して Edge Function にキーを送る", async () => {
    const subscription: MockSubscription = {
      endpoint: "https://push.example/ep",
      toJSON: () => ({
        endpoint: "https://push.example/ep",
        keys: { p256dh: "p256", auth: "auth-key" },
      }),
      unsubscribe: () => Promise.resolve(true),
    };
    const { subscribeCalls } = installServiceWorkerMock(subscription);

    await subscribePush();

    expect(subscribeCalls).toHaveLength(1);
    expect(sb.invokeCalls[0]?.name).toBe("subscribe-push");
    expect(sb.invokeCalls[0]?.body).toMatchObject({
      endpoint: "https://push.example/ep",
      keys: { p256dh: "p256", auth: "auth-key" },
    });
  });

  test("keys が欠けていても空文字で送る", async () => {
    const subscription: MockSubscription = {
      endpoint: "https://push.example/ep2",
      toJSON: () => ({ endpoint: "https://push.example/ep2" }),
      unsubscribe: () => Promise.resolve(true),
    };
    installServiceWorkerMock(subscription);

    await subscribePush();

    const lastCall = sb.invokeCalls[sb.invokeCalls.length - 1];
    expect(lastCall?.body).toMatchObject({ keys: { p256dh: "", auth: "" } });
  });

  test("オフラインなら OfflineError を投げる", async () => {
    setNavigatorOnline(false);
    await expect(subscribePush()).rejects.toThrow("You are offline");
  });
});

describe("unsubscribePush", () => {
  test("購読があれば解除して Edge Function に通知する", async () => {
    let unsubscribed = false;
    const subscription: MockSubscription = {
      endpoint: "https://push.example/ep",
      toJSON: () => ({ endpoint: "https://push.example/ep" }),
      unsubscribe: () => {
        unsubscribed = true;
        return Promise.resolve(true);
      },
    };
    installServiceWorkerMock(subscription);

    await unsubscribePush();

    expect(unsubscribed).toBe(true);
    const lastCall = sb.invokeCalls[sb.invokeCalls.length - 1];
    expect(lastCall?.body).toMatchObject({
      action: "unsubscribe",
      endpoint: "https://push.example/ep",
    });
  });

  test("購読がなければ何もしない", async () => {
    installServiceWorkerMock(null);
    const before = sb.invokeCalls.length;

    await unsubscribePush();

    expect(sb.invokeCalls.length).toBe(before);
  });

  test("オフラインなら OfflineError を投げる", async () => {
    setNavigatorOnline(false);
    await expect(unsubscribePush()).rejects.toThrow("You are offline");
  });
});

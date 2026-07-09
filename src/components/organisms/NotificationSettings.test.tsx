import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import i18n from "@/lib/i18n";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";
import type { NotificationPreferences } from "@/types/user";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { NotificationSettings } = await import("@/components/organisms/NotificationSettings");

const makePrefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  user_id: "user-1",
  push_enabled: false,
  email_enabled: false,
  email_address: null,
  threshold_days: 3,
  notify_at: "08:00",
  ...overrides,
});

/** Push サポート判定に必要な API (Notification / serviceWorker / PushManager) を生やす */
const installPushSupport = (permission: NotificationPermission = "granted") => {
  const subscription = {
    endpoint: "https://push.example/ep",
    toJSON: () => ({ endpoint: "https://push.example/ep", keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: () => Promise.resolve(true),
  };
  Object.defineProperty(globalThis.window, "Notification", {
    value: { requestPermission: () => Promise.resolve(permission) },
    configurable: true,
  });
  Object.defineProperty(globalThis.window, "PushManager", {
    value: class PushManager {},
    configurable: true,
  });
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    value: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: () => Promise.resolve(subscription),
          getSubscription: () => Promise.resolve(subscription),
        },
      }),
    },
    configurable: true,
  });
};

const renderSettings = () => {
  const { wrapper: Wrapper, toastCalls } = createHookWrapper();
  const utils = render(
    <Wrapper>
      <NotificationSettings />
    </Wrapper>,
  );
  return { ...utils, toastCalls };
};

beforeEach(() => {
  sb.reset();
});

describe("NotificationSettings", () => {
  test("push 有効化: 許可 → 購読 → 設定更新 → success トースト", async () => {
    installPushSupport("granted");
    sb.enqueue("notification_preferences", { data: makePrefs() }); // fetch
    sb.enqueue("notification_preferences", { data: makePrefs({ push_enabled: true }) }); // upsert
    sb.enqueue("notification_preferences", { data: makePrefs({ push_enabled: true }) }); // refetch

    const { getAllByText, toastCalls } = renderSettings();

    fireEvent.click(getAllByText(i18n.t("common:disabled"), { exact: true })[0]!);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "success")).toBe(true));
    expect(sb.invokeCalls.some((call) => call.name === "subscribe-push")).toBe(true);
  });

  test("push 有効化: 通知許可が拒否されたら error トーストのみ", async () => {
    installPushSupport("denied");
    sb.enqueue("notification_preferences", { data: makePrefs() });

    const { getAllByText, toastCalls } = renderSettings();

    fireEvent.click(getAllByText(i18n.t("common:disabled"), { exact: true })[0]!);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
    expect(sb.invokeCalls).toHaveLength(0);
  });

  test("push 無効化: unsubscribe して設定を false に更新する", async () => {
    installPushSupport("granted");
    sb.enqueue("notification_preferences", { data: makePrefs({ push_enabled: true }) });
    sb.enqueue("notification_preferences", { data: makePrefs({ push_enabled: false }) });
    sb.enqueue("notification_preferences", { data: makePrefs({ push_enabled: false }) });

    const { getByText } = renderSettings();

    await waitFor(() => expect(getByText(i18n.t("common:enabled"), { exact: true })).toBeTruthy());
    fireEvent.click(getByText(i18n.t("common:enabled"), { exact: true }));

    await waitFor(() =>
      expect(
        sb.invokeCalls.some(
          (call) =>
            call.name === "subscribe-push" &&
            (call.body as { action?: string }).action === "unsubscribe",
        ),
      ).toBe(true),
    );
  });

  test("push 購読に失敗したら unknownError トースト", async () => {
    installPushSupport("granted");
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: { ready: Promise.reject(new Error("sw failed")) },
      configurable: true,
    });
    sb.enqueue("notification_preferences", { data: makePrefs() });

    const { getAllByText, toastCalls } = renderSettings();

    fireEvent.click(getAllByText(i18n.t("common:disabled"), { exact: true })[0]!);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("メール通知のトグルで upsert される", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs() });
    sb.enqueue("notification_preferences", { data: makePrefs({ email_enabled: true }) });
    sb.enqueue("notification_preferences", { data: makePrefs({ email_enabled: true }) });

    const { getAllByText } = renderSettings();

    // 2 つ目の「無効」ボタンがメール用
    const disabledButtons = getAllByText(i18n.t("common:disabled"), { exact: true });
    fireEvent.click(disabledButtons[disabledButtons.length - 1]!);

    await waitFor(() => {
      const upserts = sb
        .queriesFor("notification_preferences")
        .filter((query) => query.ops.some((op) => op.method === "upsert"));
      expect(upserts.length).toBeGreaterThan(0);
    });
  });

  test("メール通知の upsert 失敗で unknownError トーストを出す", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs() });
    sb.enqueue("notification_preferences", { error: { message: "upsert failed" } });

    const { getAllByText, toastCalls } = renderSettings();

    const disabledButtons = getAllByText(i18n.t("common:disabled"), { exact: true });
    fireEvent.click(disabledButtons[disabledButtons.length - 1]!);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("しきい値の upsert 失敗で unknownError トーストを出す", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs() });
    sb.enqueue("notification_preferences", { error: { message: "upsert failed" } });

    const { container, toastCalls } = renderSettings();

    const thresholdInput = container.querySelector("#threshold_days") as HTMLInputElement;
    thresholdInput.value = "5";
    fireEvent.blur(thresholdInput);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("通知時刻の upsert 失敗で unknownError トーストを出す", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs() });
    sb.enqueue("notification_preferences", { error: { message: "upsert failed" } });

    const { container, toastCalls } = renderSettings();

    const notifyInput = container.querySelector("#notify_at") as HTMLInputElement;
    notifyInput.value = "12:00";
    fireEvent.blur(notifyInput);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("メールアドレスの upsert 失敗で unknownError トーストを出す", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs({ email_enabled: true }) });
    sb.enqueue("notification_preferences", { error: { message: "upsert failed" } });

    const { container, toastCalls } = renderSettings();

    await waitFor(() => expect(container.querySelector("#email_address")).not.toBeNull());
    const emailInput = container.querySelector("#email_address") as HTMLInputElement;
    emailInput.value = "ok@example.com";
    fireEvent.blur(emailInput);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("メールアドレス: 不正な形式は error トーストで送信しない", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs({ email_enabled: true }) });

    const { container, toastCalls } = renderSettings();

    await waitFor(() => expect(container.querySelector("#email_address")).not.toBeNull());

    const emailInput = container.querySelector("#email_address") as HTMLInputElement;
    emailInput.value = "invalid-email";
    fireEvent.blur(emailInput);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });

  test("メールアドレス: 正しい形式は upsert される", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs({ email_enabled: true }) });
    sb.enqueue("notification_preferences", {
      data: makePrefs({ email_enabled: true, email_address: "a@b.co" }),
    });

    const { container } = renderSettings();

    await waitFor(() => expect(container.querySelector("#email_address")).not.toBeNull());

    const emailInput = container.querySelector("#email_address") as HTMLInputElement;
    emailInput.value = "a@b.co";
    fireEvent.blur(emailInput);

    await waitFor(() => {
      const upsert = sb
        .queriesFor("notification_preferences")
        .find((query) => query.ops.some((op) => op.method === "upsert"));
      expect(upsert?.ops[0]?.args[0]).toMatchObject({ email_address: "a@b.co" });
    });
  });

  test("しきい値: 範囲外は送信せず、正常値は upsert される", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs() });
    sb.enqueue("notification_preferences", { data: makePrefs({ threshold_days: 7 }) });

    const { container } = renderSettings();

    const thresholdInput = container.querySelector("#threshold_days") as HTMLInputElement;

    // 範囲外 (31) → 送信しない
    thresholdInput.value = "31";
    fireEvent.blur(thresholdInput);
    expect(
      sb
        .queriesFor("notification_preferences")
        .filter((query) => query.ops.some((op) => op.method === "upsert")),
    ).toHaveLength(0);

    thresholdInput.value = "7";
    fireEvent.blur(thresholdInput);

    await waitFor(() => {
      const upsert = sb
        .queriesFor("notification_preferences")
        .find((query) => query.ops.some((op) => op.method === "upsert"));
      expect(upsert?.ops[0]?.args[0]).toMatchObject({ threshold_days: 7 });
    });
  });

  test("通知時刻: 空は送信せず、値があれば upsert される", async () => {
    installPushSupport();
    sb.enqueue("notification_preferences", { data: makePrefs() });
    sb.enqueue("notification_preferences", { data: makePrefs({ notify_at: "10:30" }) });

    const { container } = renderSettings();

    const notifyInput = container.querySelector("#notify_at") as HTMLInputElement;

    notifyInput.value = "";
    fireEvent.blur(notifyInput);
    expect(
      sb
        .queriesFor("notification_preferences")
        .filter((query) => query.ops.some((op) => op.method === "upsert")),
    ).toHaveLength(0);

    notifyInput.value = "10:30";
    fireEvent.blur(notifyInput);

    await waitFor(() => {
      const upsert = sb
        .queriesFor("notification_preferences")
        .find((query) => query.ops.some((op) => op.method === "upsert"));
      expect(upsert?.ops[0]?.args[0]).toMatchObject({ notify_at: "10:30" });
    });
  });
});

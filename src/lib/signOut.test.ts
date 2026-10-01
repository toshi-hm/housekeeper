import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];
const unsubscribePushOnSignOutMock = mock(() => {
  calls.push("unsubscribe");
  return Promise.resolve();
});
const signOutMock = mock(() => {
  calls.push("signOut");
  return Promise.resolve({ error: null });
});

mock.module("@/hooks/useNotificationPreferences", () => ({
  unsubscribePushOnSignOut: unsubscribePushOnSignOutMock,
}));
mock.module("@/lib/supabase", () => ({
  supabase: { auth: { signOut: signOutMock } },
}));

const { signOutUser } = await import("./signOut");

describe("signOutUser", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  test("Push購読の解除をセッション破棄(signOut)より先に実行する", async () => {
    await signOutUser();

    expect(calls).toEqual(["unsubscribe", "signOut"]);
  });
});

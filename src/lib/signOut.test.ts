import { beforeEach, describe, expect, mock, test } from "bun:test";

import { signOutUser } from "./signOut";

// 他のテストファイルが "@/hooks/useNotificationPreferences" を mock.module で
// 差し替えたままにするため、購読解除処理は引数で注入して順序のみを検証する。
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  mock.module("@/lib/supabase", () => ({
    supabase: {
      auth: {
        signOut: mock(() => {
          calls.push("signOut");
          return Promise.resolve({ error: null });
        }),
      },
    },
  }));
});

describe("signOutUser", () => {
  test("Push購読の解除をセッション破棄(signOut)より先に実行する (#1134)", async () => {
    await signOutUser(() => {
      calls.push("unsubscribe");
      return Promise.resolve();
    });

    expect(calls).toEqual(["unsubscribe", "signOut"]);
  });
});

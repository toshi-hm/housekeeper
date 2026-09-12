import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";

type AuthChangeCallback = (event: string, session: unknown) => void;

let authChangeCallback: AuthChangeCallback | null = null;
const unsubscribeMock = mock(() => {});
const onAuthStateChangeMock = mock((callback: AuthChangeCallback) => {
  authChangeCallback = callback;
  return { data: { subscription: { unsubscribe: unsubscribeMock } } };
});

mock.module("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: onAuthStateChangeMock,
    },
  },
}));

const { AuthProvider } = await import("./AuthProvider");
const { useAuthSession } = await import("./auth-context");
const { persister, queryClient } = await import("./queryClient");
const { enqueueOfflineAction, readOfflineActionQueue } = await import("./offlineActionQueue");
const { loadItemFormDraft, saveItemFormDraft } = await import("./itemFormDraft");

// mock.module replaces the module for the entire bun:test process (leaks across
// files), so spy on the real queryClient/persister instances instead.
const queryClientClearSpy = spyOn(queryClient, "clear").mockImplementation(() => {});
const removeClientSpy = spyOn(persister, "removeClient").mockImplementation(() =>
  Promise.resolve(),
);

const CART_CHECK_OFF_STORAGE_KEY = "shopping.cartCheckedIds";

const makeStore = <S,>(state: S) => ({
  state,
  get: () => state,
  subscribe: () => ({ unsubscribe: () => {} }),
});

const navigateMock = mock(() => Promise.resolve());

const makeStubRouter = (pathname: string) =>
  ({
    navigate: navigateMock,
    buildLocation: () => ({ href: pathname, pathname }),
    isServer: false,
    options: { basepath: "/" },
    state: { location: { href: pathname, pathname }, matches: [], pendingMatches: [] },
    history: { createHref: (href: string) => href },
    stores: {
      location: makeStore({ href: pathname, pathname }),
      matches: makeStore([]),
      pendingMatches: makeStore([]),
      status: makeStore("idle"),
    },
  }) as unknown;

const renderWithRouter = (pathname: string, children: React.ReactNode) =>
  render(
    <routerContext.Provider value={makeStubRouter(pathname)}>{children}</routerContext.Provider>,
  );

const SessionProbe = () => {
  const session = useAuthSession();
  return <div data-testid="session">{session ? "signed-in" : "signed-out"}</div>;
};

beforeEach(() => {
  authChangeCallback = null;
  onAuthStateChangeMock.mockClear();
  unsubscribeMock.mockClear();
  navigateMock.mockClear();
  queryClientClearSpy.mockClear();
  removeClientSpy.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AuthProvider", () => {
  test("provides the current session via useAuthSession", async () => {
    const { getByTestId } = renderWithRouter(
      "/",
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authChangeCallback).not.toBeNull());
    authChangeCallback?.("INITIAL_SESSION", { user: { id: "u1" } });

    await waitFor(() => expect(getByTestId("session").textContent).toBe("signed-in"));
  });

  test("redirects to /login on SIGNED_OUT while on a protected route", async () => {
    renderWithRouter(
      "/",
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authChangeCallback).not.toBeNull());
    authChangeCallback?.("SIGNED_OUT", null);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/login" }));
  });

  test("clears the query cache (including IndexedDB persistence) on SIGNED_OUT", async () => {
    renderWithRouter(
      "/",
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authChangeCallback).not.toBeNull());
    authChangeCallback?.("SIGNED_OUT", null);

    await waitFor(() => expect(queryClientClearSpy).toHaveBeenCalled());
    expect(removeClientSpy).toHaveBeenCalled();
  });

  // #1053: 前ユーザーのオフラインキュー/カートチェック状態/フォーム下書きが
  // user_idを含まない固定キーのlocalStorageに残り、別アカウントへの
  // ログイン後も引き継がれてしまう問題の回帰テスト。スパイで置き換えるのではなく、
  // 実際にlocalStorageへ書き込んだ上でSIGNED_OUTを発火し、実データが消えることを
  // 確認する（spyOnで置き換えると、対象の関数を直接テストしている他のテスト
  // ファイルにまで process 全体で漏れてしまうため、#672/#983/#1053それぞれの
  // 単体テストに合わせて実データで検証する）。
  test("clears offline-queue/cart-check-off/item-form-draft localStorage on SIGNED_OUT", async () => {
    enqueueOfflineAction([], {
      kind: "add-alert",
      payload: { name: "醤油", linked_item_id: null },
    });
    window.localStorage.setItem(CART_CHECK_OFF_STORAGE_KEY, JSON.stringify({ s1: true }));
    saveItemFormDraft("new-item", {
      values: {
        name: "牛乳",
        units: 1,
        content_amount: 1,
        content_unit: "個",
      },
      unitsRaw: "1",
      contentAmountRaw: "1",
    });
    expect(readOfflineActionQueue()).toHaveLength(1);
    expect(window.localStorage.getItem(CART_CHECK_OFF_STORAGE_KEY)).not.toBeNull();
    expect(loadItemFormDraft("new-item")).not.toBeNull();

    renderWithRouter(
      "/",
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authChangeCallback).not.toBeNull());
    authChangeCallback?.("SIGNED_OUT", null);

    await waitFor(() => expect(readOfflineActionQueue()).toEqual([]));
    expect(window.localStorage.getItem(CART_CHECK_OFF_STORAGE_KEY)).toBeNull();
    expect(loadItemFormDraft("new-item")).toBeNull();
  });

  test("does not clear the query cache on non-SIGNED_OUT events", async () => {
    enqueueOfflineAction([], {
      kind: "add-alert",
      payload: { name: "醤油", linked_item_id: null },
    });

    renderWithRouter(
      "/",
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authChangeCallback).not.toBeNull());
    authChangeCallback?.("TOKEN_REFRESHED", { user: { id: "u1" } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryClientClearSpy).not.toHaveBeenCalled();
    expect(removeClientSpy).not.toHaveBeenCalled();
    expect(readOfflineActionQueue()).toHaveLength(1);
  });

  test("does not redirect on SIGNED_OUT while already on /login", async () => {
    renderWithRouter(
      "/login",
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authChangeCallback).not.toBeNull());
    authChangeCallback?.("SIGNED_OUT", null);

    // Give any (unwanted) async navigate a chance to fire before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test("unsubscribes from onAuthStateChange on unmount", async () => {
    const { unmount } = renderWithRouter(
      "/",
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authChangeCallback).not.toBeNull());
    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});

describe("useAuthSession", () => {
  test("throws when used outside AuthProvider", () => {
    const OutsideProbe = () => {
      useAuthSession();
      return null;
    };

    expect(() => render(<OutsideProbe />)).toThrow(
      "useAuthSession must be used within AuthProvider",
    );
  });
});

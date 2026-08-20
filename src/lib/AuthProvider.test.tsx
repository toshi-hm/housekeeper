import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

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

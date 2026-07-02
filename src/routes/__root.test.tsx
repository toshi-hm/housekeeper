import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { I18nextProvider } from "react-i18next";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import i18n from "../lib/i18n";
import { NotFoundPage } from "./__root";

const makeStore = <S,>(state: S) => ({
  state,
  get: () => state,
  subscribe: () => ({ unsubscribe: () => {} }),
});

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/", pathname: "/" }),
  isServer: false,
  options: { basepath: "/" },
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
  history: { createHref: (href: string) => href },
  stores: {
    location: makeStore({ href: "/", pathname: "/" }),
    matches: makeStore([]),
    pendingMatches: makeStore([]),
    status: makeStore("idle"),
  },
} as unknown;

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <routerContext.Provider value={stubRouter}>
    <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
  </routerContext.Provider>
);

describe("NotFoundPage", () => {
  it("renders Japanese 404 text by default", async () => {
    await i18n.changeLanguage("ja");
    const { getByText } = render(<NotFoundPage />, {
      wrapper: Wrapper as React.ComponentType,
    });
    expect(getByText("404 — ページが見つかりません")).toBeDefined();
    expect(getByText("ホームへ戻る")).toBeDefined();
  });

  it("renders English 404 text when language is en", async () => {
    await i18n.changeLanguage("en");
    const { getByText } = render(<NotFoundPage />, {
      wrapper: Wrapper as React.ComponentType,
    });
    expect(getByText("404 — Page not found")).toBeDefined();
    expect(getByText("Go home")).toBeDefined();
  });
});

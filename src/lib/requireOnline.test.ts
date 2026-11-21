import { afterEach, describe, expect, test } from "bun:test";

// 他のテストファイルが `mock.module("@/lib/requireOnline", ...)` でモジュールを差し替えると、
// 同一プロセスで実行される `bun test`（全件）ではその差し替えが本テストにも波及する。
// クエリ文字列付きで読み込み、モックの影響を受けない実体モジュールを検証する。
import type * as RequireOnlineModule from "./requireOnline";

const { ConcurrentUpdateError, FloorPlanConflictError, OfflineError, requireOnline } =
  (await import("./requireOnline.ts?actual")) as typeof RequireOnlineModule;

const setOnLine = (value: boolean) => {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
};

describe("requireOnline", () => {
  afterEach(() => setOnLine(true));

  test("オンラインなら例外を投げない", () => {
    setOnLine(true);
    expect(() => requireOnline()).not.toThrow();
  });

  test("オフラインなら OfflineError を投げる", () => {
    setOnLine(false);
    expect(() => requireOnline()).toThrow(OfflineError);
  });

  test("各エラーは判別用フラグを持つ", () => {
    expect(new OfflineError().isOffline).toBe(true);
    expect(new ConcurrentUpdateError().isConcurrentUpdate).toBe(true);
    expect(new FloorPlanConflictError().isFloorPlanConflict).toBe(true);
  });
});

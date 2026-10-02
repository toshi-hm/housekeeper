import type { Query } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";

import { queryClient, shouldDehydrateQuery } from "@/lib/queryClient";

describe("queryClient mutations networkMode (#469)", () => {
  test('networkMode は "always" で、オフライン時も mutationFn (requireOnline) が呼ばれる', () => {
    // "online"（TanStack Query のデフォルト）だとオフライン時に mutationFn が呼ばれず
    // pause されるため、requireOnline() が一度も呼ばれずサイレントにキューイングされてしまう。
    // "always" にすることで、オフライン時も即座に mutationFn が実行され、
    // requireOnline() が throw して onError でエラートーストを出せる。
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe("always");
  });
});

const makeSuccessQuery = (queryKey: unknown[]): Query =>
  ({ queryKey, state: { status: "success" } }) as Query;

describe("shouldDehydrateQuery", () => {
  test.each([["item-image"], ["item-images"], ["location-photo"]])(
    "signed URL キャッシュ (%s) は IndexedDB へ永続化しない",
    (key) => {
      // 署名付き URL のトークンは50分で失効するが、永続化した場合の保持期間
      // (main.tsx の maxAge) は24時間あるため、50分以上アプリを開かずに
      // 再度開くと、失効済みの signedUrl がそのまま復元され、画像が一瞬
      // 400 になる（Storage の GET .../object/sign/... が期限切れトークンを拒否する）。
      expect(shouldDehydrateQuery(makeSuccessQuery([key, ["a", "b"]]))).toBe(false);
    },
  );

  test("他のクエリは通常どおり永続化される", () => {
    expect(shouldDehydrateQuery(makeSuccessQuery(["items"]))).toBe(true);
  });
});

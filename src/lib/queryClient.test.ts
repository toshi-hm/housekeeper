import { describe, expect, test } from "bun:test";

import { queryClient } from "@/lib/queryClient";

describe("queryClient mutations networkMode (#469)", () => {
  test('networkMode は "always" で、オフライン時も mutationFn (requireOnline) が呼ばれる', () => {
    // "online"（TanStack Query のデフォルト）だとオフライン時に mutationFn が呼ばれず
    // pause されるため、requireOnline() が一度も呼ばれずサイレントにキューイングされてしまう。
    // "always" にすることで、オフライン時も即座に mutationFn が実行され、
    // requireOnline() が throw して onError でエラートーストを出せる。
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe("always");
  });
});

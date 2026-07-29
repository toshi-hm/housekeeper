import assert from "node:assert/strict";

import { fetchAllPages, SUPABASE_MAX_ROWS } from "./pagination.ts";

Deno.test("fetchAllPages (#669) - 1ページに収まる件数ならfetchPageは1回だけ呼ばれる", async () => {
  let calls = 0;
  const fetchPage = (from: number, to: number) => {
    calls += 1;
    assert.deepStrictEqual([from, to], [0, 9]);
    return Promise.resolve([1, 2, 3]);
  };
  const result = await fetchAllPages(fetchPage, 10);

  assert.deepStrictEqual(result, [1, 2, 3]);
  assert.strictEqual(calls, 1);
});

Deno.test("fetchAllPages (#669) - ページサイズちょうどの件数が返った場合は次のページも取得する", async () => {
  let call = 0;
  const seenRanges: Array<[number, number]> = [];
  const fetchPage = (from: number, to: number) => {
    call += 1;
    seenRanges.push([from, to]);
    if (call === 1) return Promise.resolve(Array.from({ length: 10 }, (_, i) => from + i));
    return Promise.resolve(Array.from({ length: 3 }, (_, i) => from + i));
  };
  const result = await fetchAllPages(fetchPage, 10);

  assert.strictEqual(result.length, 13);
  assert.strictEqual(call, 2);
  assert.deepStrictEqual(seenRanges, [
    [0, 9],
    [10, 19],
  ]);
});

Deno.test("fetchAllPages (#669) - 0件の場合は空配列を返し1回だけ呼ばれる", async () => {
  let calls = 0;
  const fetchPage = () => {
    calls += 1;
    return Promise.resolve([]);
  };
  const result = await fetchAllPages(fetchPage, 10);

  assert.deepStrictEqual(result, []);
  assert.strictEqual(calls, 1);
});

Deno.test("fetchAllPages (#669) - 既定のページサイズはSUPABASE_MAX_ROWS(1000)", async () => {
  let calls = 0;
  const fetchPage = (from: number, to: number) => {
    calls += 1;
    assert.strictEqual(to - from + 1, SUPABASE_MAX_ROWS);
    return Promise.resolve([] as number[]);
  };
  await fetchAllPages(fetchPage);
  assert.strictEqual(calls, 1);
});

import { describe, expect, mock, test } from "bun:test";

import { fetchAllPages, SUPABASE_MAX_ROWS } from "./supabasePagination";

describe("fetchAllPages (#622)", () => {
  test("1ページに収まる件数ならfetchPageは1回だけ呼ばれる", async () => {
    const fetchPage = mock(() => Promise.resolve([1, 2, 3]));
    const result = await fetchAllPages(fetchPage, 10);

    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0, 9);
  });

  test("ページサイズちょうどの件数が返った場合は次のページも取得する", async () => {
    let call = 0;
    const fetchPage = mock((from: number) => {
      call += 1;
      if (call === 1) return Promise.resolve(Array.from({ length: 10 }, (_, i) => from + i));
      return Promise.resolve(Array.from({ length: 3 }, (_, i) => from + i));
    });
    const result = await fetchAllPages(fetchPage, 10);

    expect(result.length).toBe(13);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 9);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 10, 19);
  });

  test("0件の場合は空配列を返し1回だけ呼ばれる", async () => {
    const fetchPage = mock(() => Promise.resolve([]));
    const result = await fetchAllPages(fetchPage, 10);

    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  test("既定のページサイズはSUPABASE_MAX_ROWS(1000)", async () => {
    const fetchPage = mock((from: number, to: number) => {
      expect(to - from + 1).toBe(SUPABASE_MAX_ROWS);
      return Promise.resolve([] as number[]);
    });
    await fetchAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

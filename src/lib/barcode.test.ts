import { describe, expect, test } from "bun:test";

import { barcodeVariants } from "@/lib/barcode";

describe("barcodeVariants", () => {
  test("UPC-A(12桁)は JAN-13 / GTIN-14 候補も返す", () => {
    expect(barcodeVariants("012345678905")).toEqual(["012345678905", "0012345678905"]);
  });

  test("先頭0のJAN-13は12桁候補も返す", () => {
    expect(barcodeVariants("0012345678905")).toEqual([
      "0012345678905",
      "012345678905",
      "00012345678905",
    ]);
  });

  test("通常のJAN-13は GTIN-14 候補を加える", () => {
    expect(barcodeVariants("4901234567894")).toEqual(["4901234567894", "04901234567894"]);
  });

  test("数字以外・8桁はそのまま", () => {
    expect(barcodeVariants(" ABC-1 ")).toEqual(["ABC-1"]);
    expect(barcodeVariants("49012345")).toEqual(["49012345"]);
  });
});

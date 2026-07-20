import { describe, expect, test } from "bun:test";

import {
  calculateTargetDimensions,
  MAX_EDGE_PX,
  needsResize,
  pickOutputFormat,
} from "@/lib/imageCompress";

describe("calculateTargetDimensions", () => {
  test("長辺がmaxEdge以下ならリサイズせずそのまま返す", () => {
    expect(calculateTargetDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  test("長辺がmaxEdgeちょうどならそのまま返す", () => {
    expect(calculateTargetDimensions(1280, 720, 1280)).toEqual({ width: 1280, height: 720 });
  });

  test("横長画像は幅を基準にアスペクト比を保ってリサイズする", () => {
    expect(calculateTargetDimensions(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 });
  });

  test("縦長画像は高さを基準にアスペクト比を保ってリサイズする", () => {
    expect(calculateTargetDimensions(1440, 2560, 1280)).toEqual({ width: 720, height: 1280 });
  });

  test("正方形画像も長辺基準でリサイズする", () => {
    expect(calculateTargetDimensions(2000, 2000, 1280)).toEqual({ width: 1280, height: 1280 });
  });

  test("デフォルトのmaxEdgeはMAX_EDGE_PX(1280)", () => {
    expect(calculateTargetDimensions(3840, 2160)).toEqual(
      calculateTargetDimensions(3840, 2160, MAX_EDGE_PX),
    );
  });

  test("非常に細長い画像でも短辺が0未満にならない", () => {
    const result = calculateTargetDimensions(10000, 1, 1280);
    expect(result.height).toBeGreaterThanOrEqual(1);
    expect(result.width).toBe(1280);
  });

  test("width/heightが0のときは何もせず返す（ゼロ除算回避）", () => {
    expect(calculateTargetDimensions(0, 0, 1280)).toEqual({ width: 0, height: 0 });
  });
});

describe("needsResize", () => {
  test("長辺がmaxEdgeを超えるときtrue", () => {
    expect(needsResize(2000, 1000, 1280)).toBe(true);
  });

  test("長辺がmaxEdge以下のときfalse", () => {
    expect(needsResize(1280, 720, 1280)).toBe(false);
    expect(needsResize(800, 600, 1280)).toBe(false);
  });
});

describe("pickOutputFormat", () => {
  test("WebPエンコード対応時はimage/webpを選ぶ", () => {
    expect(pickOutputFormat("image/jpeg", true)).toEqual({ type: "image/webp", extension: "webp" });
    expect(pickOutputFormat("image/png", true)).toEqual({ type: "image/webp", extension: "webp" });
  });

  test("WebP非対応時は元フォーマット(jpeg)にフォールバックする", () => {
    expect(pickOutputFormat("image/jpeg", false)).toEqual({ type: "image/jpeg", extension: "jpg" });
  });

  test("WebP非対応時は元フォーマット(png)にフォールバックする", () => {
    expect(pickOutputFormat("image/png", false)).toEqual({ type: "image/png", extension: "png" });
  });

  test("WebP非対応かつ未知のtypeのときはjpegにフォールバックする", () => {
    expect(pickOutputFormat("image/heic", false)).toEqual({ type: "image/jpeg", extension: "jpg" });
  });
});

import { describe, expect, it } from "bun:test";

import { isWebglAvailable } from "@/lib/webgl";

describe("isWebglAvailable", () => {
  it("returns false when the environment cannot create a WebGL context (#919)", () => {
    // happy-dom (this test environment) has no WebGL support: window has no
    // WebGLRenderingContext and canvas.getContext() returns null, so this
    // exercises the real "unsupported" path without any mocking.
    expect(isWebglAvailable()).toBe(false);
  });

  it("returns true when webgl2 context creation succeeds", () => {
    const originalWebglCtor = window.WebGLRenderingContext;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error -- stubbing a browser global that happy-dom omits.
    window.WebGLRenderingContext = class {};
    // @ts-expect-error -- narrow test stub, not a full CanvasRenderingContext.
    HTMLCanvasElement.prototype.getContext = (type: string) => (type === "webgl2" ? {} : null);

    try {
      expect(isWebglAvailable()).toBe(true);
    } finally {
      window.WebGLRenderingContext = originalWebglCtor;
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it("returns false when getContext throws", () => {
    const originalWebglCtor = window.WebGLRenderingContext;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error -- stubbing a browser global that happy-dom omits.
    window.WebGLRenderingContext = class {};
    HTMLCanvasElement.prototype.getContext = () => {
      throw new Error("context creation failed");
    };

    try {
      expect(isWebglAvailable()).toBe(false);
    } finally {
      window.WebGLRenderingContext = originalWebglCtor;
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });
});

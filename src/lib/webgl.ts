/**
 * Detects whether the browser can create a WebGL rendering context.
 *
 * three.js's `WebGLRenderer` (used internally by `@react-three/fiber`'s
 * `Canvas`) throws when it cannot obtain a WebGL context (GPU blocklisted,
 * hardware acceleration disabled, a headless environment, etc.). That
 * construction happens inside an async effect deep inside `Canvas`, where
 * neither a React error boundary nor `Canvas`'s own `fallback` prop can
 * observe it — `fallback` only renders as native `<canvas>` fallback
 * content for browsers that don't support the `<canvas>` element at all,
 * which is a different (and today essentially nonexistent) failure mode.
 *
 * Checking context creation up front, before ever mounting `Canvas`, is the
 * reliable way to detect a WebGL initialization failure so callers can fall
 * back to a non-3D view instead.
 */
export const isWebglAvailable = (): boolean => {
  try {
    const canvas = window.document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
};

import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, test } from "bun:test";

import { classifyInventoryChatError } from "@/hooks/useInventoryChat";

describe("classifyInventoryChatError", () => {
  test("classifies a 400 response as 'tooLong'", () => {
    const error = new FunctionsHttpError(new Response(null, { status: 400 }));
    expect(classifyInventoryChatError(error)).toBe("tooLong");
  });

  test("classifies a 401 response as 'unauthorized'", () => {
    const error = new FunctionsHttpError(new Response(null, { status: 401 }));
    expect(classifyInventoryChatError(error)).toBe("unauthorized");
  });

  test("classifies other HTTP statuses (e.g. 502) as 'generic'", () => {
    const error = new FunctionsHttpError(new Response(null, { status: 502 }));
    expect(classifyInventoryChatError(error)).toBe("generic");
  });

  test("classifies non-HTTP errors (e.g. network failure) as 'generic'", () => {
    expect(classifyInventoryChatError(new Error("network down"))).toBe("generic");
    expect(classifyInventoryChatError(null)).toBe("generic");
  });
});

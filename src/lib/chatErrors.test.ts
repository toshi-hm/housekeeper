import { describe, expect, test } from "bun:test";

import { classifyChatError } from "@/lib/chatErrors";

class FunctionsHttpError extends Error {
  context: Response;
  constructor(context: Response) {
    super("Edge Function returned a non-2xx status code");
    this.name = "FunctionsHttpError";
    this.context = context;
  }
}

class FunctionsFetchError extends Error {
  context: unknown;
  constructor(context: unknown) {
    super("Failed to send a request to the Edge Function");
    this.name = "FunctionsFetchError";
    this.context = context;
  }
}

describe("classifyChatError", () => {
  test("classifies the 400 message-too-long response as tooLong", async () => {
    const response = new Response(JSON.stringify({ error: "message is too long" }), {
      status: 400,
    });
    const kind = await classifyChatError(new FunctionsHttpError(response));
    expect(kind).toBe("tooLong");
  });

  test("classifies a 401 response as unauthorized", async () => {
    const response = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const kind = await classifyChatError(new FunctionsHttpError(response));
    expect(kind).toBe("unauthorized");
  });

  test("classifies a 401 response as unauthorized even without a JSON body", async () => {
    const response = new Response(null, { status: 401 });
    const kind = await classifyChatError(new FunctionsHttpError(response));
    expect(kind).toBe("unauthorized");
  });

  test("classifies a different 400 body as temporary, not tooLong", async () => {
    const response = new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
    });
    const kind = await classifyChatError(new FunctionsHttpError(response));
    expect(kind).toBe("temporary");
  });

  test("classifies a 502 ai_error response as temporary", async () => {
    const response = new Response(JSON.stringify({ error: "ai_error" }), { status: 502 });
    const kind = await classifyChatError(new FunctionsHttpError(response));
    expect(kind).toBe("temporary");
  });

  test("classifies a 504 timeout response as temporary", async () => {
    const response = new Response(JSON.stringify({ error: "timeout" }), { status: 504 });
    const kind = await classifyChatError(new FunctionsHttpError(response));
    expect(kind).toBe("temporary");
  });

  test("classifies a network error (no Response context) as temporary", async () => {
    const kind = await classifyChatError(new FunctionsFetchError(new TypeError("Failed to fetch")));
    expect(kind).toBe("temporary");
  });

  test("classifies an unrelated thrown value as temporary", async () => {
    const kind = await classifyChatError(new Error("boom"));
    expect(kind).toBe("temporary");
  });

  test("classifies a non-JSON 400 body as temporary", async () => {
    const response = new Response("not json", { status: 400 });
    const kind = await classifyChatError(new FunctionsHttpError(response));
    expect(kind).toBe("temporary");
  });

  test("classifies a plain non-Error value as temporary", async () => {
    const kind = await classifyChatError("boom");
    expect(kind).toBe("temporary");
  });
});

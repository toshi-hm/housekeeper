import { describe, expect, test } from "bun:test";

import { createSupabaseMock } from "@/test/supabaseMock";

describe("createSupabaseMock", () => {
  test("チェーンメソッドを記録し FIFO キューから応答する", async () => {
    const sb = createSupabaseMock();
    sb.enqueue("items", { data: [{ id: "a" }] }, { data: { id: "b" } });

    const first = await sb.supabase
      .from("items")
      .select("*")
      .neq("id", "x")
      .gt("units", 0)
      .lt("units", 10)
      .gte("units", 1)
      .lte("units", 9)
      .in("id", ["a"])
      .or("name.eq.a")
      .range(0, 10);
    expect(first.data).toEqual([{ id: "a" }]);

    const second = await sb.supabase.from("items").select("*").single();
    expect(second.data).toEqual({ id: "b" });

    // キューが空なら既定応答
    const third = await sb.supabase.from("items").delete().maybeSingle();
    expect(third).toEqual({ data: null, error: null, count: 0 });

    const recorded = sb.queriesFor("items");
    expect(recorded).toHaveLength(3);
    expect(recorded[0]?.ops.map((op) => op.method)).toContain("neq");
  });

  test("auth / functions / storage / channel の各モックが動作する", async () => {
    const sb = createSupabaseMock();

    // auth
    expect((await sb.supabase.auth.getUser()).data.user).toEqual({ id: "user-1" });
    sb.setUser({ id: "user-2" });
    sb.setUserError({ message: "auth error" });
    const userResult = await sb.supabase.auth.getUser();
    expect(userResult.data.user).toEqual({ id: "user-2" });
    expect(userResult.error).toEqual({ message: "auth error" });

    // functions
    sb.setInvokeResponse({ data: { ok: true }, error: null });
    const invoked = await sb.supabase.functions.invoke("fn", { body: { a: 1 } });
    expect(invoked.data).toEqual({ ok: true });
    expect(sb.invokeCalls[0]).toEqual({ name: "fn", body: { a: 1 } });

    sb.setInvokeRejection(new Error("boom"));
    await expect(sb.supabase.functions.invoke("fn")).rejects.toThrow("boom");
    sb.setInvokeRejection(null);

    // storage
    sb.setSignedUrlResponse({ data: { signedUrl: "https://s.example/x" }, error: null });
    sb.setUploadResponse({ error: { message: "up" } });
    sb.setRemoveResponse({ error: { message: "rm" } });
    const bucket = sb.supabase.storage.from("item-images");
    expect((await bucket.createSignedUrl("p", 60)).data?.signedUrl).toBe("https://s.example/x");
    expect((await bucket.upload("p", "f")).error?.message).toBe("up");
    expect((await bucket.remove(["p"])).error?.message).toBe("rm");
    expect(sb.storageCalls).toHaveLength(3);

    // channel
    const handler = () => {};
    const channel = sb.supabase.channel("test");
    channel.on("postgres_changes", {}, handler).subscribe();
    expect(sb.channelHandlers).toHaveLength(1);
    await sb.supabase.removeChannel();
    expect(sb.getRemoveChannelCount()).toBe(1);

    // reset で全て初期化される
    sb.reset();
    expect(sb.queries).toHaveLength(0);
    expect(sb.invokeCalls).toHaveLength(0);
    expect(sb.storageCalls).toHaveLength(0);
    expect(sb.channelHandlers).toHaveLength(0);
    expect(sb.getRemoveChannelCount()).toBe(0);
    expect((await sb.supabase.auth.getUser()).data.user).toEqual({ id: "user-1" });
  });
});

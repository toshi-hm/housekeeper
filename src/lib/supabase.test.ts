import { describe, expect, test } from "bun:test";

// 実モジュールを import する (env は .env.test で供給される)。
// 環境変数が揃っているのに throw する退行を検知する。
import { supabase } from "@/lib/supabase";

describe("supabase クライアント初期化", () => {
  test("環境変数が揃っていればクライアントが生成される", () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");
    expect(typeof supabase.channel).toBe("function");
    expect(supabase.functions).toBeDefined();
    expect(supabase.storage).toBeDefined();
  });
});

import { supabase } from "@/lib/supabase";

/**
 * 消費・廃棄操作（consumeLot / bulkConsumeItems）の後に呼び出す。
 * 対象アイテムが `auto_reorder = true` かつ在庫数が `reorder_threshold`
 * （未設定の場合は 0）以下になっていれば、`shopping_list_items` に
 * planned 行を自動追加する（#353）。
 *
 * 重複防止のため、追加前に同一 `linked_item_id` を持つ planned 行が
 * 既に存在しないかを確認する（shopping_list_items に一意制約はないため、
 * アプリ側でチェックしてから insert する。#522/#447 の重複防止ロジックと同様の方針）。
 *
 * 在庫更新自体は既に成功しているため、この処理の失敗を消費操作全体の
 * 失敗として扱わない（コンソール警告のみ・非致命）。
 */
export const maybeAutoReorder = async (itemId: string): Promise<boolean> => {
  try {
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("id, user_id, name, units, auto_reorder, reorder_threshold")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item || !item.auto_reorder) return false;

    const threshold = item.reorder_threshold ?? 0;
    if (item.units > threshold) return false;

    const { data: existing, error: existingError } = await supabase
      .from("shopping_list_items")
      .select("id")
      .eq("linked_item_id", item.id)
      .eq("status", "planned")
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return false;

    const { error: insertError } = await supabase.from("shopping_list_items").insert({
      user_id: item.user_id,
      name: item.name,
      desired_units: 1,
      linked_item_id: item.id,
    });
    if (insertError) throw insertError;

    return true;
  } catch (err) {
    // Non-fatal: stock update already succeeded. Auto-add to the shopping
    // list failing shouldn't break the consume operation (#353).
    // oxlint-disable-next-line no-console
    console.warn("maybeAutoReorder failed", err);
    return false;
  }
};

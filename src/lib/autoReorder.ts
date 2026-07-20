import { supabase } from "@/lib/supabase";

/**
 * 消費・廃棄操作（consumeLot / bulkConsumeItems）の後に呼び出す。
 * 対象アイテムが `auto_reorder = true` かつ在庫数が `reorder_threshold`
 * （未設定の場合は 0）以下になっていれば、`shopping_list_items` に
 * planned 行を自動追加する（#353）。
 *
 * planned + linked_item_id の部分一意indexが、手動追加や別端末との競合を含めて
 * 重複を防ぐ。一意制約競合は「既に追加済み」として正常終了する。
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

    const { error: insertError } = await supabase.from("shopping_list_items").insert({
      user_id: item.user_id,
      name: item.name,
      desired_units: 1,
      linked_item_id: item.id,
      auto_added: true,
    });
    if (insertError?.code === "23505") return false;
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

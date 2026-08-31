import { findDuplicatePlannedItem } from "@/lib/shoppingDuplicates";
import { supabase } from "@/lib/supabase";
import { getLotRemainingAmount } from "@/types/item";
import type { ShoppingItem } from "@/types/shopping";
import { computeConsumptionPaceForecast } from "@/types/stats";

/** #952: desired_units の加算マージで楽観的排他制御が競合し続けた場合に
 *  諦めるまでの最大試行回数。 */
const MAX_MERGE_ATTEMPTS = 3;

/**
 * 対象アイテムの既存 planned 行の中から `findDuplicatePlannedItem` と同じ基準
 * （同一 linked_item_id、または同名）で重複行を探し、見つかれば
 * `desired_units` をインクリメントして統合する。手動追加（`upsertShoppingItem`）
 * と同じ重複統合ロジックを使うことで、自由入力済みの同名手動行に対しても
 * 別行として二重追加しない（#829）。
 *
 * #952: `desired_units` の加算は「直前に読んだ値」を前提にした絶対値の書き込みの
 * ため、`.eq("desired_units", <直前に読んだ値>)` を条件に付けた楽観的排他制御を行う。
 * 例えば bulkConsumeItems が同名・auto_reorder有効の複数アイテムに対して
 * `Promise.all(ids.map((id) => maybeAutoReorder(id)))` で並列発火した場合、両方が
 * 同じ行の同じ desired_units を読んでしまい、条件に一致する行が0件になる。その場合は
 * 最新の行を再取得し、その値を基準に増分を計算し直してリトライする（23505 競合時の
 * リトライパターンと同様）。
 */
const mergeAutoReorderRow = async (
  userId: string,
  itemId: string,
  name: string,
): Promise<ShoppingItem | null> => {
  const { data: plannedRows, error: plannedError } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "planned");
  if (plannedError) throw plannedError;

  let duplicate = findDuplicatePlannedItem((plannedRows ?? []) as ShoppingItem[], {
    name,
    linked_item_id: itemId,
  });
  if (!duplicate) return null;

  for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .update({
        desired_units: duplicate.desired_units + 1,
        linked_item_id: duplicate.linked_item_id ?? itemId,
        auto_added: true,
      })
      .eq("id", duplicate.id)
      .eq("desired_units", duplicate.desired_units)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return data as ShoppingItem;

    // desired_units が読み取り時から変わっていた(並行マージがあった)ため、
    // 最新の行を再取得して増分を計算し直す。
    const { data: refreshed, error: refreshError } = await supabase
      .from("shopping_list_items")
      .select("*")
      .eq("id", duplicate.id)
      .maybeSingle();
    if (refreshError) throw refreshError;
    // 再取得中に行自体が削除された場合は統合対象が消えたとみなし、
    // 呼び出し元の通常の新規insertパスに委ねる。
    if (!refreshed) return null;
    duplicate = refreshed as ShoppingItem;
  }

  throw new Error("Failed to merge auto-reorder shopping list item: too many concurrent updates");
};

/**
 * 対象アイテムの `reorder_lead_days` が設定されている場合、直近の消費ログから
 * `computeConsumptionPaceForecast` で予測残日数を算出し、`reorder_lead_days`
 * 以内かどうかを返す（#853）。`reorder_lead_days` が未設定（null）なら
 * ログを取得するまでもなく false（＝個数しきい値のみで判定する既存挙動）。
 */
const isPaceBasedReorderDue = async (item: {
  id: string;
  units: number;
  content_amount: number;
  content_unit: string;
  opened_remaining: number | null;
  reorder_lead_days: number | null | undefined;
}): Promise<boolean> => {
  if (item.reorder_lead_days === null || item.reorder_lead_days === undefined) return false;

  const { data: logs, error: logsError } = await supabase
    .from("consumption_logs")
    .select("delta_amount, delta_unit, occurred_at")
    .eq("item_id", item.id)
    .order("occurred_at", { ascending: false });
  if (logsError) throw logsError;

  const currentStock = getLotRemainingAmount(
    item.units,
    item.content_amount,
    item.opened_remaining,
  );
  const forecast = computeConsumptionPaceForecast(logs ?? [], currentStock, item.content_unit);
  return (
    forecast.predictedRemainingDays !== null &&
    forecast.predictedRemainingDays <= item.reorder_lead_days
  );
};

/**
 * 消費・廃棄操作（consumeLot / bulkConsumeItems）の後に呼び出す。
 * 対象アイテムが `auto_reorder = true` で、かつ次の**いずれか**を満たせば
 * `shopping_list_items` に planned 行を自動追加する（#353, #853）。
 *
 * 1. 在庫数が `reorder_threshold`（未設定の場合は 0）以下（個数しきい値、#353）
 * 2. `reorder_lead_days` が設定されていて、`computeConsumptionPaceForecast` の
 *    予測残日数がその値以下（消費ペース予測、#853）。個数はまだ残っていても
 *    減りが速いアイテムを取りこぼさないための補完条件。`reorder_lead_days` が
 *    未設定のアイテムは従来通り 1. のみで判定する。
 *
 * 追加前に `mergeAutoReorderRow` で同名/同一linked_item_idのplanned行が
 * 既にないか確認し、あれば新規行を作らず統合する（#829: 自由入力済みの
 * 同名手動行と重複してしまう問題の修正）。それでも select と insert の間の
 * 競合で一意制約違反（23505）が起きた場合は、統合をもう一度試みる。
 *
 * 在庫更新自体は既に成功しているため、この処理の失敗を消費操作全体の
 * 失敗として扱わない（コンソール警告のみ・非致命）。
 */
export const maybeAutoReorder = async (itemId: string): Promise<boolean> => {
  try {
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select(
        "id, user_id, name, units, content_amount, content_unit, opened_remaining, auto_reorder, reorder_threshold, reorder_lead_days",
      )
      .eq("id", itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item || !item.auto_reorder) return false;

    const threshold = item.reorder_threshold ?? 0;
    const thresholdDue = item.units <= threshold;
    const paceDue = thresholdDue ? false : await isPaceBasedReorderDue(item);
    if (!thresholdDue && !paceDue) return false;

    const merged = await mergeAutoReorderRow(item.user_id, item.id, item.name);
    if (merged) return true;

    const { error: insertError } = await supabase.from("shopping_list_items").insert({
      user_id: item.user_id,
      name: item.name,
      desired_units: 1,
      linked_item_id: item.id,
      auto_added: true,
    });
    if (insertError?.code === "23505") {
      const mergedAfterConflict = await mergeAutoReorderRow(item.user_id, item.id, item.name);
      return mergedAfterConflict !== null;
    }
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

import { z } from "zod";

import { itemFormSchema, type ItemFormValues } from "@/types/item";

const STORAGE_KEY_PREFIX = "housekeeper:itemFormDraft:";

/**
 * #672: ItemForm の入力中の値を localStorage に下書き保存する
 * （ネットワーク失敗・タブ誤操作・ブラウザクラッシュ時の救済、PLANS.md §7.4）。
 *
 * `values`（ItemFormValues）に加え、`units`/`content_amount` は送信時にしか
 * 数値へパースされない生の文字列入力（`unitsRaw`/`contentAmountRaw`）を別途
 * 保持することで、送信直前まで入力途中の内容を正確に復元できるようにする。
 */
const draftPayloadSchema = z.object({
  values: itemFormSchema,
  unitsRaw: z.string(),
  contentAmountRaw: z.string(),
});

export interface ItemFormDraftPayload {
  values: ItemFormValues;
  unitsRaw: string;
  contentAmountRaw: string;
}

export interface ItemFormDraft {
  savedAt: string;
  payload: ItemFormDraftPayload;
}

const draftEnvelopeSchema = z.object({
  savedAt: z.string(),
  payload: draftPayloadSchema,
});

export const saveItemFormDraft = (draftKey: string, payload: ItemFormDraftPayload): void => {
  const envelope: ItemFormDraft = { savedAt: new Date().toISOString(), payload };
  localStorage.setItem(STORAGE_KEY_PREFIX + draftKey, JSON.stringify(envelope));
};

/** 保存済みの下書きを読み込む。存在しない・壊れている（他バージョンの形式等）場合は null。 */
export const loadItemFormDraft = (draftKey: string): ItemFormDraft | null => {
  const raw = localStorage.getItem(STORAGE_KEY_PREFIX + draftKey);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = draftEnvelopeSchema.safeParse(parsed);
  return result.success ? result.data : null;
};

export const clearItemFormDraft = (draftKey: string): void => {
  localStorage.removeItem(STORAGE_KEY_PREFIX + draftKey);
};

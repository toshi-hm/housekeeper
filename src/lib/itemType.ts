import { ITEM_TYPES, type ItemType } from "@/types/item";

/** 種別ラベルの i18n キー（`items` 名前空間）。CLAUDE.md「i18n キーの動的参照ルール」に
 *  従い、テンプレートリテラル連結ではなく Key Map 経由で参照する。 */
export const itemTypeLabelKey = {
  food: "itemTypeFood",
  daily_goods: "itemTypeDailyGoods",
} as const satisfies Record<ItemType, string>;

/** ダッシュボードの種別タブ。"all" は絞り込みなし（従来の一覧と同じ）。 */
export const ITEM_TYPE_TABS = ["all", ...ITEM_TYPES] as const;
export type ItemTypeTab = (typeof ITEM_TYPE_TABS)[number];

export const itemTypeTabLabelKey = {
  all: "itemTypeTabAll",
  ...itemTypeLabelKey,
} as const satisfies Record<ItemTypeTab, string>;

/** URL の search param（任意の文字列）を有効なタブ値に丸める。
 *  不正値や未指定は "all"（従来どおり全件表示）に落とす。 */
export const parseItemTypeTab = (value: string | undefined): ItemTypeTab =>
  (ITEM_TYPE_TABS as readonly string[]).includes(value ?? "") ? (value as ItemTypeTab) : "all";

export const itemTypeTabId = (tab: ItemTypeTab) => `item-type-tab-${tab}`;
export const itemTypeTabPanelId = (tab: ItemTypeTab) => `${itemTypeTabId(tab)}-panel`;

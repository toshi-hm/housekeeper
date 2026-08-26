import { useTranslation } from "react-i18next";

import { useRovingTabs } from "@/hooks/useRovingTabs";
import {
  ITEM_TYPE_TABS,
  type ItemTypeTab,
  itemTypeTabId,
  itemTypeTabLabelKey,
  itemTypeTabPanelId,
} from "@/lib/itemType";

interface ItemTypeTabsProps {
  value: ItemTypeTab;
  /** 各タブを選んだときに表示される件数。タブ側の表示と実際の一覧件数を一致させるため、
   *  呼び出し側で他の絞り込みを適用したあとの集合から数えて渡すこと。 */
  counts: Record<ItemTypeTab, number>;
  onChange: (tab: ItemTypeTab) => void;
}

/**
 * 「すべて / 食料品 / 日用品」でダッシュボードの一覧を切り替えるタブ
 * （docs/specs/features/item-type.md）。docs/specs/accessibility.md §5 に従い
 * `useRovingTabs` で WAI-ARIA tabs パターン（矢印キー移動 + roving tabindex）に
 * 沿わせる。対応する `role="tabpanel"` は呼び出し側（一覧側）が
 * {@link itemTypeTabPanelId} / {@link itemTypeTabId} を使って組み立てる。
 */
export const ItemTypeTabs = ({ value, counts, onChange }: ItemTypeTabsProps) => {
  const { t } = useTranslation("items");
  const { tablistProps, getTabProps } = useRovingTabs(ITEM_TYPE_TABS, value, onChange);

  return (
    <div
      className="flex rounded-lg border p-1"
      role="tablist"
      aria-label={t("itemTypeTabsLabel")}
      {...tablistProps}
    >
      {ITEM_TYPE_TABS.map((tab) => (
        <button
          key={tab}
          id={itemTypeTabId(tab)}
          role="tab"
          aria-selected={value === tab}
          aria-controls={itemTypeTabPanelId(tab)}
          {...getTabProps(tab)}
          className={`min-h-11 flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
            value === tab
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(tab)}
        >
          {t(itemTypeTabLabelKey[tab])} ({counts[tab]})
        </button>
      ))}
    </div>
  );
};

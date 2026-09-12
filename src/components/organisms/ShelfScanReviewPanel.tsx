import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useBulkItemAction } from "@/hooks/useItems";
import type { ShelfScanMatchItem } from "@/lib/shelfScanMatch";

export interface ShelfScanReviewPanelProps {
  /** システム上にあるが、写真に写っていなかった既存アイテム（食べきった？候補）。 */
  possiblyConsumed: ShelfScanMatchItem[];
  /** 写真に写っていたが、システムに未登録の商品名候補。 */
  possiblyUnregistered: string[];
}

/**
 * シェルフスキャンの差分候補レビュー画面（`ReceiptReviewPanel`と同様のレビュー
 * 画面パターン、shelf-scan.md「画面」節）。
 *
 * - 「食べきった？候補」は複数選択して一括で消費済み（`units=0`）扱いにできる。
 *   確定操作は必ずユーザーのチェック+ボタン押下を経由し、写真1枚だけで自動的に
 *   在庫を変更することはない（shelf-scan.md「やらないこと」節）。既存の
 *   `useBulkItemAction`（`action: "consume"`、ダッシュボードの一括操作と同じ
 *   `bulk_consume_items` RPCへ委譲）をそのまま再利用し、消費ロジック自体は
 *   再実装しない。
 * - 「未登録候補」は個数・内容量の推定をせず、既存の新規登録フォーム
 *   （`/items/new`）への遷移導線のみを提供する。認識済みの商品名のみ
 *   `prefillName` クエリパラメータで引き継ぎ、個数・内容量等の詳細は
 *   引き続き手入力に委ねる（shelf-scan.md「やらないこと」節、#1027）。
 */
export const ShelfScanReviewPanel = ({
  possiblyConsumed,
  possiblyUnregistered,
}: ShelfScanReviewPanelProps) => {
  const { t } = useTranslation("shelfScan");
  const bulkAction = useBulkItemAction();

  // 一括消費に成功したアイテムはこの一覧から取り除く（#923のReceiptReviewPanel
  // と同様、ミューテーション成功後にローカルの表示状態だけ更新する）。
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visibleConsumedCandidates = possiblyConsumed.filter((item) => !handledIds.has(item.id));
  const allSelected =
    visibleConsumedCandidates.length > 0 && selectedIds.size === visibleConsumedCandidates.length;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(visibleConsumedCandidates.map((i) => i.id)));
  };

  const handleMarkConsumed = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      await bulkAction.mutateAsync({ action: "consume", ids });
      setHandledIds((prev) => new Set([...prev, ...ids]));
      setSelectedIds(new Set());
    } catch {
      // Error toast is handled by useBulkItemAction's onError
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t("possiblyConsumedTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("possiblyConsumedHint")}</p>
        </div>

        {visibleConsumedCandidates.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("possiblyConsumedEmpty")}
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded"
              />
              {t("selectAll")}
            </label>
            <ul className="space-y-2">
              {visibleConsumedCandidates.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <label className="flex flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              disabled={selectedIds.size === 0 || bulkAction.isPending}
              onClick={() => void handleMarkConsumed()}
            >
              {bulkAction.isPending
                ? t("markConsumedPending")
                : t("markConsumed", { count: selectedIds.size })}
            </Button>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t("possiblyUnregisteredTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("possiblyUnregisteredHint")}</p>
        </div>

        {possiblyUnregistered.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("possiblyUnregisteredEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {possiblyUnregistered.map((name, index) => (
              <li
                key={`${name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span className="text-sm">{name}</span>
                <Link to="/items/new" search={{ prefillName: name }}>
                  <Button size="sm" variant="outline">
                    {t("registerNew")}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

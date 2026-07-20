import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAllConsumptionLogs } from "@/hooks/useConsumptionLogs";
import { useAllItemLots } from "@/hooks/useItemLots";
import { useItems, useItemsForExport } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import {
  buildConsumptionHistoryRows,
  buildExportFilename,
  buildPurchaseHistoryRows,
  downloadTextFile,
  type ExportPeriod,
  filterHistoryRowsByPeriod,
  historyRowsToCSV,
  itemsToCSV,
  itemsToJSON,
} from "@/lib/export";
import { useToast } from "@/lib/toast-context";

type HistoryTarget = "consumption" | "purchase" | "both";

/** 設定ページの「データのエクスポート」セクション（#66 / #358 / #381）。
 *  在庫データを CSV / JSON で、消費・購入履歴を CSV でクライアントサイドのみで書き出す。 */
export const DataExportPanel = () => {
  const { t } = useTranslation("settings");
  const { toast } = useToast();

  const itemsQuery = useItems({}, "created_at");
  const categoriesQuery = useCategories();
  const locationsQuery = useStorageLocations();
  const { data: items = [] } = itemsQuery;
  const { data: categories = [] } = categoriesQuery;
  const { data: locations = [] } = locationsQuery;

  const itemLookupsQuery = useItemsForExport();
  const consumptionLogsQuery = useAllConsumptionLogs();
  const purchaseLotsQuery = useAllItemLots();
  const { data: itemLookups = [] } = itemLookupsQuery;
  const { data: consumptionLogs = [] } = consumptionLogsQuery;
  const { data: purchaseLots = [] } = purchaseLotsQuery;

  const [period, setPeriod] = useState<ExportPeriod>("30d");
  const [target, setTarget] = useState<HistoryTarget>("both");

  const itemLookupMap = useMemo(() => new Map(itemLookups.map((i) => [i.id, i])), [itemLookups]);
  const categoryNameMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const itemsPending =
    itemsQuery.isPending || categoriesQuery.isPending || locationsQuery.isPending;
  const itemsFailed = itemsQuery.isError || categoriesQuery.isError || locationsQuery.isError;
  const historyPending =
    itemLookupsQuery.isPending ||
    categoriesQuery.isPending ||
    consumptionLogsQuery.isPending ||
    purchaseLotsQuery.isPending;
  const historyFailed =
    itemLookupsQuery.isError ||
    categoriesQuery.isError ||
    consumptionLogsQuery.isError ||
    purchaseLotsQuery.isError;

  const showExportError = () => toast(t("common:unknownError"), "error");

  const handleExportItemsCsv = () => {
    if (itemsFailed) {
      showExportError();
      return;
    }
    const csv = itemsToCSV(items, categories, locations);
    downloadTextFile(csv, buildExportFilename("items", "csv"), "text/csv;charset=utf-8");
    toast(t("exportSuccess"), "success");
  };

  const handleExportItemsJson = () => {
    if (itemsFailed) {
      showExportError();
      return;
    }
    const json = itemsToJSON(items);
    downloadTextFile(json, buildExportFilename("items", "json"), "application/json");
    toast(t("exportSuccess"), "success");
  };

  const handleExportHistoryCsv = () => {
    if (historyFailed) {
      showExportError();
      return;
    }
    const rows = [
      ...(target !== "purchase"
        ? buildConsumptionHistoryRows(consumptionLogs, itemLookupMap, categoryNameMap)
        : []),
      ...(target !== "consumption"
        ? buildPurchaseHistoryRows(purchaseLots, itemLookupMap, categoryNameMap)
        : []),
    ];
    const filtered = filterHistoryRowsByPeriod(rows, period);
    const csv = historyRowsToCSV(filtered);
    downloadTextFile(csv, buildExportFilename("history", "csv"), "text/csv;charset=utf-8");
    toast(t("exportSuccess"), "success");
  };

  return (
    <div className="space-y-4">
      {/* Items export */}
      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">{t("exportItems")}</p>
          <p className="text-xs text-muted-foreground">{t("exportItemsDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={itemsPending}
            onClick={handleExportItemsCsv}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t("exportDownloadCsv")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={itemsPending}
            onClick={handleExportItemsJson}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t("exportDownloadJson")}
          </Button>
        </div>
      </div>

      {/* Consumption / purchase history export */}
      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">{t("exportHistory")}</p>
          <p className="text-xs text-muted-foreground">{t("exportHistoryDescription")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="export-history-period">{t("exportPeriod")}</Label>
            <Select
              id="export-history-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as ExportPeriod)}
            >
              <option value="30d">{t("exportPeriodLast30Days")}</option>
              <option value="90d">{t("exportPeriodLast3Months")}</option>
              <option value="all">{t("exportPeriodAllTime")}</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="export-history-target">{t("exportTarget")}</Label>
            <Select
              id="export-history-target"
              value={target}
              onChange={(e) => setTarget(e.target.value as HistoryTarget)}
            >
              <option value="both">{t("exportTargetBoth")}</option>
              <option value="consumption">{t("exportTargetConsumption")}</option>
              <option value="purchase">{t("exportTargetPurchase")}</option>
            </Select>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={historyPending}
          onClick={handleExportHistoryCsv}
        >
          <Download className="mr-1.5 h-4 w-4" />
          {t("exportDownloadCsv")}
        </Button>
      </div>
    </div>
  );
};

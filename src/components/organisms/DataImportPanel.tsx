import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { type ImportDuplicateStrategy, useImportItems } from "@/hooks/useImportItems";
import {
  type ImportItemInput,
  ImportParseError,
  type ImportParseErrorReason,
  jsonToItems,
} from "@/lib/export";
import { useToast } from "@/lib/toast-context";

const importErrorKey = {
  invalid_json: "importErrorInvalidJson",
  invalid_format: "importErrorInvalidFormat",
} as const satisfies Record<ImportParseErrorReason, string>;

/** 設定ページの「データのインポート（復元）」セクション（#657）。
 *  `DataExportPanel` が生成した JSON バックアップを読み込み、在庫を復元する。
 *  カテゴリ・保管場所は別プロジェクトでは無効な参照になり得るため復元対象に含めない。 */
export const DataImportPanel = () => {
  const { t } = useTranslation("settings");
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const importItems = useImportItems();

  const [parsedItems, setParsedItems] = useState<ImportItemInput[] | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<ImportDuplicateStrategy>("skip");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const items = jsonToItems(text);
      setParsedItems(items);
    } catch (err) {
      setParsedItems(null);
      const reason = err instanceof ImportParseError ? err.reason : "invalid_format";
      toast(t(importErrorKey[reason]), "error");
    }
  };

  const handleConfirmImport = () => {
    if (!parsedItems) return;
    importItems.mutate(
      { items: parsedItems, duplicateStrategy },
      {
        onSuccess: (result) => {
          toast(
            t("importSuccess", {
              created: result.createdCount,
              updated: result.updatedCount,
              skipped: result.skippedCount,
            }),
            "success",
          );
          setParsedItems(null);
          setShowConfirm(false);
        },
      },
    );
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">{t("importDataSection")}</p>
        <p className="text-xs text-muted-foreground">{t("importDescription")}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void handleFileChange(e);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={importItems.isPending}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        {t("importSelectFile")}
      </Button>

      {parsedItems && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <p className="text-sm">{t("importPreviewCount", { count: parsedItems.length })}</p>
          <div className="space-y-1">
            <Label htmlFor="import-duplicate-strategy">{t("importDuplicateStrategy")}</Label>
            <Select
              id="import-duplicate-strategy"
              value={duplicateStrategy}
              onChange={(e) => setDuplicateStrategy(e.target.value as ImportDuplicateStrategy)}
            >
              <option value="skip">{t("importDuplicateSkip")}</option>
              <option value="overwrite">{t("importDuplicateOverwrite")}</option>
              <option value="duplicate">{t("importDuplicateAdd")}</option>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={parsedItems.length === 0 || importItems.isPending}
            onClick={() => setShowConfirm(true)}
          >
            {t("importConfirmButton")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        title={t("importConfirmTitle")}
        message={t("importConfirmMessage", { count: parsedItems?.length ?? 0 })}
        confirmLabel={t("importConfirmButton")}
        variant="default"
        isConfirming={importItems.isPending}
        onConfirm={handleConfirmImport}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
};

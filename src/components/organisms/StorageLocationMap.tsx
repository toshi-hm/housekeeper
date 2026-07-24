import { useTranslation } from "react-i18next";

import { LocationPin } from "@/components/atoms/LocationPin";

interface StorageLocationMapPin {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface StorageLocationMapListItem {
  id: string;
  name: string;
}

interface StorageLocationMapProps {
  photoUrl?: string | null;
  pinnedItems?: StorageLocationMapPin[];
  /** 写真がない、またはピン未設定のアイテム。視覚に依存しないフォールバックとして必ず表示する（#574）。 */
  unpinnedItems?: StorageLocationMapListItem[];
  onItemClick?: (itemId: string) => void;
}

/** 保管場所の写真上にアイテムのピンを重ねて表示する「収納マップ」（#574）。
 *  写真が未登録、または位置未指定のアイテムのために、常にリスト表示を併設し
 *  視覚に依存しないアクセスを担保する。 */
export const StorageLocationMap = ({
  photoUrl,
  pinnedItems = [],
  unpinnedItems = [],
  onItemClick,
}: StorageLocationMapProps) => {
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-3">
      {photoUrl ? (
        <div className="relative w-full overflow-hidden rounded-lg border">
          <img src={photoUrl} alt="" className="block w-full" />
          {pinnedItems.map((pin) => (
            <LocationPin
              key={pin.id}
              x={pin.x}
              y={pin.y}
              label={pin.name}
              onClick={onItemClick ? () => onItemClick(pin.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("locationMapNoPhoto")}</p>
      )}

      {unpinnedItems.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("locationMapUnpinnedItems")}</p>
          <ul className="divide-y rounded-lg border">
            {unpinnedItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full p-2 text-left text-sm hover:bg-muted/50"
                  onClick={onItemClick ? () => onItemClick(item.id) : undefined}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

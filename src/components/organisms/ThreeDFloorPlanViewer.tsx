import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorBoundary } from "@/components/atoms/ErrorBoundary";
import { isWebglAvailable } from "@/lib/webgl";
import type {
  FloorPlanDocument,
  FloorPlanItemPlacement,
  FloorPlanStorageLocationMarker,
} from "@/types/floorPlan";
import type { Item, StorageLocation } from "@/types/item";

interface ThreeDFloorPlanViewerProps {
  document: FloorPlanDocument;
  storageLocationMarkers?: FloorPlanStorageLocationMarker[];
  storageLocations?: StorageLocation[];
  placements?: FloorPlanItemPlacement[];
  items?: Item[];
  highlightedItemId?: string | null;
  onItemClick?: (itemId: string) => void;
  /**
   * 保管場所マーカーのクリック時に呼ばれる（2Dの `FloorPlanViewer` と同じ機能、#988）。
   * 未指定ならマーカー・一覧ともクリック不可のまま（表示のみ）にする。
   */
  onStorageLocationClick?: (storageLocationId: string) => void;
  /**
   * WebGL初期化に失敗した（またはCanvas描画中に例外が発生した）ときに一度だけ
   * 呼ばれる。呼び出し側はこれを2Dビュー(FloorPlanViewer)への自動切り替えに
   * 使う想定（docs/specs/features/floor-plan-map.md「WebGL初期化失敗:
   * 2DビューとDOMリストへ切り替える」）。
   */
  onWebglUnavailable?: () => void;
}

const itemById = (items: Item[]): Map<string, Item> =>
  new Map(items.map((item) => [item.id, item]));

const FloorPlanScene = ({
  document,
  storageLocationMarkers = [],
  placements = [],
  highlightedItemId = null,
  onItemClick,
  onStorageLocationClick,
}: ThreeDFloorPlanViewerProps) => (
  <>
    <ambientLight intensity={1.5} />
    <directionalLight position={[200, 400, 200]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[document.width / 2, 0, document.height / 2]}>
      <planeGeometry args={[document.width, document.height]} />
      <meshStandardMaterial color="#e5e7eb" />
    </mesh>
    {document.walls.map((wall) => {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      return (
        <mesh
          key={wall.id}
          position={[(wall.start.x + wall.end.x) / 2, 12, (wall.start.y + wall.end.y) / 2]}
          rotation={[0, -angle, 0]}
        >
          <boxGeometry args={[length, 24, wall.thickness]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      );
    })}
    {document.shapes.map((shape) => (
      <mesh
        key={shape.id}
        position={[shape.x + shape.width / 2, 18, shape.y + shape.height / 2]}
        rotation={[0, (-shape.rotation * Math.PI) / 180, 0]}
      >
        {shape.kind === "circle" ? (
          <cylinderGeometry args={[shape.width / 2, shape.width / 2, 36, 32]} />
        ) : (
          <boxGeometry args={[shape.width, 36, shape.height]} />
        )}
        <meshStandardMaterial color={shape.kind === "label" ? "#93c5fd" : "#60a5fa"} />
      </mesh>
    ))}
    {storageLocationMarkers.map((marker) => (
      <mesh
        key={marker.id}
        position={[marker.x, 48, marker.y]}
        onClick={
          onStorageLocationClick
            ? (event) => {
                event.stopPropagation();
                onStorageLocationClick(marker.storage_location_id);
              }
            : undefined
        }
      >
        <sphereGeometry args={[18, 24, 16]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
    ))}
    {placements.map((placement) => {
      const isHighlighted = placement.item_id === highlightedItemId;
      return (
        <mesh
          key={placement.id}
          position={[placement.x, 16, placement.y]}
          onClick={
            onItemClick
              ? (event) => {
                  event.stopPropagation();
                  onItemClick(placement.item_id);
                }
              : undefined
          }
        >
          <coneGeometry args={[14, 32, 16]} />
          <meshStandardMaterial color={isHighlighted ? "#dc2626" : "#2563eb"} />
        </mesh>
      );
    })}
    <OrbitControls target={[document.width / 2, 0, document.height / 2]} />
  </>
);

/**
 * Canvas配下(FloorPlanScene)のレンダリングが例外を投げた場合にErrorBoundaryが
 * 表示するfallback。マウント時に一度だけ`onWebglUnavailable`を呼び、
 * 呼び出し側での2Dビューへの自動切り替えを起動する。
 */
const CanvasErrorFallback = ({
  message,
  onWebglUnavailable,
}: {
  message: string;
  onWebglUnavailable?: () => void;
}) => {
  const onWebglUnavailableRef = useRef(onWebglUnavailable);
  useEffect(() => {
    onWebglUnavailableRef.current = onWebglUnavailable;
  });

  // StrictModeの開発時マウント→アンマウント→再マウントで二重に呼ばれないよう、
  // useAutoArchive.tsのhasRunRefと同じパターンで1回のマウントにつき1回だけ実行する。
  const hasRunRef = useRef(false);
  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    onWebglUnavailableRef.current?.();
  }, []);

  return <p className="p-4 text-sm text-muted-foreground">{message}</p>;
};

export const ThreeDFloorPlanViewer = ({
  document,
  storageLocationMarkers = [],
  storageLocations = [],
  placements = [],
  items = [],
  highlightedItemId = null,
  onItemClick,
  onStorageLocationClick,
  onWebglUnavailable,
}: ThreeDFloorPlanViewerProps) => {
  const { t } = useTranslation("common");
  const itemsById = itemById(items);
  // WebGLコンテキストを生成できるかは環境依存で変わらないため、マウント時に
  // 一度だけ判定する。生成できない場合はCanvasを一切マウントしない
  // (three.jsのWebGLRenderer構築失敗は非同期effect内で起きるため、Canvas自体の
  // fallbackやReactのエラーバウンダリでは検出できない。詳細はsrc/lib/webgl.ts)。
  const [webglSupported] = useState(isWebglAvailable);
  const onWebglUnavailableRef = useRef(onWebglUnavailable);
  useEffect(() => {
    onWebglUnavailableRef.current = onWebglUnavailable;
  });

  // StrictModeの開発時マウント→アンマウント→再マウントで二重に呼ばれないよう、
  // useAutoArchive.tsのhasRunRefと同じパターンで1回のマウントにつき1回だけ実行する。
  const hasRunRef = useRef(false);
  useEffect(() => {
    if (hasRunRef.current) return;
    if (!webglSupported) {
      hasRunRef.current = true;
      onWebglUnavailableRef.current?.();
    }
  }, [webglSupported]);

  return (
    <div className="space-y-2">
      <div className="h-[min(70vh,32rem)] min-h-72 overflow-hidden rounded-lg border bg-slate-100">
        {webglSupported ? (
          <ErrorBoundary
            fallback={
              <CanvasErrorFallback
                message={t("map3dFallback")}
                onWebglUnavailable={onWebglUnavailable}
              />
            }
          >
            <Canvas
              camera={{ position: [document.width / 2, document.height, document.height], fov: 45 }}
              fallback={<p className="p-4 text-sm text-muted-foreground">{t("map3dFallback")}</p>}
            >
              <FloorPlanScene
                document={document}
                storageLocationMarkers={storageLocationMarkers}
                placements={placements}
                highlightedItemId={highlightedItemId}
                onItemClick={onItemClick}
                onStorageLocationClick={onStorageLocationClick}
              />
            </Canvas>
          </ErrorBoundary>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t("map3dFallback")}</p>
        )}
      </div>
      {storageLocationMarkers.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label={t("mapStorageLocations")}>
          {storageLocationMarkers.map((marker) => (
            <li key={marker.id}>
              <button
                type="button"
                className="w-full p-3 text-left text-sm hover:bg-muted/50"
                onClick={
                  onStorageLocationClick
                    ? () => onStorageLocationClick(marker.storage_location_id)
                    : undefined
                }
              >
                {storageLocations.find((location) => location.id === marker.storage_location_id)
                  ?.name ?? t("mapUnknownStorageLocation")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {placements.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label={t("mapPlacedItems")}>
          {placements.map((placement) => {
            const item = itemsById.get(placement.item_id);
            return (
              <li key={placement.id}>
                <button
                  type="button"
                  className="w-full p-3 text-left text-sm hover:bg-muted/50"
                  onClick={onItemClick ? () => onItemClick(placement.item_id) : undefined}
                >
                  {item?.name ?? t("mapUnknownItem")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("map3dHelp")}</p>
    </div>
  );
};

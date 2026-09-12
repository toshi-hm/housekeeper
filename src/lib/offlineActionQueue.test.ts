import { beforeEach, describe, expect, test } from "bun:test";

import {
  clearOfflineActionQueue,
  dequeueOfflineAction,
  enqueueOfflineAction,
  readOfflineActionQueue,
} from "@/lib/offlineActionQueue";
import type { ItemFormValues } from "@/types/item";
import type { PurchaseInput, UpsertShoppingItemInput } from "@/types/shopping";

const STORAGE_KEY = "shopping.offlineActionQueue";

const makeFormValues = (overrides: Partial<ItemFormValues> = {}): ItemFormValues => ({
  name: "テスト商品",
  barcode: "",
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: "",
  expiry_date: "",
  notes: "",
  image_path: "",
  ...overrides,
});

const purchasePayload: PurchaseInput = {
  shoppingItemId: "shopping-1",
  itemValues: makeFormValues({ name: "牛乳" }),
  applyMergeFields: false,
};

const addAlertPayload: UpsertShoppingItemInput = {
  name: "醤油",
  linked_item_id: "item-1",
};

describe("offlineActionQueue", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("localStorageに保存がない場合は空配列を返す", () => {
    expect(readOfflineActionQueue()).toEqual([]);
  });

  test("不正なJSONが入っている場合は空配列にフォールバックする", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    expect(readOfflineActionQueue()).toEqual([]);
  });

  test("配列でない値が入っている場合は空配列にフォールバックする", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    expect(readOfflineActionQueue()).toEqual([]);
  });

  test("id/kind/queuedAt/payloadの形を満たさない要素は除外する", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "a", kind: "purchase", queuedAt: "2026-01-01T00:00:00.000Z", payload: {} },
        { id: "b", kind: "unknown-kind", queuedAt: "2026-01-01T00:00:00.000Z", payload: {} },
        { id: "c", kind: "purchase", payload: {} },
        "not-an-object",
        null,
      ]),
    );
    const queue = readOfflineActionQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("a");
  });

  test("enqueueOfflineActionでpurchaseアクションを積み、id/queuedAtが採番されlocalStorageに永続化される", () => {
    const queue = enqueueOfflineAction([], { kind: "purchase", payload: purchasePayload });
    expect(queue).toHaveLength(1);
    const entry = queue[0]!;
    expect(entry.kind).toBe("purchase");
    expect(entry.payload).toEqual(purchasePayload);
    expect(typeof entry.id).toBe("string");
    expect(entry.id.length).toBeGreaterThan(0);
    expect(() => new Date(entry.queuedAt).toISOString()).not.toThrow();

    const persisted = readOfflineActionQueue();
    expect(persisted).toEqual(queue);
  });

  test("enqueueOfflineActionでadd-alertアクションを積める", () => {
    const queue = enqueueOfflineAction([], { kind: "add-alert", payload: addAlertPayload });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.kind).toBe("add-alert");
    expect(queue[0]?.payload).toEqual(addAlertPayload);
  });

  test("複数回enqueueすると順序を保って積み重なる", () => {
    let queue = enqueueOfflineAction([], { kind: "purchase", payload: purchasePayload });
    queue = enqueueOfflineAction(queue, { kind: "add-alert", payload: addAlertPayload });
    expect(queue).toHaveLength(2);
    expect(queue[0]?.kind).toBe("purchase");
    expect(queue[1]?.kind).toBe("add-alert");
    expect(readOfflineActionQueue()).toHaveLength(2);
  });

  test("dequeueOfflineActionで指定したidだけを取り除き、永続化する", () => {
    let queue = enqueueOfflineAction([], { kind: "purchase", payload: purchasePayload });
    queue = enqueueOfflineAction(queue, { kind: "add-alert", payload: addAlertPayload });
    const targetId = queue[0]!.id;

    const next = dequeueOfflineAction(queue, targetId);
    expect(next).toHaveLength(1);
    expect(next[0]?.kind).toBe("add-alert");
    expect(readOfflineActionQueue()).toEqual(next);
  });

  test("存在しないidをdequeueしても何も変化しない", () => {
    const queue = enqueueOfflineAction([], { kind: "purchase", payload: purchasePayload });
    const next = dequeueOfflineAction(queue, "does-not-exist");
    expect(next).toEqual(queue);
  });

  test("再読み込み(readOfflineActionQueue)後もラウンドトリップで内容が一致する", () => {
    let queue = enqueueOfflineAction([], { kind: "purchase", payload: purchasePayload });
    queue = enqueueOfflineAction(queue, { kind: "add-alert", payload: addAlertPayload });

    const reloaded = readOfflineActionQueue();
    expect(reloaded).toEqual(queue);
  });

  // #1053: ログアウト時に前ユーザーのキューを消し、別アカウントへ引き継がれない
  // ようにするための回帰テスト。
  test("clearOfflineActionQueueでキューが空になる", () => {
    enqueueOfflineAction([], { kind: "purchase", payload: purchasePayload });
    expect(readOfflineActionQueue()).toHaveLength(1);

    clearOfflineActionQueue();

    expect(readOfflineActionQueue()).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("何も保存されていない状態でclearOfflineActionQueueを呼んでも例外を投げない", () => {
    expect(() => clearOfflineActionQueue()).not.toThrow();
  });
});

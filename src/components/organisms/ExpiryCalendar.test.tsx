import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import i18n from "@/lib/i18n";
import type { Category, Item } from "@/types/item";

import { ExpiryCalendar } from "./ExpiryCalendar";

// #1054セルフレビュー: このファイルの他のテストはt()を素朴なフォールバック
// （i18nインスタンス未初期化時はキー名そのもの）に頼っているが、bun testは
// 同一プロセス内でモジュールレジストリを共有するため、他のテストファイルが
// 先に "@/lib/i18n" を読み込んでいると、実行順序次第でこのファイルの
// useTranslation も実際に翻訳済みの文字列を返すようになる（フルスイート実行時
// にのみ再現し、このファイル単体では再現しない）。年月ピッカーのボタン名は
// 実行順序に依存させず、実際のi18nインスタンス経由で解決する。
const selectYearMonthLabel = i18n.t("selectYearMonth", { ns: "calendar" });

const categories: Category[] = [
  {
    id: "cat-1",
    user_id: "user-1",
    name: "冷蔵",
    color: "#22c55e",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  },
];

const item: Item = {
  id: "item-1",
  user_id: "user-1",
  name: "ヨーグルト",
  barcode: null,
  category_id: "cat-1",
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: "2026-05-15",
  image_path: null,
  notes: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  deleted_at: null,
};

const labels = {
  close: "閉じる",
  noItemsOnDate: "この日に期限を迎えるアイテムはありません",
  expiryItemsOnDate: (date: string) => `${date} の期限アイテム`,
  legendExpired: "期限切れ",
  legendSoon: "期限間近",
  legendOk: "期限内",
};

describe("ExpiryCalendar", () => {
  afterEach(() => {
    setSystemTime();
  });

  it("opens date modal and shows items for selected day", () => {
    setSystemTime(new Date("2026-05-03"));
    const { getByRole, getByText } = render(
      <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
    );

    fireEvent.click(getByRole("button", { name: "15" }));

    expect(getByText("2026-05-15 の期限アイテム")).toBeDefined();
    expect(getByText("ヨーグルト")).toBeDefined();
  });

  it("shows empty message when selected day has no items", () => {
    const { getByRole, getByText } = render(
      <ExpiryCalendar items={[]} categories={categories} labels={labels} />,
    );

    fireEvent.click(getByRole("button", { name: "1" }));

    expect(getByText("この日に期限を迎えるアイテムはありません")).toBeDefined();
  });

  // #763: 日別ポップアップがダイアログのa11yパターン（useDialogA11y）に
  // 沿っていない問題の回帰テスト。
  it("date popup has dialog role and aria-modal", () => {
    setSystemTime(new Date("2026-05-03"));
    const { getByRole, container } = render(
      <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
    );

    fireEvent.click(getByRole("button", { name: "15" }));

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  it("Escapeキーで日別ポップアップが閉じる", () => {
    setSystemTime(new Date("2026-05-03"));
    const { getByRole, queryByText } = render(
      <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
    );

    fireEvent.click(getByRole("button", { name: "15" }));
    expect(queryByText("2026-05-15 の期限アイテム")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(queryByText("2026-05-15 の期限アイテム")).toBeNull();
  });

  it("開いたときにポップアップ内へ初期フォーカスが当たる", () => {
    setSystemTime(new Date("2026-05-03"));
    const { getByRole, container } = render(
      <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
    );

    const trigger = getByRole("button", { name: "15" });
    fireEvent.click(trigger);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.contains(document.activeElement)).toBe(true);
  });

  it("閉じるとトリガーへフォーカスが戻る", () => {
    setSystemTime(new Date("2026-05-03"));
    const { getByRole } = render(
      <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
    );

    const trigger = getByRole("button", { name: "15" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement === trigger).toBe(true);
  });

  // #1054: 年月ピッカーだけ useDialogA11y（Escapeで閉じる・フォーカストラップ・
  // 初期フォーカス）が抜けていた問題の回帰テスト。日別ポップアップ（#763）と
  // 同じパターンで揃える。
  describe("年月ピッカー", () => {
    it("dialog role と aria-modal を持つ", () => {
      setSystemTime(new Date("2026-05-03"));
      const { getByRole, container } = render(
        <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
      );

      fireEvent.click(getByRole("button", { name: selectYearMonthLabel }));

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
    });

    it("Escapeキーで閉じる", () => {
      setSystemTime(new Date("2026-05-03"));
      const { getByRole, container } = render(
        <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
      );

      fireEvent.click(getByRole("button", { name: selectYearMonthLabel }));
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("開いたときにピッカー内へ初期フォーカスが当たる", () => {
      setSystemTime(new Date("2026-05-03"));
      const { getByRole, container } = render(
        <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
      );

      fireEvent.click(getByRole("button", { name: selectYearMonthLabel }));

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog?.contains(document.activeElement)).toBe(true);
    });

    it("閉じるとトリガーへフォーカスが戻る", () => {
      setSystemTime(new Date("2026-05-03"));
      const { getByRole } = render(
        <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
      );

      const trigger = getByRole("button", { name: selectYearMonthLabel });
      trigger.focus();
      fireEvent.click(trigger);

      fireEvent.keyDown(document, { key: "Escape" });

      expect(document.activeElement === trigger).toBe(true);
    });
  });
});

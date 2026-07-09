import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { ExpiryCalendar } from "@/components/organisms/ExpiryCalendar";
import i18n from "@/lib/i18n";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const labels = {
  close: "閉じる",
  noItemsOnDate: "この日に期限を迎えるアイテムはありません",
  expiryItemsOnDate: (date: string) => `${date} の期限アイテム`,
};

const renderCalendar = () =>
  render(<ExpiryCalendar items={[]} categories={[]} labels={labels} />, { wrapper });

describe("ExpiryCalendar (ナビゲーション)", () => {
  afterEach(() => {
    setSystemTime();
  });

  it("前月・翌月ボタンで月を移動する (年跨ぎを含む)", () => {
    setSystemTime(new Date("2026-01-15"));
    const { getByLabelText, getByText } = renderCalendar();

    // 1月 → 前月 → 2025年12月
    fireEvent.click(getByLabelText(i18n.t("calendar:prevMonth")));
    expect(getByText(/2025/)).toBeTruthy();

    // 12月 → 翌月 → 2026年1月
    fireEvent.click(getByLabelText(i18n.t("calendar:nextMonth")));
    expect(getByText(/2026/)).toBeTruthy();
  });

  it("12月から翌月へ移動すると翌年になる", () => {
    setSystemTime(new Date("2026-12-15"));
    const { getByLabelText, getByText } = renderCalendar();

    fireEvent.click(getByLabelText(i18n.t("calendar:nextMonth")));
    expect(getByText(/2027/)).toBeTruthy();
  });

  it("月中の移動 (年は変わらない)", () => {
    setSystemTime(new Date("2026-06-15"));
    const { getByLabelText, getByText } = renderCalendar();

    fireEvent.click(getByLabelText(i18n.t("calendar:prevMonth")));
    expect(getByText(/2026/)).toBeTruthy();
    fireEvent.click(getByLabelText(i18n.t("calendar:nextMonth")));
    expect(getByText(/2026/)).toBeTruthy();
  });

  it("年月ピッカーで年を変更し月を選択できる", () => {
    setSystemTime(new Date("2026-06-15"));
    const { getByLabelText, getAllByText, getByText } = renderCalendar();

    // ピッカーを開く
    fireEvent.click(getByLabelText(i18n.t("calendar:selectYearMonth")));

    // 年を進める / 戻す
    fireEvent.click(getByLabelText(i18n.t("calendar:nextYear")));
    fireEvent.click(getByLabelText(i18n.t("calendar:prevYear")));
    fireEvent.click(getByLabelText(i18n.t("calendar:nextYear")));

    // 月グリッドから 1 月を選択 (2027年1月へ)
    const monthLabel = new Date(2000, 0, 1).toLocaleDateString(i18n.language, { month: "short" });
    const candidates = getAllByText(monthLabel);
    fireEvent.click(candidates[candidates.length - 1]!);

    expect(getByText(/2027/)).toBeTruthy();
  });
});

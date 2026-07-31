import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { LocationPinPicker } from "./LocationPinPicker";

const PHOTO_URL = "https://signed.example/user-1/location-1.jpg";

const renderWithI18n = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe("LocationPinPicker (#574)", () => {
  it("写真をタップした相対位置でonChangeを呼ぶ", () => {
    const onChange = mock(() => {});
    const { container } = renderWithI18n(
      <LocationPinPicker photoUrl={PHOTO_URL} value={null} onChange={onChange} />,
    );
    const picker = container.querySelector(".cursor-crosshair") as HTMLDivElement;
    picker.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;

    fireEvent.click(picker, { clientX: 100, clientY: 50 });

    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
  });

  it("valueがあるときは選択中ピンとクリアボタンを表示する", () => {
    const onChange = mock(() => {});
    const { getByRole, getByText } = renderWithI18n(
      <LocationPinPicker photoUrl={PHOTO_URL} value={{ x: 0.3, y: 0.4 }} onChange={onChange} />,
    );
    expect(getByRole("button", { name: /選択中の位置|Selected position/ })).not.toBeNull();
    const clearButton = getByText(/位置指定を解除|Clear position/);
    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("existingPinsはクリック不可の参考ピンとして表示される", () => {
    const { getByRole } = renderWithI18n(
      <LocationPinPicker
        photoUrl={PHOTO_URL}
        existingPins={[{ id: "1", x: 0.2, y: 0.3, label: "牛乳" }]}
        value={null}
        onChange={() => {}}
      />,
    );
    const referencePin = getByRole("button", { name: "牛乳" });
    expect(referencePin).not.toBeNull();
    // クリックしても何も起きない「動作しないボタン」に見えないよう、
    // 参考ピンはdisabledでフォーカス/操作不可にする（#699）。
    expect(referencePin.hasAttribute("disabled")).toBe(true);
  });

  it("フォーカスしてEnterキーを押すと中央にピンを配置する（#699）", () => {
    const onChange = mock(() => {});
    const { container } = renderWithI18n(
      <LocationPinPicker photoUrl={PHOTO_URL} value={null} onChange={onChange} />,
    );
    const picker = container.querySelector('[role="button"]') as HTMLDivElement;
    expect(picker.tabIndex).toBe(0);

    fireEvent.keyDown(picker, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
  });

  it("ピンが置かれている状態で矢印キーを押すと位置を微調整する（#699）", () => {
    const onChange = mock(() => {});
    const { container } = renderWithI18n(
      <LocationPinPicker photoUrl={PHOTO_URL} value={{ x: 0.5, y: 0.5 }} onChange={onChange} />,
    );
    const picker = container.querySelector('[role="button"]') as HTMLDivElement;

    fireEvent.keyDown(picker, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ x: 0.52, y: 0.5 });

    fireEvent.keyDown(picker, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.48 });
  });

  it("ピン未配置のときは矢印キーを押しても何もしない", () => {
    const onChange = mock(() => {});
    const { container } = renderWithI18n(
      <LocationPinPicker photoUrl={PHOTO_URL} value={null} onChange={onChange} />,
    );
    const picker = container.querySelector('[role="button"]') as HTMLDivElement;

    fireEvent.keyDown(picker, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

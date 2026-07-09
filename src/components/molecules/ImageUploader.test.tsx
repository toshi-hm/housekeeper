import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { ImageUploader } from "@/components/molecules/ImageUploader";
import i18n from "@/lib/i18n";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const makeImageFile = (name = "photo.png", type = "image/png", size = 100) => {
  const blob = new Uint8Array(size);
  return new File([blob], name, { type });
};

describe("ImageUploader", () => {
  test("previewUrl がなければドロップエリアを表示する", () => {
    const { getByText, container } = render(<ImageUploader onFile={() => {}} />, { wrapper });

    expect(getByText(i18n.t("items:imageDrop"))).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  test("ファイル選択で onFile が呼ばれる", async () => {
    const onFile = mock(() => {});
    const { container } = render(<ImageUploader onFile={onFile} />, { wrapper });

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, makeImageFile());

    expect(onFile).toHaveBeenCalledTimes(1);
  });

  test("許可されない MIME タイプはエラーを表示する", async () => {
    const onFile = mock(() => {});
    const { container, getByText } = render(<ImageUploader onFile={onFile} />, { wrapper });

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, makeImageFile("doc.txt", "text/plain"), {
      applyAccept: false,
    });

    await waitFor(() => expect(getByText(i18n.t("items:imageErrorType"))).toBeTruthy());
    expect(onFile).not.toHaveBeenCalled();
  });

  test("5MB 超のファイルはサイズエラーを表示する", async () => {
    const onFile = mock(() => {});
    const { container, getByText } = render(<ImageUploader onFile={onFile} />, { wrapper });

    const bigFile = makeImageFile("big.png", "image/png", 5 * 1024 * 1024 + 1);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, bigFile);

    await waitFor(() => expect(getByText(i18n.t("items:imageErrorSize"))).toBeTruthy());
    expect(onFile).not.toHaveBeenCalled();
  });

  test("ドラッグ&ドロップで onFile が呼ばれる", () => {
    const onFile = mock(() => {});
    const { getByText } = render(<ImageUploader onFile={onFile} />, { wrapper });

    const dropArea = getByText(i18n.t("items:imageDrop")).parentElement as HTMLElement;
    fireEvent.dragOver(dropArea);
    fireEvent.dragLeave(dropArea);
    fireEvent.dragOver(dropArea);
    fireEvent.drop(dropArea, { dataTransfer: { files: [makeImageFile()] } });

    expect(onFile).toHaveBeenCalledTimes(1);
  });

  test("previewUrl があれば画像と操作ボタンを表示する", () => {
    const onDelete = mock(() => {});
    const { container } = render(
      <ImageUploader
        previewUrl="https://img.example/preview.png"
        onFile={() => {}}
        onDelete={onDelete}
      />,
      { wrapper },
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.example/preview.png",
    );

    const deleteButton = container.querySelector("svg.lucide-trash-2")?.closest("button");
    fireEvent.click(deleteButton!);
    expect(onDelete).toHaveBeenCalled();
  });

  test("onDelete がなければ削除ボタンを表示しない", () => {
    const { container } = render(
      <ImageUploader previewUrl="https://img.example/preview.png" onFile={() => {}} />,
      { wrapper },
    );
    expect(container.querySelector("svg.lucide-trash-2")).toBeNull();
  });

  test("ドロップエリアや撮影ボタンのクリックでファイル選択を開く", () => {
    const { container, getByText } = render(<ImageUploader onFile={() => {}} />, { wrapper });

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    let clickCount = 0;
    input.click = () => {
      clickCount += 1;
    };

    fireEvent.click(getByText(i18n.t("items:imageDrop")).parentElement as HTMLElement);
    expect(clickCount).toBe(1);

    fireEvent.click(getByText(i18n.t("items:imageCapture")).closest("button") as HTMLElement);
    expect(clickCount).toBe(2);
  });

  test("プレビュー中のアップロードボタンでもファイル選択を開く", () => {
    const { container } = render(
      <ImageUploader previewUrl="https://img.example/p.png" onFile={() => {}} />,
      { wrapper },
    );

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    let clickCount = 0;
    input.click = () => {
      clickCount += 1;
    };

    const uploadButton = container.querySelector("svg.lucide-upload")?.closest("button");
    fireEvent.click(uploadButton!);
    expect(clickCount).toBe(1);
  });

  test("isUploading 中はオーバーレイを表示する", () => {
    const { getByText } = render(
      <ImageUploader
        previewUrl="https://img.example/preview.png"
        isUploading={true}
        onFile={() => {}}
      />,
      { wrapper },
    );
    expect(getByText(i18n.t("items:imageUploading"))).toBeTruthy();
  });
});

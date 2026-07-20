import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ImageLightbox } from "./ImageLightbox";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ImageLightbox", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImageLightbox
        open={false}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when there is no image (guard)", () => {
    const { container } = render(
      <ImageLightbox open={true} imageUrl={null} alt="牛乳" onClose={() => {}} />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the image full-screen when open with an image", () => {
    const { container } = render(
      <ImageLightbox
        open={true}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={() => {}}
      />,
      { wrapper },
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/photo.jpg");
    expect(img?.getAttribute("alt")).toBe("牛乳");
  });

  it("applies touch-action: pinch-zoom to the image for mobile pinch zoom", () => {
    const { container } = render(
      <ImageLightbox
        open={true}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={() => {}}
      />,
      { wrapper },
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.style.touchAction).toBe("pinch-zoom");
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = mock(() => {});
    const { container } = render(
      <ImageLightbox
        open={true}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={onClose}
      />,
      { wrapper },
    );
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when the image itself is clicked", () => {
    const onClose = mock(() => {});
    const { container } = render(
      <ImageLightbox
        open={true}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={onClose}
      />,
      { wrapper },
    );
    const img = container.querySelector("img") as HTMLElement;
    fireEvent.click(img);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = mock(() => {});
    const { container } = render(
      <ImageLightbox
        open={true}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={onClose}
      />,
      { wrapper },
    );
    const closeButton = container.querySelector("button") as HTMLButtonElement;
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = mock(() => {});
    render(
      <ImageLightbox
        open={true}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={onClose}
      />,
      { wrapper },
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog, traps Tab, and restores focus when closed", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { getByRole, rerender } = render(
      <ImageLightbox
        open={true}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={() => {}}
      />,
      { wrapper },
    );
    const closeButton = getByRole("button", { name: i18n.t("common:close") });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    rerender(
      <ImageLightbox
        open={false}
        imageUrl="https://example.com/photo.jpg"
        alt="牛乳"
        onClose={() => {}}
      />,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("makes background siblings inert while open", () => {
    const { getByTestId } = render(
      <>
        <main data-testid="background">inventory</main>
        <ImageLightbox
          open={true}
          imageUrl="https://example.com/photo.jpg"
          alt="牛乳"
          onClose={() => {}}
        />
      </>,
      { wrapper },
    );
    const background = getByTestId("background");
    expect(background.inert).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");
  });
});

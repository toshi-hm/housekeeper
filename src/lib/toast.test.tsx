import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test, vi } from "bun:test";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { ToastProvider } from "@/lib/toast";
import { useToast } from "@/lib/toast-context";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <ToastProvider>{children}</ToastProvider>
  </I18nextProvider>
);

const TriggerToast = ({
  onClick,
  message = "テスト",
  action,
}: {
  onClick?: (toastFn: ReturnType<typeof useToast>["toast"]) => void;
  message?: string;
  action?: { label: string; onClick: () => void };
}) => {
  const { toast } = useToast();
  useEffect(() => {
    onClick?.(toast);
  }, [onClick, toast]);
  return <button onClick={() => toast(message, "default", { action })}>show</button>;
};

describe("ToastProvider (#673)", () => {
  test("action無しトーストは既定4000msで自動的に消える(fake timers)", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<TriggerToast />, { wrapper });
      act(() => {
        fireEvent.click(container.querySelector("button")!);
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(3999);
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(container.querySelector('[role="status"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("action付きトーストは既定8000msで自動的に消える(fake timers)", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <TriggerToast action={{ label: "元に戻す", onClick: () => {} }} />,
        { wrapper },
      );
      act(() => {
        fireEvent.click(container.querySelector("button")!);
      });

      act(() => {
        vi.advanceTimersByTime(7999);
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(container.querySelector('[role="status"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("トーストにhoverしている間は自動消滅タイマーが一時停止する(fake timers)", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <TriggerToast action={{ label: "元に戻す", onClick: () => {} }} />,
        { wrapper },
      );
      act(() => {
        fireEvent.click(container.querySelector("button")!);
      });

      const toastEl = container.querySelector('[role="status"]') as HTMLElement;

      act(() => {
        vi.advanceTimersByTime(7000);
      });
      act(() => {
        fireEvent.mouseEnter(toastEl);
      });

      // 8000msの猶予のうち残り1000ms分が経過してもhover中は消えない
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();

      act(() => {
        fireEvent.mouseLeave(toastEl);
      });
      // hover解除後、残っていた約1000ms分が経過すれば消える
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(container.querySelector('[role="status"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("トースト内の要素にフォーカスしている間も自動消滅タイマーが一時停止する(fake timers)", () => {
    vi.useFakeTimers();
    try {
      const onUndoClick = mock(() => {});
      const { container } = render(
        <TriggerToast action={{ label: "元に戻す", onClick: onUndoClick }} />,
        { wrapper },
      );
      act(() => {
        fireEvent.click(container.querySelector("button")!);
      });

      const undoButton = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("元に戻す"),
      ) as HTMLButtonElement;

      act(() => {
        vi.advanceTimersByTime(7000);
      });
      act(() => {
        fireEvent.focus(undoButton);
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();

      act(() => {
        fireEvent.click(undoButton);
      });
      expect(onUndoClick).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

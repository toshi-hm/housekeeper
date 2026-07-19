import { Bot, Eraser, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ChatBubble } from "@/components/atoms/ChatBubble";
import { Spinner } from "@/components/atoms/Spinner";
import { ChatComposer } from "@/components/molecules/ChatComposer";
import { Button } from "@/components/ui/button";
import { useInventoryChat } from "@/hooks/useInventoryChat";
import { markMessageFailed, toHistory } from "@/lib/chatHistory";
import type { ChatMessage } from "@/types/chat";

interface InventoryChatPanelProps {
  open: boolean;
  onClose: () => void;
}

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export const InventoryChatPanel = ({ open, onClose }: InventoryChatPanelProps) => {
  const { t } = useTranslation("chat");
  const { ask, isLoading } = useInventoryChat();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (text: string) => {
    const history = toHistory(messages);
    const userMessage: ChatMessage = { id: createId(), role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const res = await ask({ message: text, history });
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: "assistant", text: res.reply, items: res.items },
      ]);
    } catch {
      setMessages((prev) => [
        ...markMessageFailed(prev, userMessage.id),
        { id: createId(), role: "assistant", text: t("error"), isError: true },
      ]);
    }
  };

  if (!open) return null;

  const suggestions = [t("suggestion1"), t("suggestion2"), t("suggestion3")];

  return (
    <div className="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="relative flex h-full w-full flex-col bg-background shadow-xl sm:h-[80vh] sm:max-w-md sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5 text-primary" />
            {t("title")}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMessages([])}
              disabled={messages.length === 0 || isLoading}
              aria-label={t("clear")}
              title={t("clear")}
            >
              <Eraser className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("close")}
              title={t("close")}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground">
              <Bot className="h-10 w-10 text-primary/60" />
              <p className="text-sm">{t("emptyHint")}</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void handleSend(s);
                    }}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="space-y-1.5">
                <ChatBubble role={m.role} text={m.text} />
                {m.items && m.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-1">
                    {m.items.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground"
                      >
                        {item.name}
                        {item.total_remaining ? ` · ${item.total_remaining}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {t("thinking")}
            </div>
          )}
        </div>

        <ChatComposer onSend={(msg) => void handleSend(msg)} isLoading={isLoading} />
      </div>
    </div>
  );
};

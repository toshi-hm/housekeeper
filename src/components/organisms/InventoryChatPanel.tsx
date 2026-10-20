import { Bot, Eraser, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ChatBubble } from "@/components/atoms/ChatBubble";
import { Spinner } from "@/components/atoms/Spinner";
import { ChatComposer } from "@/components/molecules/ChatComposer";
import { Button } from "@/components/ui/button";
import { ChatRateLimitError, useInventoryChat } from "@/hooks/useInventoryChat";
import { type ChatErrorKind, classifyChatError } from "@/lib/chatErrors";
import { markMessageFailed, toHistory } from "@/lib/chatHistory";
import { cn } from "@/lib/utils";
import type { ChatAgent, ChatMessage } from "@/types/chat";

// Which i18n key to show for each classified error kind. Keyed off the
// `ChatErrorKind` union (see src/lib/chatErrors.ts) rather than switching on
// the raw error, per the i18n dynamic-key rule in CLAUDE.md.
const chatErrorMessageKey = {
  tooLong: "errorTooLong",
  unauthorized: "errorUnauthorized",
  temporary: "error",
} as const satisfies Record<ChatErrorKind, string>;

// Per-agent copy, keyed off the `ChatAgent` union rather than built by string
// concatenation, per the i18n dynamic-key rule in CLAUDE.md. These keys are
// not extractable by i18next-parser, so they are maintained by hand in
// src/locales/*/chat.json.
const AGENTS = ["inventory", "meal"] as const satisfies readonly ChatAgent[];

const agentTabKey = {
  inventory: "agentInventory",
  meal: "agentMeal",
} as const satisfies Record<ChatAgent, string>;

const agentTitleKey = {
  inventory: "title",
  meal: "mealTitle",
} as const satisfies Record<ChatAgent, string>;

const agentEmptyHintKey = {
  inventory: "emptyHint",
  meal: "mealEmptyHint",
} as const satisfies Record<ChatAgent, string>;

const agentPlaceholderKey = {
  inventory: "placeholder",
  meal: "mealPlaceholder",
} as const satisfies Record<ChatAgent, string>;

const agentSuggestionKeys = {
  inventory: ["suggestion1", "suggestion2", "suggestion3"],
  meal: ["mealSuggestion1", "mealSuggestion2", "mealSuggestion3"],
} as const satisfies Record<ChatAgent, readonly string[]>;

interface InventoryChatPanelProps {
  open: boolean;
  onClose: () => void;
}

// Tab-trap候補: 非表示(disabled)を除くフォーカス可能要素
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export const InventoryChatPanel = ({ open, onClose }: InventoryChatPanelProps) => {
  const { t } = useTranslation("chat");
  const [agent, setAgent] = useState<ChatAgent>("inventory");
  const { ask, isLoading } = useInventoryChat(agent);
  // Each agent keeps its own conversation; switching tabs doesn't mix history.
  const [conversations, setConversations] = useState<Record<ChatAgent, ChatMessage[]>>({
    inventory: [],
    meal: [],
  });
  const messages = conversations[agent];
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // パネルを開いたときに: (1) 開くトリガー要素を記憶し、(2) Textarea へ初期
  // フォーカスを移し、(3) パネル以外のツリー（オーバーレイの祖先を辿った各階層の
  // 兄弟要素）を inert にして、Tab 以外の手段（スクリーンリーダーの仮想カーソル等）
  // で背景コンテンツに到達できないようにする。閉じたら inert を解除してから、記憶
  // しておいたトリガー要素へフォーカスを戻す（トリガーが既に DOM から外れている
  // 場合は無視する）。
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    textareaRef.current?.focus();

    const inerted: Element[] = [];
    let node: Element | null = overlayRef.current;
    while (node && node !== document.body) {
      const parent: Element | null = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== node && !sibling.hasAttribute("inert")) {
          sibling.setAttribute("inert", "");
          inerted.push(sibling);
        }
      }
      node = parent;
    }

    return () => {
      for (const el of inerted) el.removeAttribute("inert");
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      }
      triggerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // フォーカストラップ: パネル内の先頭/末尾要素で Tab / Shift+Tab を折り返す
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (text: string) => {
    // Pin the agent: the tabs are disabled while a request is in flight, but
    // the reply must land in the conversation that asked regardless.
    const target = agent;
    const setMessages = (update: (prev: ChatMessage[]) => ChatMessage[]) =>
      setConversations((prev) => ({ ...prev, [target]: update(prev[target]) }));
    const history = toHistory(messages);
    const userMessage: ChatMessage = { id: createId(), role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const res = await ask({ message: text, history });
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: "assistant", text: res.reply, items: res.items },
      ]);
    } catch (err) {
      const errorText =
        err instanceof ChatRateLimitError
          ? t("rateLimited")
          : t(chatErrorMessageKey[await classifyChatError(err)]);
      setMessages((prev) => [
        ...markMessageFailed(prev, userMessage.id),
        { id: createId(), role: "assistant", text: errorText, isError: true, retryText: text },
      ]);
    }
  };

  if (!open) return null;

  const suggestions = agentSuggestionKeys[agent].map((key) => t(key));

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(agentTitleKey[agent])}
        className="relative flex h-full w-full flex-col bg-background shadow-xl sm:h-[80vh] sm:max-w-md sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5 text-primary" />
            {t(agentTitleKey[agent])}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConversations((prev) => ({ ...prev, [agent]: [] }))}
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

        {/* Agent switcher */}
        <div
          role="group"
          aria-label={t("agentSwitchLabel")}
          className="flex gap-1 border-b px-4 py-2"
        >
          {AGENTS.map((a) => (
            <Button
              key={a}
              type="button"
              size="sm"
              variant={a === agent ? "default" : "ghost"}
              aria-pressed={a === agent}
              disabled={isLoading}
              onClick={() => setAgent(a)}
              className={cn("flex-1", a !== agent && "text-muted-foreground")}
            >
              {t(agentTabKey[a])}
            </Button>
          ))}
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto p-4"
          aria-live="polite"
          aria-atomic="false"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground">
              <Bot className="h-10 w-10 text-primary/60" />
              <p className="text-sm">{t(agentEmptyHintKey[agent])}</p>
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
                <ChatBubble
                  role={m.role}
                  text={m.text}
                  isError={m.isError}
                  retryLabel={t("retry")}
                  onRetry={
                    m.isError && m.retryText
                      ? () => {
                          void handleSend(m.retryText as string);
                        }
                      : undefined
                  }
                />
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
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {t("thinking")}
            </div>
          )}
        </div>

        <ChatComposer
          ref={textareaRef}
          placeholder={t(agentPlaceholderKey[agent])}
          onSend={(msg) => void handleSend(msg)}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

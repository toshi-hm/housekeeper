import { SendHorizonal } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CHAT_MAX_MESSAGE_LENGTH } from "@/types/chat";

interface ChatComposerProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

// Show the counter once the user is close enough to the limit to care.
const COUNTER_WARNING_THRESHOLD = 50;

// Input area with a send button. Enter submits, Shift+Enter inserts a newline.
// IME composition is respected so confirming Japanese input does not submit.
export const ChatComposer = ({ onSend, isLoading = false }: ChatComposerProps) => {
  const { t } = useTranslation("chat");
  const [value, setValue] = useState("");
  const isComposing = useRef(false);
  const remaining = CHAT_MAX_MESSAGE_LENGTH - value.length;

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > CHAT_MAX_MESSAGE_LENGTH || isLoading) return;
    onSend(trimmed);
    setValue("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing.current) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, CHAT_MAX_MESSAGE_LENGTH))}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => (isComposing.current = true)}
          onCompositionEnd={() => (isComposing.current = false)}
          placeholder={t("placeholder")}
          rows={1}
          maxLength={CHAT_MAX_MESSAGE_LENGTH}
          disabled={isLoading}
          aria-label={t("inputLabel")}
          className="max-h-32 min-h-[44px] flex-1 resize-none"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !value.trim() || value.length > CHAT_MAX_MESSAGE_LENGTH}
          aria-label={t("send")}
          title={t("send")}
        >
          {isLoading ? <Spinner className="h-4 w-4" /> : <SendHorizonal className="h-5 w-5" />}
        </Button>
      </div>
      {remaining <= COUNTER_WARNING_THRESHOLD && (
        <p
          className={cn(
            "mt-1 text-right text-xs text-muted-foreground",
            remaining <= 0 && "text-destructive",
          )}
        >
          {t("charCount", { current: value.length, max: CHAT_MAX_MESSAGE_LENGTH })}
        </p>
      )}
    </form>
  );
};

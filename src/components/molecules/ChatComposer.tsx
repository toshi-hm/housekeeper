import { SendHorizonal } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

// Input area with a send button. Enter submits, Shift+Enter inserts a newline.
// IME composition is respected so confirming Japanese input does not submit.
export const ChatComposer = ({ onSend, isLoading = false }: ChatComposerProps) => {
  const { t } = useTranslation("chat");
  const [value, setValue] = useState("");
  const isComposing = useRef(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
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
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t bg-background p-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => (isComposing.current = true)}
        onCompositionEnd={() => (isComposing.current = false)}
        placeholder={t("placeholder")}
        rows={1}
        disabled={isLoading}
        aria-label={t("inputLabel")}
        className="max-h-32 min-h-[44px] flex-1 resize-none"
      />
      <Button
        type="submit"
        size="icon"
        disabled={isLoading || !value.trim()}
        aria-label={t("send")}
        title={t("send")}
      >
        {isLoading ? <Spinner className="h-4 w-4" /> : <SendHorizonal className="h-5 w-5" />}
      </Button>
    </form>
  );
};

import { cn } from "@/lib/utils";
import type { ChatRole } from "@/types/chat";

interface ChatBubbleProps {
  role: ChatRole;
  text: string;
}

// A single chat message bubble. User messages align right (primary),
// assistant messages align left (muted).
export const ChatBubble = ({ role, text }: ChatBubbleProps) => {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {text}
      </div>
    </div>
  );
};

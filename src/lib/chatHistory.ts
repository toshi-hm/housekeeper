import type { ChatHistoryTurn, ChatMessage } from "@/types/chat";

// Converts panel messages into the history turns sent to the Edge Function.
// Error messages (failed assistant replies, and user turns marked failed via
// `markMessageFailed`) are excluded so `history` never contains an unpaired
// trailing turn — see #554.
export const toHistory = (messages: ChatMessage[]): ChatHistoryTurn[] =>
  messages
    .filter((m) => !m.isError)
    .map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text }));

// Marks a message as failed so `toHistory` excludes it from the next
// request's history. Used when a user's turn never got a paired assistant
// reply (network error, timeout, etc.) — leaving it in place would send an
// unpaired trailing `user` turn on the next send, violating Gemini's
// alternating user/model role constraint and causing every subsequent send
// in the session to fail (#554).
export const markMessageFailed = (messages: ChatMessage[], id: string): ChatMessage[] =>
  messages.map((m) => (m.id === id ? { ...m, isError: true } : m));

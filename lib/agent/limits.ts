// Limits that keep Dink cheap and abuse-resistant (pure; the route enforces them).

export const LIMITS = {
  /** characters in one message from the player */
  messageChars: 500,
  /** messages in one conversation (player + Dink) */
  messages: 20,
  /** requests per hashed IP per window */
  ratePerWindow: 20,
  windowMinutes: 10,
  /** model calls in one request (tool loop) */
  maxIterations: 5,
  /** output tokens per model call (includes any thinking) */
  maxTokens: 1500,
} as const;

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ConversationCheck = { ok: true } | { ok: false; reason: "empty" | "bad_shape" | "too_long" | "too_many" };

/** The conversation must start and end with the player, alternate, and stay within the size limits. */
export function checkConversation(messages: ChatMessage[]): ConversationCheck {
  if (messages.length === 0) return { ok: false, reason: "empty" };
  if (messages.length > LIMITS.messages) return { ok: false, reason: "too_many" };
  const shapeOk = messages.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant") && typeof m.content === "string");
  if (!shapeOk || messages[messages.length - 1].role !== "user") return { ok: false, reason: "bad_shape" };
  if (messages.some((m) => m.role === "user" && m.content.length > LIMITS.messageChars)) return { ok: false, reason: "too_long" };
  return { ok: true };
}

export function isRateLimited(recentRequests: number, cap: number = LIMITS.ratePerWindow): boolean {
  return recentRequests >= cap;
}

export const LIMIT_TEXT: Record<Exclude<ConversationCheck, { ok: true }>["reason"] | "rate" | "daily" | "off" | "error", string> = {
  empty: "Ask me about courts, hours, or paying.",
  bad_shape: "Something went wrong with this chat. Start a new one.",
  too_long: `Keep messages under ${LIMITS.messageChars} characters.`,
  too_many: "This chat is getting long. Start a new one, or book on the Book a court page.",
  rate: "You're sending messages quickly. Wait a few minutes, or book on the Book a court page.",
  daily: "Dink is resting for today. You can still book on the Book a court page.",
  off: "Dink is off right now. You can still book on the Book a court page.",
  error: "Dink couldn't answer just now. You can still book on the Book a court page.",
};

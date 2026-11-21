import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMIT_TEXT, LIMITS, type ChatMessage } from "./limits";
import { errorKind, runAnthropic, runOpenAI, type Provider } from "./runners";
import type { RunContext, ToolDef } from "./tools";

/** The chat shows plain text: drop markdown bold and heading marks the model sometimes adds. */
export const plainText = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").trim();

/**
 * Run one Dink turn and record the outcome on its agent_runs row (counts only, never the text).
 * Returns the reply text, or null when the model call failed (the caller answers with a fallback).
 */
export async function runAndLog(opts: {
  db: SupabaseClient;
  provider: Provider;
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  ctx: RunContext;
}): Promise<string | null> {
  const { db, ctx } = opts;
  const started = Date.now();
  let steps = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const runModel = opts.provider === "openai" ? runOpenAI : runAnthropic;
    const result = await runModel({
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
      maxIterations: LIMITS.maxIterations,
      maxTokens: LIMITS.maxTokens,
    });
    steps = result.steps;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    let text = result.refused ? "I can only help with courts, booking and the yard." : plainText(result.text);
    if (!text) text = ctx.cards.length ? "Here are open courts you can book:" : ctx.queue ? "Here's the queue:" : LIMIT_TEXT.error;
    const outcome = result.refused ? "declined" : ctx.cards.length ? "proposed" : ctx.sawNoOptions ? "no_options" : "answered";
    await db
      .from("agent_runs")
      .update({ steps, tools: [...ctx.toolsUsed], input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - started, outcome })
      .eq("id", ctx.runId);
    return text;
  } catch (err) {
    const kind = errorKind(err);
    await db
      .from("agent_runs")
      .update({ steps, tools: [...ctx.toolsUsed], input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - started, outcome: "error", error: kind })
      .eq("id", ctx.runId);
    console.error("dink error", kind, err instanceof Error ? err.message : err);
    return null;
  }
}

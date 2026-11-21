import { createHash } from "node:crypto";
import { z } from "zod";
import { checkConversation, isRateLimited, LIMIT_TEXT, LIMITS, type ChatMessage } from "@/lib/agent/limits";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { chooseProvider, errorKind, runAnthropic, runOpenAI } from "@/lib/agent/runners";
import { playerToolDefs, type RunContext } from "@/lib/agent/tools";
import { getSiteSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";

// Dink, player mode: a public, read-only booking assistant.
// The mode is always "player" here; staff/admin modes are v2 and will decide the mode from the session.
// Provider: Claude by default; an OpenAI-compatible endpoint (e.g. gpt-4o-mini) is a switchable backup (AGENT_PROVIDER).

export const maxDuration = 30;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(LIMITS.messages + 1),
});

const reply = (status: number, body: { reply: string; cards?: unknown[]; limited?: boolean }) => Response.json(body, { status });

function ipHash(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.AGENT_IP_SALT ?? "serve"}:${ip}`).digest("hex").slice(0, 32);
}

/** The chat shows plain text: drop markdown bold and heading marks the model sometimes adds. */
const plainText = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").trim();

export async function POST(request: Request) {
  const provider = chooseProvider();
  if (process.env.AGENT_ENABLED === "false" || !provider) return reply(503, { reply: LIMIT_TEXT.off });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply(400, { reply: LIMIT_TEXT.bad_shape });
  const messages = parsed.data.messages as ChatMessage[];
  const check = checkConversation(messages);
  if (!check.ok) return reply(400, { reply: LIMIT_TEXT[check.reason], limited: check.reason === "too_many" });

  const db = createServiceClient();
  const hash = ipHash(request);
  const windowStart = new Date(Date.now() - LIMITS.windowMinutes * 60_000).toISOString();
  const dayStart = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: recent }, { count: today }] = await Promise.all([
    db.from("agent_runs").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", windowStart),
    db.from("agent_runs").select("id", { count: "exact", head: true }).gte("created_at", dayStart).neq("outcome", "limited"),
  ]);
  if (isRateLimited(recent ?? 0)) {
    await db.from("agent_runs").insert({ ip_hash: hash, outcome: "limited", error: "rate" });
    return reply(429, { reply: LIMIT_TEXT.rate, limited: true });
  }
  if ((today ?? 0) >= Number(process.env.AGENT_DAILY_LIMIT ?? 500)) {
    await db.from("agent_runs").insert({ ip_hash: hash, outcome: "limited", error: "daily" });
    return reply(503, { reply: LIMIT_TEXT.daily, limited: true });
  }

  const { data: run, error: runError } = await db.from("agent_runs").insert({ ip_hash: hash }).select("id").single();
  if (runError || !run) return reply(500, { reply: LIMIT_TEXT.error });

  const started = Date.now();
  const settings = await getSiteSettings();
  const now = new Date();
  const ctx: RunContext = { runId: run.id, settings, now, toolsUsed: new Set(), cards: [], sawNoOptions: false };
  let steps = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const runModel = provider === "openai" ? runOpenAI : runAnthropic;
    const result = await runModel({
      system: buildSystemPrompt({ now, rules: settings.rules, courts: settings.courts, openPlayFee: settings.openPlay.fee }),
      messages,
      tools: playerToolDefs(ctx),
      maxIterations: LIMITS.maxIterations,
      maxTokens: LIMITS.maxTokens,
    });
    steps = result.steps;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    const refused = result.refused;
    let text = refused ? "I can only help with courts, booking and the yard." : result.text;
    text = plainText(text);
    if (!text) text = ctx.cards.length ? "Here are open courts you can book:" : LIMIT_TEXT.error;

    const outcome = refused ? "declined" : ctx.cards.length ? "proposed" : ctx.sawNoOptions ? "no_options" : "answered";
    await db
      .from("agent_runs")
      .update({ steps, tools: [...ctx.toolsUsed], input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - started, outcome })
      .eq("id", run.id);
    return reply(200, { reply: text, cards: ctx.cards });
  } catch (err) {
    const kind = errorKind(err);
    await db
      .from("agent_runs")
      .update({ steps, tools: [...ctx.toolsUsed], input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - started, outcome: "error", error: kind })
      .eq("id", run.id);
    console.error("dink error", kind, err instanceof Error ? err.message : err);
    return reply(502, { reply: LIMIT_TEXT.error });
  }
}

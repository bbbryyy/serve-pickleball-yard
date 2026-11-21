import { z } from "zod";
import { getStaffUser } from "@/lib/auth";
import { checkConversation, LIMIT_TEXT, LIMITS, type ChatMessage } from "@/lib/agent/limits";
import { buildStaffPrompt } from "@/lib/agent/prompt";
import { runAndLog } from "@/lib/agent/run";
import { chooseProvider } from "@/lib/agent/runners";
import { staffToolDefs } from "@/lib/agent/staffTools";
import type { RunContext } from "@/lib/agent/tools";
import { getSiteSettings } from "@/lib/settings";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

// Dink in the backoffice: staff and owner. The mode comes from the signed-in user's role, never
// from the request. Tools read with the user's own session, so RLS and RPC role checks apply.

export const maxDuration = 30;

/** Requests per user per 10 minutes (staff ask more than players, and they're signed in). */
const STAFF_RATE = 60;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(LIMITS.messages + 1),
});

const reply = (status: number, body: { reply: string; queue?: unknown; limited?: boolean }) => Response.json(body, { status });

export async function POST(request: Request) {
  const user = await getStaffUser();
  if (!user) return reply(401, { reply: "Sign in to the backoffice to use Dink here." });
  const provider = chooseProvider();
  if (process.env.AGENT_ENABLED === "false" || !provider) return reply(503, { reply: LIMIT_TEXT.off });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply(400, { reply: LIMIT_TEXT.bad_shape });
  const messages = parsed.data.messages as ChatMessage[];
  const check = checkConversation(messages);
  if (!check.ok) return reply(400, { reply: LIMIT_TEXT[check.reason], limited: check.reason === "too_many" });

  const log = createServiceClient();
  const windowStart = new Date(Date.now() - LIMITS.windowMinutes * 60_000).toISOString();
  const { count: recent } = await log
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", windowStart);
  if ((recent ?? 0) >= STAFF_RATE) return reply(429, { reply: "That's a lot of questions at once. Wait a few minutes.", limited: true });

  const mode = user.role === "admin" ? "admin" : "staff";
  const { data: run, error: runError } = await log.from("agent_runs").insert({ mode, user_id: user.id }).select("id").single();
  if (runError || !run) return reply(500, { reply: LIMIT_TEXT.error });

  const settings = await getSiteSettings();
  const now = new Date();
  const ctx: RunContext = { runId: run.id, settings, now, toolsUsed: new Set(), cards: [], sawNoOptions: false };
  const text = await runAndLog({
    db: log,
    provider,
    system: buildStaffPrompt({ now, rules: settings.rules, courts: settings.courts, role: user.role, staffName: user.fullName }),
    messages,
    tools: staffToolDefs(ctx, await createUserClient(), user.role),
    ctx,
  });
  if (text === null) return reply(502, { reply: LIMIT_TEXT.error });
  return reply(200, { reply: text, queue: ctx.queue });
}

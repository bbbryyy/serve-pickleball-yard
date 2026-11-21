import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import type { ChatMessage } from "./limits";
import { openAiToolSpecs } from "./openaiTools";
import type { ToolDef } from "./tools";

export type RunInput = {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  maxIterations: number;
  maxTokens: number;
};
export type RunResult = { text: string; steps: number; inputTokens: number; outputTokens: number; refused: boolean };

export type Provider = "openai" | "anthropic";

/** Which provider to use: AGENT_PROVIDER, or whichever key is set (OpenAI first). */
export function chooseProvider(): Provider | null {
  const wanted = process.env.AGENT_PROVIDER;
  if (wanted === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (wanted === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

/** Short error label for the run log (never the message text). */
export function errorKind(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError || err instanceof OpenAI.RateLimitError) return "provider_rate_limit";
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) return "provider_connection";
  if (err instanceof Anthropic.APIError) return `provider_${err.status ?? "error"}`;
  if (err instanceof OpenAI.APIError) return `provider_${err.status ?? "error"}`;
  return "server";
}

/** Claude via the official SDK's tool runner (it runs the tool loop). */
export async function runAnthropic(input: RunInput): Promise<RunResult> {
  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: process.env.AGENT_MODEL || "claude-haiku-5-5",
    max_tokens: input.maxTokens,
    max_iterations: input.maxIterations,
    output_config: { effort: "low" },
    system: input.system,
    tools: input.tools.map((t) => betaZodTool({ name: t.name, description: t.description, inputSchema: t.schema, run: t.run as (args: unknown) => Promise<string> })),
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const result: RunResult = { text: "", steps: 0, inputTokens: 0, outputTokens: 0, refused: false };
  let last: Anthropic.Beta.BetaMessage | null = null;
  for await (const message of runner) {
    result.steps++;
    result.inputTokens += message.usage.input_tokens;
    result.outputTokens += message.usage.output_tokens;
    last = message;
  }
  result.refused = last?.stop_reason === "refusal";
  result.text = (last?.content ?? [])
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return result;
}

/** OpenAI-compatible endpoint (e.g. Vocareum) with a small tool loop; every tool input is validated before it runs. */
export async function runOpenAI(input: RunInput): Promise<RunResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const byName = new Map(input.tools.map((t) => [t.name, t]));
  const tools = openAiToolSpecs(input.tools);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: input.system },
    ...input.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const result: RunResult = { text: "", steps: 0, inputTokens: 0, outputTokens: 0, refused: false };

  for (let i = 0; i < input.maxIterations; i++) {
    const res = await client.chat.completions.create({
      model: process.env.AGENT_MODEL || "gpt-4o-mini",
      max_tokens: input.maxTokens,
      temperature: 0.3,
      messages,
      tools,
    });
    result.steps++;
    result.inputTokens += res.usage?.prompt_tokens ?? 0;
    result.outputTokens += res.usage?.completion_tokens ?? 0;
    const choice = res.choices[0];
    const msg = choice?.message;
    if (!msg) break;
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (!calls.length) {
      result.refused = Boolean(msg.refusal);
      result.text = (msg.content ?? "").trim();
      return result;
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      const tool = byName.get(call.function.name);
      let content: string;
      if (!tool) content = JSON.stringify({ error: `Unknown tool ${call.function.name}` });
      else {
        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = undefined;
        }
        const parsed = tool.schema.safeParse(args);
        content = parsed.success
          ? await tool.run(parsed.data as never)
          : JSON.stringify({ error: "Invalid input", issues: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`) });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  // ran out of tool steps: return whatever text the last turn had (the route falls back to a default)
  return result;
}

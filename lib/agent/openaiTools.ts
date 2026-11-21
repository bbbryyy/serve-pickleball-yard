// Provider-neutral tool definition → OpenAI function-calling spec (pure).
import { z } from "zod";

export type ToolSpecInput = { name: string; description: string; schema: z.ZodType };

export type OpenAiToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export function openAiToolSpecs(defs: ToolSpecInput[]): OpenAiToolSpec[] {
  return defs.map((d) => {
    // "input" shape: fields with defaults stay optional for the model
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(d.schema, { io: "input" }) as Record<string, unknown>;
    void _ignored;
    return { type: "function", function: { name: d.name, description: d.description, parameters } };
  });
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper around the Anthropic SDK.
 *
 * - Model defaults to Claude Opus 5.5; override with CLAUDE_MODEL.
 * - Uses structured outputs (JSON schema) so every pipeline step gets typed data back.
 * - Opts into server-side refusal fallbacks, and retries once without them if the
 *   account or platform rejects the beta.
 * - When no credentials are configured the app runs in "offline" mode and callers
 *   fall back to the heuristic implementations in `heuristics.ts`.
 */

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

export function aiEnabled(): boolean {
  if (process.env.COMPANY_BRAIN_OFFLINE === "true") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export type Effort = "low" | "medium" | "high";

export class AiRefusal extends Error {}

type JsonSchema = Record<string, unknown>;

export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schema: JsonSchema;
  effort?: Effort;
  maxTokens?: number;
}): Promise<T> {
  const base = {
    model: MODEL,
    max_tokens: opts.maxTokens ?? 32000,
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: opts.prompt }],
    output_config: {
      effort: opts.effort ?? "medium",
      format: { type: "json_schema" as const, schema: opts.schema },
    },
  };

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await anthropic()
      .beta.messages.stream({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      .finalMessage();
  } catch (err) {
    // Some platforms/accounts don't offer the fallback beta; run the plain request.
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
      message = await anthropic().beta.messages.stream(base).finalMessage();
    } else {
      throw err;
    }
  }

  if (message.stop_reason === "refusal") {
    throw new AiRefusal("Claude declined to process this content.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude ran out of output tokens before finishing; try a smaller batch.");
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

/** Strict-mode JSON schema helpers (every object closed, every key required). */
export const S = {
  str: (description?: string) => ({ type: "string", ...(description ? { description } : {}) }),
  num: (description?: string) => ({ type: "number", ...(description ? { description } : {}) }),
  bool: (description?: string) => ({ type: "boolean", ...(description ? { description } : {}) }),
  int: (description?: string) => ({ type: "integer", ...(description ? { description } : {}) }),
  enumOf: (values: readonly string[], description?: string) => ({
    type: "string",
    enum: values,
    ...(description ? { description } : {}),
  }),
  arr: (items: JsonSchema, description?: string) => ({
    type: "array",
    items,
    ...(description ? { description } : {}),
  }),
  obj: (properties: Record<string, JsonSchema>) => ({
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }),
};

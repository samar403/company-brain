import "server-only";
import { authenticateAgent, type AgentAuth } from "./auth";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });
export const apiError = (status: number, message: string) => json({ error: { status, message } }, status);
export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Wraps an agent-facing handler with API-key auth, scope checks and error handling. */
export function agentRoute(
  scope: "read" | "write",
  handler: (req: Request, auth: AgentAuth, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = authenticateAgent(req);
    if (!auth) return apiError(401, "Missing or invalid API key. Send 'Authorization: Bearer cb_live_...'.");
    if (!auth.scopes.includes(scope)) return apiError(403, `This key lacks the '${scope}' scope.`);
    try {
      return await handler(req, auth, ctx);
    } catch (err) {
      console.error(err);
      return apiError(500, err instanceof Error ? err.message : "Internal error");
    }
  };
}

export function publicEntry(e: {
  id: number;
  type: string;
  title: string;
  body: string;
  confidence: number;
  status: string;
  owner: string | null;
  topic_name?: string | null;
  topic_slug?: string | null;
  updated_at: string;
  snippet?: string;
}) {
  return {
    id: `E${e.id}`,
    type: e.type,
    title: e.title,
    body: e.body,
    topic: e.topic_name ?? null,
    topic_slug: e.topic_slug ?? null,
    owner: e.owner,
    status: e.status,
    reviewed: e.status === "approved",
    confidence: Math.round(e.confidence * 100) / 100,
    updated_at: e.updated_at,
  };
}

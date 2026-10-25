import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateAgent } from "@/lib/auth";
import { createMcpServer } from "@/lib/mcp";
import { apiError, preflight } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const OPTIONS = preflight;

/**
 * Remote MCP server (Streamable HTTP, stateless). Point any MCP client at
 * https://<host>/api/mcp with header `Authorization: Bearer cb_live_...`.
 */
async function handle(req: Request) {
  const auth = authenticateAgent(req);
  if (!auth) return apiError(401, "Missing or invalid API key. Send 'Authorization: Bearer cb_live_...'.");
  if (!auth.scopes.includes("read")) return apiError(403, "This key lacks the 'read' scope.");

  const server = createMcpServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", "*");
  return new Response(res.body, { status: res.status, headers });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

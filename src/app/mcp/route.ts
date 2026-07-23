import { authenticateAgentRequest } from "@/lib/agent/auth";
import {
  approveAgentContent,
  generateAgentDraft,
  getAgentContent,
  listAgentContent,
  listAgentProperties,
  reviseAgentDraft,
  submitAgentDraftForReview,
} from "@/lib/agent/content-service";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v4";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!allowedHost(request)) {
    return Response.json({ error: "invalid_host" }, { status: 403 });
  }
  const principal = await authenticateAgentRequest(request, ["content:read"]);
  if (!principal) {
    return Response.json({ error: "unauthorized_agent" }, { status: 401, headers: corsHeaders() });
  }

  const server = new McpServer({ name: "herzen-content-engine", version: "1.0.0" });
  server.registerTool(
    "list_properties",
    {
      title: "List content properties",
      description: "List the active Herzen Content Engine properties and their canonical slugs.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolResult(await listAgentProperties()),
  );
  server.registerTool(
    "list_content",
    {
      title: "List content",
      description: "List Content Engine drafts and published items, optionally filtered by property or status.",
      inputSchema: z.object({
        property: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => toolResult(await listAgentContent(input)),
  );
  server.registerTool(
    "get_content",
    {
      title: "Get content",
      description: "Get a complete Content Engine item and all of its versions by ID.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => toolResult(await getAgentContent(id)),
  );
  server.registerTool(
    "generate_draft",
    {
      title: "Generate draft",
      description: "Generate a brand-grounded draft, save it in Needs Review, and return its reviewUrl. This never publishes content.",
      inputSchema: z.object({
        property: z.string().min(1),
        prompt: z.string().min(1).max(100_000),
        contentType: z.enum(["article", "newsletter", "social_post"]).optional(),
        requestedTitle: z.string().min(1).max(240).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      requireScope(principal.scopes, "content:write");
      return toolResult(await generateAgentDraft(input, principal));
    },
  );
  server.registerTool(
    "revise_draft",
    {
      title: "Revise draft",
      description: "Create a new version of an existing unpublished draft using a revision request.",
      inputSchema: z.object({
        id: z.string().uuid(),
        revisionRequest: z.string().min(1).max(50_000),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      requireScope(principal.scopes, "content:write");
      return toolResult(await reviseAgentDraft(input, principal));
    },
  );
  server.registerTool(
    "approve_content",
    {
      title: "Approve content",
      description: "Approve an item in Needs Review without publishing, scheduling, or triggering a deployment.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id }) => {
      requireScope(principal.scopes, "content:approve");
      return toolResult(await approveAgentContent(id, principal));
    },
  );
  server.registerTool(
    "submit_for_review",
    {
      title: "Submit for review",
      description: "Place an unpublished content item in the human review queue. This never publishes content.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id }) => {
      requireScope(principal.scopes, "content:write");
      return toolResult(await submitAgentDraftForReview(id, principal));
    },
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function GET() {
  return Response.json(
    { error: "method_not_allowed", message: "Use MCP Streamable HTTP POST requests." },
    { status: 405, headers: { ...corsHeaders(), Allow: "POST, OPTIONS" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function allowedHost(request: Request) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  return host === "content.herzenco.co" || host === "localhost" || host.endsWith(".vercel.app");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
  };
}

function requireScope(scopes: string[], scope: string) {
  if (!scopes.includes(scope)) throw new Error(`missing_scope: ${scope}`);
}

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: { data },
  };
}

import { authenticateAgentRequest } from "@/lib/agent/auth";
import {
  approveAgentContent,
  generateAgentDraft,
  getAgentContent,
  listContentReviewComments,
  listAgentContent,
  listAgentProperties,
  reviseAgentDraft,
  reviseAgentDraftFromComments,
  runAgentQa,
  submitAgentDraftForReview,
} from "@/lib/agent/content-service";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v4";
import { listContentAudit } from "@/lib/content-audit";
import {
  addAgentPropertyFeedbackRule,
  addAgentPropertyResearch,
  listPropertyKnowledge,
} from "@/lib/property-knowledge";

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
    "list_property_knowledge",
    {
      title: "List property feedback and research",
      description: "List the permanent Feedback + Rules memory and research inbox for one property, including active and sunset research.",
      inputSchema: z.object({ property: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ property }) => toolResult(await listPropertyKnowledge(property)),
  );
  server.registerTool(
    "list_feedback_rules",
    {
      title: "Review property feedback and rules",
      description: "Review the complete append-only Feedback + Rules memory for a property before generating or revising content. Entries include their author, rationale, source comment, and source content item.",
      inputSchema: z.object({ property: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ property }) => {
      const knowledge = await listPropertyKnowledge(property);
      return toolResult({ property, feedback: knowledge.feedback });
    },
  );
  server.registerTool(
    "add_feedback_rule",
    {
      title: "Add property feedback or rule",
      description: "Append a new rule, feedback item, or edit lesson to a property's permanent generation memory. Use this for C-3PO rules. Existing entries are never overwritten.",
      inputSchema: z.object({
        property: z.string().min(1),
        entryType: z.enum(["feedback", "edit", "rule"]).default("rule"),
        instruction: z.string().min(1).max(10_000),
        rationale: z.string().min(1).max(10_000),
        sourceCommentId: z.string().uuid().optional(),
        sourceContentItemId: z.string().uuid().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({
      property,
      entryType,
      instruction,
      rationale,
      sourceCommentId,
      sourceContentItemId,
    }) => {
      requireScope(principal.scopes, "content:write");
      return toolResult(await addAgentPropertyFeedbackRule({
        slug: property,
        entryType,
        instruction,
        rationale,
        sourceCommentId,
        sourceContentItemId,
        actorUserId: principal.actorUserId,
      }));
    },
  );
  server.registerTool(
    "add_research",
    {
      title: "Add property research",
      description: "Add a Markdown research document to a property's active research inbox. Use this for K2 research handoffs. The source is retained and automatically considered during future generation.",
      inputSchema: z.object({
        property: z.string().min(1),
        title: z.string().min(1).max(240),
        markdown: z.string().min(1).max(100_000),
        originalFilename: z.string().max(255).optional(),
        sourceUrl: z.string().url().max(2_000).optional(),
        expiresInDays: z.number().int().min(7).max(365).default(90),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ property, title, markdown, originalFilename, sourceUrl, expiresInDays }) => {
      requireScope(principal.scopes, "content:write");
      return toolResult(await addAgentPropertyResearch({
        slug: property,
        title,
        body: markdown,
        originalFilename,
        sourceUrl,
        expiresInDays,
        actorUserId: principal.actorUserId,
      }));
    },
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
    "list_comments",
    {
      title: "List review comments",
      description: "List all persistent reviewer comments for a content item, including open and already-applied comments.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => toolResult(await listContentReviewComments(id)),
  );
  server.registerTool(
    "get_content_audit",
    {
      title: "Get content audit trail",
      description: "List every recorded change to a content item, including actor, timestamp, version, action, and field-level before/after values.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => toolResult(await listContentAudit(id)),
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
    "revise_from_comments",
    {
      title: "Generate revised draft from comments",
      description: "Create the next complete draft version using every open reviewer comment, mark those comments applied, and return the same shareable reviewUrl.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ id }) => {
      requireScope(principal.scopes, "content:write");
      return toolResult(await reviseAgentDraftFromComments(id, principal));
    },
  );
  server.registerTool(
    "run_qa",
    {
      title: "Run Anthropic QA",
      description: "Review the latest OpenAI-generated version with Anthropic and populate quality, brand, SEO/AEO, metadata, and keyword results.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id }) => {
      requireScope(principal.scopes, "content:write");
      return toolResult(await runAgentQa(id, principal));
    },
  );
  server.registerTool(
    "approve_content",
    {
      title: "Approve content",
      description: "Approve an item and either publish it now or schedule its publication. Published results include the canonical URL Lupe must return.",
      inputSchema: z.object({
        id: z.string().uuid(),
        mode: z.enum(["now", "scheduled"]),
        publishAt: z.string().datetime().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, mode, publishAt }) => {
      requireScope(principal.scopes, "content:approve");
      return toolResult(await approveAgentContent(id, principal, { mode, publishAt }));
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

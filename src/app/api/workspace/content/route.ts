import { authorizeSession } from "@/lib/auth/server-authorization";
import { generateAgentDraft, listWorkspaceContent } from "@/lib/agent/content-service";
import { z } from "zod";

export const runtime = "nodejs";

const generateSchema = z.object({
  property: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(100_000),
  contentType: z.enum(["article", "newsletter", "social_post"]).optional(),
  requestedTitle: z.string().trim().min(1).max(240).optional(),
});

export async function GET() {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor", "viewer"]);
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json({ data: await listWorkspaceContent() });
  } catch (error) {
    return Response.json(
      { error: "workspace_content_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor"]);
  if (!authorization.ok) return authorization.response;
  const parsed = generateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  try {
    const data = await generateAgentDraft(parsed.data, {
      apiKeyId: null,
      actorUserId: authorization.user.id,
      scopes: ["content:read", "content:write"],
    });
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: "workspace_generation_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

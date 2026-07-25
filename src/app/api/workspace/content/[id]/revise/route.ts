import { reviseAgentDraft } from "@/lib/agent/content-service";
import { authorizeSession } from "@/lib/auth/server-authorization";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor"]);
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json().catch(() => ({}))) as { revisionRequest?: unknown };
    const revisionRequest =
      typeof body.revisionRequest === "string" && body.revisionRequest.trim()
        ? body.revisionRequest.trim()
        : "Regenerate the complete draft. Preserve the strategy and core topic while improving specificity, clarity, structure, and human voice.";
    return Response.json({
      data: await reviseAgentDraft(
        { id: (await params).id, revisionRequest },
        {
          apiKeyId: null,
          actorUserId: authorization.user.id,
          scopes: ["content:write"],
        },
      ),
    });
  } catch (error) {
    return Response.json(
      { error: "workspace_revision_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

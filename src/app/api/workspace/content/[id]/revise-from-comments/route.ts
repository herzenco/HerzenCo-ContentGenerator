import { reviseAgentDraftFromComments } from "@/lib/agent/content-service";
import { authorizeSession } from "@/lib/auth/server-authorization";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor"]);
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json({
      data: await reviseAgentDraftFromComments((await params).id, {
        apiKeyId: null,
        actorUserId: authorization.user.id,
        scopes: ["content:write"],
      }),
    });
  } catch (error) {
    return Response.json(
      { error: "comment_revision_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

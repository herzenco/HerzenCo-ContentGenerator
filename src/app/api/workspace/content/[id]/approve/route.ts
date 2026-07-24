import { approveAgentContent } from "@/lib/agent/content-service";
import { authorizeSession } from "@/lib/auth/server-authorization";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer"]);
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown; publishAt?: unknown };
    if (body.mode !== "now" && body.mode !== "scheduled") {
      return Response.json({ error: "publish_decision_required" }, { status: 400 });
    }
    return Response.json({
      data: await approveAgentContent((await params).id, {
        apiKeyId: null,
        actorUserId: authorization.user.id,
        scopes: ["content:approve"],
      }, {
        mode: body.mode,
        publishAt: typeof body.publishAt === "string" ? body.publishAt : undefined,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: "workspace_approval_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

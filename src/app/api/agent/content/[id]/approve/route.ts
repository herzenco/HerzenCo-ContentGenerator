import { agentUnauthorizedResponse, authenticateAgentRequest } from "@/lib/agent/auth";
import { approveAgentContent } from "@/lib/agent/content-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticateAgentRequest(request, ["content:approve"]);
  if (!principal) return agentUnauthorizedResponse();
  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown; publishAt?: unknown };
    if (body.mode !== "now" && body.mode !== "scheduled") {
      return Response.json({ error: "publish_decision_required" }, { status: 400 });
    }
    return Response.json({
      data: await approveAgentContent((await params).id, principal, {
        mode: body.mode,
        publishAt: typeof body.publishAt === "string" ? body.publishAt : undefined,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: "agent_approval_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

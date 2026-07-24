import { agentUnauthorizedResponse, authenticateAgentRequest } from "@/lib/agent/auth";
import { listContentReviewComments } from "@/lib/agent/content-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticateAgentRequest(request, ["content:read"]);
  if (!principal) return agentUnauthorizedResponse();
  try {
    return Response.json({ data: await listContentReviewComments((await params).id) });
  } catch (error) {
    return Response.json(
      { error: "agent_request_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

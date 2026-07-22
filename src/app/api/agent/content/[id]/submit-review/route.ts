import { agentUnauthorizedResponse, authenticateAgentRequest } from "@/lib/agent/auth";
import { submitAgentDraftForReview } from "@/lib/agent/content-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticateAgentRequest(request, ["content:write"]);
  if (!principal) return agentUnauthorizedResponse();
  try {
    return Response.json({ data: await submitAgentDraftForReview((await params).id, principal) });
  } catch (error) {
    return Response.json(
      { error: "agent_request_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

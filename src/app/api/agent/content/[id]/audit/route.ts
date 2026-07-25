import { agentUnauthorizedResponse, authenticateAgentRequest } from "@/lib/agent/auth";
import { getAgentContent } from "@/lib/agent/content-service";
import { listContentAudit } from "@/lib/content-audit";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticateAgentRequest(request, ["content:read"]);
  if (!principal) return agentUnauthorizedResponse();
  try {
    const { id } = await params;
    await getAgentContent(id);
    return Response.json({ data: await listContentAudit(id) });
  } catch (error) {
    return Response.json(
      { error: "agent_audit_load_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

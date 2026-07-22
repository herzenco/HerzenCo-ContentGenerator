import { agentUnauthorizedResponse, authenticateAgentRequest } from "@/lib/agent/auth";
import { listAgentProperties } from "@/lib/agent/content-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const principal = await authenticateAgentRequest(request, ["content:read"]);
  if (!principal) return agentUnauthorizedResponse();
  try {
    return Response.json({ data: await listAgentProperties() });
  } catch (error) {
    return agentError(error);
  }
}

function agentError(error: unknown) {
  return Response.json(
    { error: "agent_request_failed", message: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 },
  );
}

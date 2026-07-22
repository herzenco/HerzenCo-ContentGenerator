import { agentUnauthorizedResponse, authenticateAgentRequest } from "@/lib/agent/auth";
import { reviseAgentDraft } from "@/lib/agent/content-service";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ revisionRequest: z.string().trim().min(1).max(50_000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await authenticateAgentRequest(request, ["content:write"]);
  if (!principal) return agentUnauthorizedResponse();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return Response.json({
      data: await reviseAgentDraft(
        { id: (await params).id, revisionRequest: parsed.data.revisionRequest },
        principal,
      ),
    });
  } catch (error) {
    return Response.json(
      { error: "agent_request_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

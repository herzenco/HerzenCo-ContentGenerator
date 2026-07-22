import { agentUnauthorizedResponse, authenticateAgentRequest } from "@/lib/agent/auth";
import { generateAgentDraft, listAgentContent } from "@/lib/agent/content-service";
import { z } from "zod";

export const runtime = "nodejs";

const generateSchema = z.object({
  property: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(100_000),
  contentType: z.enum(["article", "newsletter", "social_post"]).optional(),
  requestedTitle: z.string().trim().min(1).max(240).optional(),
});

export async function GET(request: Request) {
  const principal = await authenticateAgentRequest(request, ["content:read"]);
  if (!principal) return agentUnauthorizedResponse();
  const url = new URL(request.url);
  try {
    const data = await listAgentContent({
      property: url.searchParams.get("property")?.trim() || undefined,
      status: url.searchParams.get("status")?.trim() || undefined,
      limit: Number(url.searchParams.get("limit") || 20),
    });
    return Response.json({ data });
  } catch (error) {
    return agentError(error);
  }
}

export async function POST(request: Request) {
  const principal = await authenticateAgentRequest(request, ["content:write"]);
  if (!principal) return agentUnauthorizedResponse();
  const parsed = generateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return Response.json({ data: await generateAgentDraft(parsed.data, principal) }, { status: 201 });
  } catch (error) {
    return agentError(error);
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function agentError(error: unknown) {
  return Response.json(
    { error: "agent_request_failed", message: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 },
  );
}

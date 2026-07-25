import { getAgentContent } from "@/lib/agent/content-service";
import { listContentAudit } from "@/lib/content-audit";
import { authorizeSession } from "@/lib/auth/server-authorization";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor", "viewer"]);
  if (!authorization.ok) return authorization.response;
  try {
    const { id } = await params;
    await getAgentContent(id);
    return Response.json({ data: await listContentAudit(id) });
  } catch (error) {
    return Response.json(
      { error: "content_audit_load_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

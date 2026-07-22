import { authorizeSession } from "@/lib/auth/server-authorization";
import { listWorkspaceContent } from "@/lib/agent/content-service";

export const runtime = "nodejs";

export async function GET() {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor", "viewer"]);
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json({ data: await listWorkspaceContent() });
  } catch (error) {
    return Response.json(
      { error: "workspace_content_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

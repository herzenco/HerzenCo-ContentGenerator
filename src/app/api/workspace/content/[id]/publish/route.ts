import { authorizeSession } from "@/lib/auth/server-authorization";
import { publishWorkspaceContent } from "@/lib/agent/content-service";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSession(["admin", "publisher"]);
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json({
      data: await publishWorkspaceContent((await params).id, authorization.user.id),
    });
  } catch (error) {
    return Response.json(
      { error: "workspace_publish_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

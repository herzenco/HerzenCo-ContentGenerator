import { authorizeSession } from "@/lib/auth/server-authorization";
import { republishWorkspaceContent } from "@/lib/publication-lifecycle";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeSession(["admin", "publisher"]);
  if (!authorization.ok) return authorization.response;

  try {
    return Response.json({
      data: await republishWorkspaceContent({
        id: (await params).id,
        actorUserId: authorization.user.id,
        actorEmail: authorization.user.email ?? "",
      }),
    });
  } catch (error) {
    return Response.json(
      {
        error: "workspace_republish_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 409 },
    );
  }
}

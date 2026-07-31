import { authorizeSession } from "@/lib/auth/server-authorization";
import { unpublishWorkspaceContent } from "@/lib/publication-lifecycle";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  reason: z.string().trim().max(2_000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeSession(["admin", "publisher"]);
  if (!authorization.ok) return authorization.response;

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    return Response.json({
      data: await unpublishWorkspaceContent({
        id: (await params).id,
        actorUserId: authorization.user.id,
        actorEmail: authorization.user.email ?? "",
        reason: parsed.data.reason,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        error: "workspace_unpublish_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 409 },
    );
  }
}

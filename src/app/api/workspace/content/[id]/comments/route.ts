import {
  addContentReviewComment,
  listContentReviewComments,
} from "@/lib/agent/content-service";
import { authorizeSession } from "@/lib/auth/server-authorization";
import { z } from "zod";

export const runtime = "nodejs";

const commentSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
  anchorText: z.string().trim().max(5_000).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor", "viewer"]);
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json({ data: await listContentReviewComments((await params).id) });
  } catch (error) {
    return Response.json(
      { error: "comments_read_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor"]);
  if (!authorization.ok) return authorization.response;
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_comment", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  try {
    return Response.json({
      data: await addContentReviewComment(
        {
          id: (await params).id,
          body: parsed.data.body,
          anchorText: parsed.data.anchorText,
          authorEmail: authorization.user.email,
        },
        {
          apiKeyId: null,
          actorUserId: authorization.user.id,
          scopes: ["content:write"],
        },
      ),
    });
  } catch (error) {
    return Response.json(
      { error: "comment_create_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

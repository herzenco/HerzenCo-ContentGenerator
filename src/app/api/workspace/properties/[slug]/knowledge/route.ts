import { authorizeSession } from "@/lib/auth/server-authorization";
import {
  addPropertyFeedbackRule,
  addPropertyResearch,
  listPropertyKnowledge,
} from "@/lib/property-knowledge";
import { z } from "zod";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  section: z.literal("feedback"),
  entryType: z.enum(["feedback", "edit", "rule"]),
  instruction: z.string().trim().min(1).max(10_000),
  rationale: z.string().trim().max(10_000).optional(),
  sourceCommentId: z.string().uuid().optional(),
  sourceContentItemId: z.string().uuid().optional(),
});

const researchSchema = z.object({
  section: z.literal("research"),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(100_000),
  sourceUrl: z.string().trim().url().max(2_000).optional().or(z.literal("")),
  originalFilename: z.string().trim().max(255).optional(),
  expiresInDays: z.number().int().min(7).max(365).optional(),
});

const createSchema = z.discriminatedUnion("section", [feedbackSchema, researchSchema]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor", "viewer"]);
  if (!authorization.ok) return authorization.response;
  try {
    const { slug } = await params;
    return Response.json({ data: await listPropertyKnowledge(slug) });
  } catch (error) {
    return Response.json(
      { error: "property_knowledge_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authorization = await authorizeSession(["admin", "publisher", "reviewer", "editor"]);
  if (!authorization.ok) return authorization.response;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const { slug } = await params;
    const actorEmail = authorization.user.email?.toLowerCase() ?? "unknown";
    const data = parsed.data.section === "feedback"
      ? await addPropertyFeedbackRule({
          slug,
          entryType: parsed.data.entryType,
          instruction: parsed.data.instruction,
          rationale: parsed.data.rationale,
          sourceCommentId: parsed.data.sourceCommentId,
          sourceContentItemId: parsed.data.sourceContentItemId,
          actorUserId: authorization.user.id,
          actorEmail,
        })
      : await addPropertyResearch({
          slug,
          title: parsed.data.title,
          body: parsed.data.body,
          sourceUrl: parsed.data.sourceUrl,
          originalFilename: parsed.data.originalFilename,
          expiresInDays: parsed.data.expiresInDays,
          actorUserId: authorization.user.id,
          actorEmail,
        });
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: "property_knowledge_create_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

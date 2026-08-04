import { timingSafeEqual } from "node:crypto";
import {
  savePublishedContent,
  triggerWebsiteBuild,
} from "@/lib/published-content";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const payloadSchema = z.object({
  content_item_id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(250_000),
  meta_description: z.string().trim().min(1).max(300),
  publish_at: z.string().datetime().nullable().optional(),
  seo_score: z.number().int().min(0).max(100).nullable().optional(),
  aeo_score: z.number().int().min(0).max(100).nullable().optional(),
});

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const input = parsed.data;
    const qualityScores = [input.seo_score, input.aeo_score].filter(
      (score): score is number => typeof score === "number",
    );
    const qualityScore = qualityScores.length
      ? Math.min(...qualityScores)
      : null;
    const content = await savePublishedContent(
      createSupabaseAdminClient(),
      {
        property: "herzenco",
        contentType: "article",
        title: input.title,
        body: input.body,
        excerpt: input.meta_description.slice(0, 1_000),
        metaTitle: input.title.slice(0, 120),
        metaDescription: input.meta_description,
        qualityScore,
        publishedAt: input.publish_at || undefined,
      },
      {
        email: "occ-automation@herzenco.co",
        type: "system",
      },
    );

    if (content.deployHookUrl?.trim()) {
      await triggerWebsiteBuild(content.deployHookUrl);
    }

    return Response.json({
      id: content.id,
      final_url: `https://herzenco.co/resources/${encodeURIComponent(content.slug)}/`,
      published_at: content.publishedAt,
      source_content_item_id: input.content_item_id,
    });
  } catch (error) {
    console.error("OCC website publication failed", error);
    return Response.json(
      {
        error: "publish_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}

function isAuthorized(request: Request) {
  const expected = process.env.PUBLISH_SECRET?.trim() || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

import { timingSafeEqual } from "node:crypto";
import {
  savePublishedContent,
  triggerWebsiteBuild,
} from "@/lib/published-content";
import { occPublicationPayloadSchema, validateOccPublicationPayload } from "@/lib/occ-publication-contract";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = occPublicationPayloadSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const requestIdempotencyKey = request.headers.get("idempotency-key")?.trim();
  const validationErrors = validateOccPublicationPayload(input, requestIdempotencyKey);
  if (validationErrors.length) return Response.json({ error: "validation_failed", validation_errors: validationErrors }, { status: 422 });

  try {
    const featuredImageUrl = input.featured_image?.url || null;
    const content = await savePublishedContent(
      createSupabaseAdminClient(),
      {
        property: "herzenco",
        contentType: "article",
        title: input.title,
        body: input.body,
        excerpt: input.seo.description.slice(0, 1_000) || input.title,
        metaTitle: input.seo.title,
        metaDescription: input.seo.description,
        publishedAt: input.publish_date || undefined,
        heroImageUrl: featuredImageUrl,
        heroImageAlt: input.featured_image?.alt_text || null,
        slug: input.slug,
        canonicalPath: input.canonical_path,
        destination: input.destination,
        keywords: input.seo.keywords,
        media: input.media,
        author: input.author,
        tags: input.tags,
        categories: input.categories,
        externalSource: "occ",
        externalSourceId: input.content_item_id,
        contentHash: input.approved_content_hash,
        sourceSnapshot: input,
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
      final_url: content.publishedUrl,
      publishing_status: "published",
      validation_errors: [],
      published_at: content.publishedAt,
      source_content_item_id: input.content_item_id,
      version: content.version,
      created: content.created,
      idempotent_replay: content.idempotentReplay,
    });
  } catch (error) {
    console.error("OCC website publication failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.startsWith("validation:")) {
      return Response.json({ error: "validation_failed", validation_errors: [message.slice("validation:".length).trim()] }, { status: 422 });
    }
    return Response.json(
      {
        error: "publish_failed",
        message,
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

import { listPublishedContent, savePublishedContent, triggerWebsiteBuild } from "@/lib/published-content";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import {
  isContentTypeAllowedForProperty,
  propertySurfaceForSlug,
} from "@/lib/property-content-types";
import { z } from "zod";

export const runtime = "nodejs";

const publishSchema = z.object({
  property: z.string().trim().min(1).max(80),
  contentType: z.enum(["article", "newsletter", "social_post"]),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(250_000),
  excerpt: z.string().trim().min(1).max(1_000),
  metaTitle: z.string().trim().min(1).max(120),
  metaDescription: z.string().trim().min(1).max(300),
  qualityScore: z.number().int().min(0).max(100).nullable().optional(),
  publishedAt: z.string().datetime().optional(),
  heroImageUrl: z.string().trim().max(2_000).nullable().optional(),
  heroImageAlt: z.string().trim().max(300).nullable().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const property = url.searchParams.get("property")?.trim() || "herzenco";
  const slug = url.searchParams.get("slug")?.trim() || undefined;

  try {
    const data = await listPublishedContent(property, slug);
    return Response.json(
      { data },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Published content lookup failed", error);
    return Response.json({ error: "content_lookup_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await authenticatedClient();
  if (!supabase) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = publishSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (
    !isContentTypeAllowedForProperty(
      { surface: propertySurfaceForSlug(parsed.data.property) },
      parsed.data.contentType,
    )
  ) {
    return Response.json(
      { error: "content_type_not_allowed_for_property" },
      { status: 400 },
    );
  }

  try {
    const content = await savePublishedContent(supabase, parsed.data);
    const websiteBuildTriggered = Boolean(content.deployHookUrl?.trim());
    if (websiteBuildTriggered) await triggerWebsiteBuild(content.deployHookUrl);
    const publicContent = {
      id: content.id,
      slug: content.slug,
      version: content.version,
      publishedAt: content.publishedAt,
    };
    return Response.json({ data: publicContent, websiteBuildTriggered }, { status: 201 });
  } catch (error) {
    console.error("Content publish failed", error);
    return Response.json(
      { error: "publish_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

async function authenticatedClient() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.email?.toLowerCase().endsWith("@herzenco.co") ? supabase : null;
  } catch {
    return null;
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

import "server-only";

import { createSupabasePublicClient } from "@/utils/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublishedContent = {
  id: string;
  property: string;
  type: "article" | "newsletter" | "social_post";
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  faq: unknown[];
  jsonLd: Record<string, unknown>;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  publishedAt: string;
  updatedAt: string;
};

export async function listPublishedContent(propertySlug: string, slug?: string) {
  const supabase = createSupabasePublicClient();
  let query = supabase
    .from("published_content_feed")
    .select("*")
    .eq("property_slug", propertySlug)
    .order("published_at", { ascending: false });

  if (slug) query = query.eq("slug", slug);
  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((item): PublishedContent => {
    const jsonLd = (item.json_ld ?? {}) as Record<string, unknown>;
    const heroImageAlt =
      typeof jsonLd.heroImageAlt === "string" ? jsonLd.heroImageAlt : null;
    return {
      id: item.id,
      property: item.property_slug,
      type: item.type,
      slug: item.slug,
      title: item.title,
      body: item.body_mdx,
      excerpt: item.excerpt,
      metaTitle: item.meta_title,
      metaDescription: item.meta_description,
      faq: item.faq ?? [],
      jsonLd,
      heroImageUrl: item.hero_image_url,
      heroImageAlt,
      publishedAt: item.published_at,
      updatedAt: item.updated_at,
    };
  });
}

export async function savePublishedContent(supabase: SupabaseClient, input: {
  property: string;
  contentType: "article" | "newsletter" | "social_post";
  title: string;
  body: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  qualityScore?: number | null;
  publishedAt?: string;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
}) {
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, slug, revalidate_url")
    .eq("slug", input.property)
    .eq("active", true)
    .maybeSingle();
  if (propertyError) throw propertyError;
  if (!property) throw new Error(`Unknown property: ${input.property}`);

  const slug = slugify(input.title);
  const publishedAt = input.publishedAt || new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("content_items")
    .select("id")
    .eq("property_id", property.id)
    .eq("slug", slug)
    .maybeSingle();
  if (existingError) throw existingError;

  let contentItemId = existing?.id as string | undefined;
  if (contentItemId) {
    const { error } = await supabase
      .from("content_items")
      .update({
        type: input.contentType,
        status: "published",
        quality_score: input.qualityScore ?? null,
        published_at: publishedAt,
        hero_image_url: input.heroImageUrl ?? null,
      })
      .eq("id", contentItemId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("content_items")
      .insert({
        property_id: property.id,
        type: input.contentType,
        slug,
        status: "published",
        quality_score: input.qualityScore ?? null,
        published_at: publishedAt,
        source: "quick_generate",
        hero_image_url: input.heroImageUrl ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    contentItemId = data.id;
  }

  const { data: latestVersion, error: versionLookupError } = await supabase
    .from("content_versions")
    .select("version")
    .eq("content_item_id", contentItemId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionLookupError) throw versionLookupError;

  const version = (latestVersion?.version ?? 0) + 1;
  const { error: versionError } = await supabase.from("content_versions").insert({
    content_item_id: contentItemId,
    version,
    title: input.title,
    body_mdx: input.body,
    excerpt: input.excerpt,
    meta_title: input.metaTitle.slice(0, 60),
    meta_description: input.metaDescription.slice(0, 155),
    json_ld: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: input.title,
      description: input.metaDescription,
      datePublished: publishedAt,
      heroImageAlt: input.heroImageAlt ?? null,
    },
  });
  if (versionError) throw versionError;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.metaDescription,
    datePublished: publishedAt,
    heroImageAlt: input.heroImageAlt ?? null,
  };
  const { error: feedError } = await supabase.from("published_content_feed").upsert(
    {
      id: contentItemId,
      property_slug: property.slug,
      type: input.contentType,
      slug,
      title: input.title,
      body_mdx: input.body,
      excerpt: input.excerpt,
      meta_title: input.metaTitle.slice(0, 60),
      meta_description: input.metaDescription.slice(0, 155),
      faq: [],
      json_ld: jsonLd,
      hero_image_url: input.heroImageUrl ?? null,
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (feedError) throw feedError;

  return {
    id: contentItemId,
    slug,
    version,
    publishedAt,
    deployHookUrl: property.revalidate_url as string | null,
  };
}

export async function triggerWebsiteBuild(deployHookUrl?: string | null) {
  deployHookUrl = deployHookUrl?.trim();
  if (!deployHookUrl) throw new Error("DEPLOY_HOOK_URL is not configured");
  const response = await fetch(deployHookUrl, { method: "POST", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Website deploy hook returned ${response.status}`);
  }
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

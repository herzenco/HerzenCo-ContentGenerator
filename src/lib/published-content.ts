import "server-only";

import { recordContentAudit } from "@/lib/content-audit";
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
    .eq("visible", true)
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
  slug?: string;
  canonicalPath?: string;
  destination?: string;
  keywords?: string[];
  media?: unknown[];
  author?: string | null;
  tags?: string[];
  categories?: string[];
  externalSource?: string;
  externalSourceId?: string;
  contentHash?: string;
  sourceSnapshot?: Record<string, unknown>;
}, actor: {
  userId?: string | null;
  email?: string | null;
  type?: "user" | "agent" | "system" | "website";
}) {
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, slug, base_url, revalidate_url")
    .eq("slug", input.property)
    .eq("active", true)
    .maybeSingle();
  if (propertyError) throw propertyError;
  if (!property) throw new Error(`Unknown property: ${input.property}`);

  const slug = input.slug?.trim() || slugify(input.title);
  const publishedAt = input.publishedAt || new Date().toISOString();
  const canonicalPath = input.canonicalPath?.trim() || `/resources/${slug}/`;
  const publishedUrl = new URL(canonicalPath, property.base_url || "https://herzenco.co").toString();
  let existingQuery = supabase
    .from("content_items")
    .select("id,slug,status,published_at,published_url,approved_content_hash,external_source,external_source_id")
    .eq("property_id", property.id);
  existingQuery = input.externalSource && input.externalSourceId
    ? existingQuery.eq("external_source", input.externalSource).eq("external_source_id", input.externalSourceId)
    : existingQuery.eq("slug", slug);
  const { data: foundExternalOrSlug, error: existingError } = await existingQuery.maybeSingle();
  let foundExisting = foundExternalOrSlug;
  let existing = foundExisting;
  if (existingError) throw existingError;
  if (!existing && input.externalSource && input.externalSourceId) {
    const slugMatch = await supabase.from("content_items").select("id,slug,status,published_at,published_url,approved_content_hash,external_source,external_source_id").eq("property_id", property.id).eq("slug", slug).maybeSingle();
    if (slugMatch.error) throw slugMatch.error;
    if (slugMatch.data?.external_source_id && (slugMatch.data.external_source !== input.externalSource || slugMatch.data.external_source_id !== input.externalSourceId)) {
      throw new Error(`validation: Canonical path ${canonicalPath} is already owned by another source record.`);
    }
    foundExisting = slugMatch.data;
    existing = foundExisting;
  }

  let contentItemId = existing?.id as string | undefined;
  let created = false;
  const publicationMetadata = {
    keywords: input.keywords ?? [],
    media: input.media ?? [],
    author: input.author ?? null,
    tags: input.tags ?? [],
    categories: input.categories ?? [],
  };
  const itemUpdate = {
    type: input.contentType,
    slug,
    status: "published",
    quality_score: input.qualityScore ?? null,
    published_at: publishedAt,
    published_url: publishedUrl,
    hero_image_url: input.heroImageUrl ?? null,
    destination: input.destination ?? null,
    canonical_path: canonicalPath,
    approved_content_hash: input.contentHash ?? null,
    publication_metadata: publicationMetadata,
    external_source: input.externalSource ?? null,
    external_source_id: input.externalSourceId ?? null,
  };
  if (contentItemId) {
    const { error } = await supabase
      .from("content_items")
      .update(itemUpdate)
      .eq("id", contentItemId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("content_items")
      .insert({
        property_id: property.id,
        ...itemUpdate,
        source: input.externalSource ? "api" : "quick_generate",
        external_source: input.externalSource ?? null,
        external_source_id: input.externalSourceId ?? null,
      })
      .select("id")
      .single();
    if (error && error.code === "23505" && input.externalSource && input.externalSourceId) {
      const duplicate = await supabase.from("content_items").select("id,slug,status,published_at,published_url,approved_content_hash,external_source,external_source_id").eq("property_id", property.id).eq("external_source", input.externalSource).eq("external_source_id", input.externalSourceId).single();
      if (duplicate.error || !duplicate.data) throw error;
      existing = duplicate.data;
      contentItemId = duplicate.data.id;
      const { error: updateError } = await supabase.from("content_items").update(itemUpdate).eq("id", contentItemId);
      if (updateError) throw updateError;
    } else {
      if (error) throw error;
      contentItemId = data.id;
      created = true;
    }
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.metaDescription,
    datePublished: publishedAt,
    heroImageAlt: input.heroImageAlt ?? null,
    author: input.author ? { "@type": "Organization", name: input.author } : undefined,
    keywords: (input.keywords ?? []).join(", "),
    mainEntityOfPage: publishedUrl,
  };
  let idempotentReplay = false;
  let version: number;
  const { data: matchingVersion, error: matchingVersionError } = input.contentHash
    ? await supabase.from("content_versions").select("version").eq("content_item_id", contentItemId).eq("content_hash", input.contentHash).maybeSingle()
    : { data: null, error: null };
  if (matchingVersionError) throw matchingVersionError;
  if (matchingVersion) {
    version = matchingVersion.version;
    idempotentReplay = true;
  } else {
    const { data: latestVersion, error: versionLookupError } = await supabase.from("content_versions").select("version").eq("content_item_id", contentItemId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (versionLookupError) throw versionLookupError;
    version = (latestVersion?.version ?? 0) + 1;
    const versionPayload = {
      content_item_id: contentItemId,
      version,
      title: input.title,
      body_mdx: input.body,
      excerpt: input.excerpt,
      meta_title: input.metaTitle,
      meta_description: input.metaDescription,
      json_ld: jsonLd,
      content_hash: input.contentHash ?? null,
      keywords: input.keywords ?? [],
      media: input.media ?? [],
      author_name: input.author ?? null,
      tags: input.tags ?? [],
      categories: input.categories ?? [],
      destination: input.destination ?? null,
      canonical_path: canonicalPath,
      source_snapshot: input.sourceSnapshot ?? {},
    };
    const { error: versionError } = await supabase.from("content_versions").insert(versionPayload);
    if (versionError && versionError.code === "23505" && input.contentHash) {
      const duplicateVersion = await supabase.from("content_versions").select("version").eq("content_item_id", contentItemId).eq("content_hash", input.contentHash).single();
      if (duplicateVersion.error || !duplicateVersion.data) throw versionError;
      version = duplicateVersion.data.version;
      idempotentReplay = true;
    } else if (versionError) throw versionError;
  }

  const { error: feedError } = await supabase.from("published_content_feed").upsert(
    {
      id: contentItemId,
      property_slug: property.slug,
      type: input.contentType,
      slug,
      title: input.title,
      body_mdx: input.body,
      excerpt: input.excerpt,
      meta_title: input.metaTitle,
      meta_description: input.metaDescription,
      faq: [],
      json_ld: jsonLd,
      hero_image_url: input.heroImageUrl ?? null,
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
      visible: true,
      keywords: input.keywords ?? [],
      media: input.media ?? [],
      author_name: input.author ?? null,
      tags: input.tags ?? [],
      categories: input.categories ?? [],
      destination: input.destination ?? null,
      canonical_path: canonicalPath,
      external_source_id: input.externalSourceId ?? null,
      approved_content_hash: input.contentHash ?? null,
    },
    { onConflict: "id" },
  );
  if (feedError) throw feedError;
  if (!contentItemId) throw new Error("content_item_missing_after_publish");
  await recordContentAudit({
    contentItemId,
    actor: {
      userId: actor.userId,
      email: actor.email,
      type: actor.type ?? "user",
    },
    action: idempotentReplay ? "content.publish_idempotent_replay" : created ? "content.create_and_publish" : "content.update_and_publish",
    version,
    changes: [
      { field: "title", before: null, after: input.title },
      { field: "body", before: null, after: input.body },
      { field: "excerpt", before: null, after: input.excerpt },
      { field: "status", before: existing ? "published" : null, after: "published" },
      { field: "published_at", before: null, after: publishedAt },
    ],
    metadata: { property: input.property, slug, canonical_path: canonicalPath, destination: input.destination ?? null, external_source: input.externalSource ?? null, external_source_id: input.externalSourceId ?? null, approved_content_hash: input.contentHash ?? null, idempotent_replay: idempotentReplay },
  });

  return {
    id: contentItemId,
    slug,
    version,
    publishedAt,
    publishedUrl,
    created,
    idempotentReplay,
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

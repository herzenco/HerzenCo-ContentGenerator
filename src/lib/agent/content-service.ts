import "server-only";

import { createHash } from "node:crypto";
import { getProvider } from "@/lib/ai/providers";
import type { AgentPrincipal } from "@/lib/agent/auth";
import { triggerWebsiteBuild } from "@/lib/published-content";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

type ContentType = "article" | "newsletter" | "social_post";

interface GenerateDraftInput {
  property: string;
  prompt: string;
  contentType?: ContentType;
  requestedTitle?: string;
}

interface ReviseDraftInput {
  id: string;
  revisionRequest: string;
}

interface AgentContentVersion {
  version: number;
  title: string;
  body_mdx?: string;
  excerpt: string;
  [key: string]: unknown;
}

interface AgentContentRecord {
  id: string;
  property: string;
  type: ContentType;
  status: string;
  qualityScore: number | null;
  publishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  title: string | null;
  excerpt: string | null;
  version: number | null;
  latestVersion?: AgentContentVersion | null;
  versions?: AgentContentVersion[];
}

export async function listAgentProperties() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("properties")
    .select("id, name, slug, base_url, language, active")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAgentContent(options: {
  property?: string;
  status?: string;
  limit?: number;
}) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("content_items")
    .select(
      "id, type, status, quality_score, publish_at, published_at, created_at, updated_at, properties!inner(slug), content_versions(title, excerpt, version, created_at)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 20, 1), 100));
  if (options.property) query = query.eq("properties.slug", options.property);
  if (options.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((record) => normalizeContentRecord(record));
}

export async function getAgentContent(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_items")
    .select(
      "id, type, status, quality_score, publish_at, published_at, created_at, updated_at, properties!inner(slug), content_versions(*)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("content_not_found");
  return normalizeContentRecord(data, true);
}

export async function listWorkspaceContent(limit = 100) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_items")
    .select(
      "id, type, status, quality_score, publish_at, published_at, created_at, updated_at, properties!inner(slug), content_versions(*)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(error.message);
  return (data ?? []).map((record) => normalizeContentRecord(record, true));
}

export async function publishWorkspaceContent(id: string, actorUserId: string) {
  const content = await getAgentContent(id);
  const latest = content.latestVersion;
  if (!latest?.body_mdx) throw new Error("content_version_missing");
  const admin = createSupabaseAdminClient();
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id, slug, revalidate_url")
    .eq("slug", content.property)
    .single();
  if (propertyError) throw new Error(propertyError.message);
  const slug = slugify(latest.title);
  const publishedAt = new Date().toISOString();
  const { error: itemError } = await admin
    .from("content_items")
    .update({ status: "published", slug, published_at: publishedAt })
    .eq("id", id);
  if (itemError) throw new Error(itemError.message);
  const { error: feedError } = await admin.from("published_content_feed").upsert(
    {
      id,
      property_slug: property.slug,
      type: content.type,
      slug,
      title: latest.title,
      body_mdx: latest.body_mdx,
      excerpt: latest.excerpt,
      meta_title: String(latest.meta_title ?? latest.title).slice(0, 60),
      meta_description: String(latest.meta_description ?? latest.excerpt).slice(0, 155),
      faq: latest.faq ?? [],
      json_ld: latest.json_ld ?? {},
      hero_image_url: null,
      published_at: publishedAt,
      updated_at: publishedAt,
    },
    { onConflict: "id" },
  );
  if (feedError) throw new Error(feedError.message);
  const { error: auditError } = await admin.from("agent_audit_log").insert({
    actor_user_id: actorUserId,
    action: "content.publish",
    target_type: "content_item",
    target_id: id,
    metadata: { property: property.slug, source: "human_review" },
  });
  if (auditError) throw new Error(`audit_failed: ${auditError.message}`);
  if (property.revalidate_url) await triggerWebsiteBuild(property.revalidate_url);
  return { id, slug, property: property.slug, status: "published", publishedAt };
}

export async function generateAgentDraft(
  input: GenerateDraftInput,
  principal: AgentPrincipal,
) {
  const context = await loadPropertyContext(input.property);
  const contentType = input.contentType ?? (input.property === "herzenco-social" ? "social_post" : "article");
  if (input.property === "herzenco-social" && contentType !== "social_post") {
    throw new Error("social_property_requires_social_post");
  }
  if (input.property !== "herzenco-social" && contentType === "social_post") {
    throw new Error("website_property_does_not_accept_social_post");
  }

  const provider = getProvider("openai");
  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.6-terra";
  const prompt = buildGenerationPrompt(input, context, contentType);
  const result = await provider.generateText({
    model,
    prompt,
    instructions: buildGenerationInstructions(contentType, context.language),
    maxOutputTokens: 8_000,
  });
  const body = contentType === "social_post" ? sanitizeSocialOutput(result.text) : result.text.trim();
  const title = input.requestedTitle?.trim() || extractGeneratedTitle(body, contentType);
  if (!title) throw new Error("generated_title_missing");

  const excerpt = extractExcerpt(body, contentType);
  const admin = createSupabaseAdminClient();
  const { data: item, error: itemError } = await admin
    .from("content_items")
    .insert({
      property_id: context.id,
      type: contentType,
      status: "needs_review",
      source: "api",
      quality_score: null,
    })
    .select("id, created_at")
    .single();
  if (itemError) throw new Error(itemError.message);

  const { error: versionError } = await admin.from("content_versions").insert({
    content_item_id: item.id,
    version: 1,
    title,
    body_mdx: body,
    excerpt,
    meta_title: title.slice(0, 60),
    meta_description: excerpt.slice(0, 155),
    faq: [],
    json_ld: {},
    generation_model: result.model,
    prompt_snapshot: input.prompt,
    context_hash: context.hash,
    social_meta: {
      title,
      property: input.property,
      generatedBy: "agent_api",
    },
  });
  if (versionError) {
    await admin.from("content_items").delete().eq("id", item.id);
    throw new Error(versionError.message);
  }

  await auditAgent(principal, "content.generate", "content_item", item.id, {
    property: input.property,
    contentType,
    model: result.model,
  });
  return getAgentContent(item.id);
}

export async function reviseAgentDraft(
  input: ReviseDraftInput,
  principal: AgentPrincipal,
) {
  const current = await getAgentContent(input.id);
  if (current.status === "published") throw new Error("published_content_cannot_be_revised_in_place");
  const latest = current.latestVersion;
  if (!latest) throw new Error("content_version_missing");

  const context = await loadPropertyContext(current.property);
  const provider = getProvider("openai");
  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.6-terra";
  const result = await provider.generateText({
    model,
    instructions: buildGenerationInstructions(current.type, context.language),
    prompt: [
      "Revise the draft below according to the request.",
      `REVISION REQUEST:\n${input.revisionRequest}`,
      `CURRENT DRAFT:\n${latest.body_mdx}`,
      `BRAND CONTEXT:\n${context.context}`,
      "Return the complete revised deliverable using the original output contract.",
    ].join("\n\n"),
    maxOutputTokens: 8_000,
  });
  const body = current.type === "social_post" ? sanitizeSocialOutput(result.text) : result.text.trim();
  const title = extractGeneratedTitle(body, current.type) || latest.title;
  const excerpt = extractExcerpt(body, current.type);
  const version = latest.version + 1;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("content_versions").insert({
    content_item_id: current.id,
    version,
    title,
    body_mdx: body,
    excerpt,
    meta_title: title.slice(0, 60),
    meta_description: excerpt.slice(0, 155),
    faq: [],
    json_ld: {},
    generation_model: result.model,
    prompt_snapshot: input.revisionRequest,
    context_hash: context.hash,
    social_meta: { title, property: current.property, generatedBy: "agent_api" },
  });
  if (error) throw new Error(error.message);
  await admin.from("content_items").update({ status: "needs_review" }).eq("id", current.id);
  await auditAgent(principal, "content.revise", "content_item", current.id, { version, model: result.model });
  return getAgentContent(current.id);
}

export async function submitAgentDraftForReview(id: string, principal: AgentPrincipal) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_items")
    .update({ status: "needs_review" })
    .eq("id", id)
    .neq("status", "published")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("content_not_found_or_already_published");
  await auditAgent(principal, "content.submit_review", "content_item", id, {});
  return getAgentContent(id);
}

export async function approveAgentContent(id: string, principal: AgentPrincipal) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_items")
    .update({ status: "approved" })
    .eq("id", id)
    .eq("status", "needs_review")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const current = await getAgentContent(id);
    if (current.status === "approved") return current;
    throw new Error("content_not_found_or_not_awaiting_review");
  }
  await auditAgent(principal, "content.approve", "content_item", id, {});
  return getAgentContent(id);
}

async function loadPropertyContext(slug: string) {
  const admin = createSupabaseAdminClient();
  const { data: property, error } = await admin
    .from("properties")
    .select("id, slug, language, brand_profiles(*), brand_context_docs(title, content_md, sort_order)")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!property) throw new Error("property_not_found");
  const profile = Array.isArray(property.brand_profiles) ? property.brand_profiles[0] : property.brand_profiles;
  const docs = Array.isArray(property.brand_context_docs)
    ? [...property.brand_context_docs].sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const context = [
    profile ? `VOICE:\n${profile.voice_description}\n\nAUDIENCE:\n${profile.audience}` : "",
    profile ? `PILLARS:\n${JSON.stringify(profile.content_pillars)}\n\nBANNED:\n${JSON.stringify(profile.banned_topics_claims)}` : "",
    profile?.style_examples?.length ? `STYLE EXAMPLES:\n${profile.style_examples.join("\n---\n")}` : "",
    ...docs.map((doc) => `# ${doc.title}\n${doc.content_md}`),
  ].filter(Boolean).join("\n\n---\n\n");
  return {
    id: property.id,
    slug: property.slug,
    language: property.language === "es" ? "Spanish" : "English",
    context,
    hash: `ctx_${createHash("sha256").update(context).digest("hex").slice(0, 16)}`,
  };
}

function buildGenerationInstructions(contentType: ContentType, language: string) {
  if (contentType === "social_post") {
    return [
      "You write publishable LinkedIn content for Herzen Co.",
      `Write in ${language}.`,
      "Write directly to founders and sound like an embedded operator, not a consultant or content engine.",
      "Open bluntly. Put a concrete observable operating moment in the first 50 words.",
      "Get to one sharp reframe quickly. Default to 120 to 220 words.",
      "Avoid generic B2B language, emojis, hashtags, em dashes, fake stories, and polished marketing CTAs.",
      "Never mention Xyren or Xelerate.",
      "Return exactly these sections: Title, Recommended format, Format-specific creative brief, LinkedIn post draft, Primary pain angle, Why this angle should resonate, Suggested CTA, if any.",
    ].join("\n");
  }
  return [
    `Write a complete publishable ${contentType} in ${language}.`,
    "Create the final editorial title yourself; never reuse the request as the title.",
    "Use an answer-first opening, clear sections, practical detail, and no commentary about the writing process.",
    "Return Markdown beginning with one H1 title.",
  ].join("\n");
}

function buildGenerationPrompt(input: GenerateDraftInput, context: Awaited<ReturnType<typeof loadPropertyContext>>, contentType: ContentType) {
  return [
    `REQUEST:\n${input.prompt}`,
    input.requestedTitle ? `FIXED TITLE:\n${input.requestedTitle}` : "Create the strongest editorial title from the underlying insight.",
    `CONTENT TYPE:\n${contentType}`,
    `PROPERTY:\n${context.slug}`,
    `BRAND CONTEXT:\n${context.context}`,
    "Return only the complete deliverable.",
  ].join("\n\n");
}

function extractGeneratedTitle(text: string, contentType: ContentType) {
  const labeledTitle = text.match(
    /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+[.)]\s*)?\*{0,2}Title\s*:?\*{0,2}\s*(?:\n\s*)?([^\n]+)/i,
  )?.[1];
  const headingTitle = text.match(/^#{1,3}\s+(.+)$/m)?.[1];
  const firstMeaningfulLine = text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[.)]\s*)?/, "").trim())
    .find((line) => line.length >= 8 && !/^(?:recommended format|format-specific creative brief|linkedin post draft)\s*:?$/i.test(line));
  const candidate = contentType === "social_post"
    ? labeledTitle || headingTitle || firstMeaningfulLine
    : headingTitle || labeledTitle || firstMeaningfulLine;
  return candidate?.replace(/^\*+|\*+$/g, "").trim().slice(0, 240) ?? "";
}

function extractExcerpt(text: string, contentType: ContentType) {
  const source = contentType === "social_post"
    ? text.match(/(?:^|\n)(?:#{1,3}\s*)?(?:\*\*)?LinkedIn post draft(?::\*\*|\*\*:|\s*:)?\s*\n+([\s\S]*?)(?=\n(?:#{1,3}\s*)?(?:\*\*)?(?:Primary pain angle|Why this angle should resonate|Suggested CTA)|$)/i)?.[1] ?? text
    : text.replace(/^#\s+.+$/m, "");
  const paragraph = source
    .split(/\n\s*\n/)
    .map((part) => part.replace(/[#*_>`]/g, "").trim())
    .find((part) => part.length > 40) ?? source;
  return paragraph.replace(/\s+/g, " ").trim().slice(0, 300);
}

function sanitizeSocialOutput(text: string) {
  return text.trim()
    .replace(/\s*—\s*([a-z])/g, (_match, letter: string) => `. ${letter.toUpperCase()}`)
    .replace(/\s*—\s*/g, ". ")
    .replace(/\.\s*\./g, ".");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function normalizeContentRecord(record: Record<string, unknown>, includeBody = false): AgentContentRecord {
  const versions = Array.isArray(record.content_versions)
    ? (record.content_versions as Array<Record<string, unknown>>)
        .map((version) => ({
          ...version,
          version: Number(version.version),
          title: String(version.title ?? ""),
          body_mdx: typeof version.body_mdx === "string" ? version.body_mdx : undefined,
          excerpt: String(version.excerpt ?? ""),
        }))
        .sort((a, b) => b.version - a.version)
    : [];
  const latest = versions[0] ?? null;
  const propertyRecord = Array.isArray(record.properties) ? record.properties[0] : record.properties;
  return {
    id: String(record.id),
    property: propertyRecord && typeof propertyRecord === "object" && "slug" in propertyRecord ? String(propertyRecord.slug) : "",
    type: String(record.type) as ContentType,
    status: String(record.status),
    qualityScore: typeof record.quality_score === "number" ? record.quality_score : null,
    publishAt: typeof record.publish_at === "string" ? record.publish_at : null,
    publishedAt: typeof record.published_at === "string" ? record.published_at : null,
    createdAt: String(record.created_at ?? ""),
    updatedAt: String(record.updated_at ?? ""),
    title: latest?.title ?? null,
    excerpt: latest?.excerpt ?? null,
    version: latest?.version ?? null,
    ...(includeBody ? { latestVersion: latest, versions } : {}),
  };
}

async function auditAgent(
  principal: AgentPrincipal,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("agent_audit_log").insert({
    actor_user_id: principal.actorUserId,
    api_key_id: principal.apiKeyId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
  if (error) throw new Error(`audit_failed: ${error.message}`);
}

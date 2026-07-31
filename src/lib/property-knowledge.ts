import "server-only";

import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export type FeedbackEntryType = "feedback" | "edit" | "rule";

export interface PropertyFeedbackRule {
  id: string;
  entryType: FeedbackEntryType;
  instruction: string;
  rationale: string | null;
  sourceCommentId: string | null;
  sourceContentItemId: string | null;
  supersedesId: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

export interface PropertyResearchEntry {
  id: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  originalFilename: string | null;
  status: "active" | "sunset";
  expiresAt: string;
  sunsetAt: string | null;
  sunsetReason: string | null;
  supersedesId: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

export async function listPropertyKnowledge(slug: string) {
  const admin = createSupabaseAdminClient();
  const property = await getProperty(slug);
  await sunsetExpiredResearchForPropertyId(property.id);
  const [feedbackResult, researchResult] = await Promise.all([
    admin
      .from("property_feedback_rules")
      .select("id, entry_type, instruction, rationale, source_comment_id, source_content_item_id, supersedes_id, created_by_email, created_at")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false }),
    admin
      .from("property_research_entries")
      .select("id, title, body, source_url, original_filename, status, expires_at, sunset_at, sunset_reason, supersedes_id, created_by_email, created_at")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false }),
  ]);
  if (feedbackResult.error) throw new Error(feedbackResult.error.message);
  if (researchResult.error) throw new Error(researchResult.error.message);

  return {
    feedback: (feedbackResult.data ?? []).map((entry) => ({
      id: entry.id,
      entryType: entry.entry_type as FeedbackEntryType,
      instruction: entry.instruction,
      rationale: entry.rationale,
      sourceCommentId: entry.source_comment_id,
      sourceContentItemId: entry.source_content_item_id,
      supersedesId: entry.supersedes_id,
      createdByEmail: entry.created_by_email,
      createdAt: entry.created_at,
    })),
    research: (researchResult.data ?? []).map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      sourceUrl: entry.source_url,
      originalFilename: entry.original_filename,
      status: entry.status as "active" | "sunset",
      expiresAt: entry.expires_at,
      sunsetAt: entry.sunset_at,
      sunsetReason: entry.sunset_reason,
      supersedesId: entry.supersedes_id,
      createdByEmail: entry.created_by_email,
      createdAt: entry.created_at,
    })),
  };
}

export async function sunsetExpiredResearchForPropertyId(propertyId: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("property_research_entries")
    .update({
      status: "sunset",
      sunset_at: now,
      sunset_reason: "Research exceeded its active shelf life before being used.",
    })
    .eq("property_id", propertyId)
    .eq("status", "active")
    .lte("expires_at", now);
  if (error) throw new Error(error.message);
}

export async function recordResearchUsage(input: {
  research: Array<{ id: string; title: string; body: string }>;
  contentItemId: string;
  generatedTitle: string;
  generatedBody: string;
  request: string;
}) {
  const admin = createSupabaseAdminClient();
  const generatedText = `${input.request}\n${input.generatedTitle}\n${input.generatedBody}`;
  for (const entry of input.research) {
    const matchScore = researchMatchScore(entry.title, entry.body, generatedText);
    if (matchScore < 0.6) continue;
    const { error: usageError } = await admin
      .from("property_research_usage")
      .insert({
        research_entry_id: entry.id,
        content_item_id: input.contentItemId,
        match_score: matchScore,
        match_detail: "Research topic materially overlaps the generated content and was available in generation context.",
      });
    if (usageError && usageError.code !== "23505") throw new Error(usageError.message);
    const { error: sunsetError } = await admin
      .from("property_research_entries")
      .update({
        status: "sunset",
        sunset_at: new Date().toISOString(),
        sunset_reason: `Content was created around this topic in item ${input.contentItemId}.`,
      })
      .eq("id", entry.id)
      .eq("status", "active");
    if (sunsetError) throw new Error(sunsetError.message);
  }
}

function researchMatchScore(title: string, body: string, generatedText: string) {
  const titleTerms = meaningfulTerms(title);
  const researchTerms = new Set([...titleTerms, ...meaningfulTerms(body).slice(0, 30)]);
  const generatedTerms = new Set(meaningfulTerms(generatedText));
  if (!titleTerms.length || !researchTerms.size) return 0;
  const titleMatches = titleTerms.filter((term) => generatedTerms.has(term)).length;
  const titleCoverage = titleMatches / titleTerms.length;
  const broadMatches = [...researchTerms].filter((term) => generatedTerms.has(term)).length;
  const broadCoverage = broadMatches / Math.min(researchTerms.size, 20);
  return Math.min(1, titleCoverage * 0.8 + broadCoverage * 0.2);
}

function meaningfulTerms(value: string) {
  const ignored = new Set([
    "about", "after", "again", "also", "because", "before", "being", "between",
    "could", "from", "have", "into", "more", "other", "should", "their", "there",
    "these", "they", "this", "through", "using", "what", "when", "where", "which",
    "while", "with", "would", "your",
  ]);
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]{4,}/g)
    ?.filter((term) => !ignored.has(term)) ?? [];
}

export async function addPropertyFeedbackRule(input: {
  slug: string;
  entryType: FeedbackEntryType;
  instruction: string;
  rationale?: string;
  sourceCommentId?: string;
  sourceContentItemId?: string;
  actorUserId: string;
  actorEmail: string;
}) {
  const admin = createSupabaseAdminClient();
  const property = await getProperty(input.slug);
  const { data, error } = await admin
    .from("property_feedback_rules")
    .insert({
      property_id: property.id,
      entry_type: input.entryType,
      instruction: input.instruction.trim(),
      rationale: input.rationale?.trim() || null,
      source_comment_id: input.sourceCommentId || null,
      source_content_item_id: input.sourceContentItemId || null,
      created_by: input.actorUserId,
      created_by_email: input.actorEmail,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addAgentPropertyFeedbackRule(input: {
  slug: string;
  entryType: FeedbackEntryType;
  instruction: string;
  rationale?: string;
  sourceCommentId?: string;
  sourceContentItemId?: string;
  actorUserId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.getUserById(input.actorUserId);
  return addPropertyFeedbackRule({
    ...input,
    actorEmail: data.user?.email?.toLowerCase() ?? "agent",
  });
}

export async function addPropertyResearch(input: {
  slug: string;
  title: string;
  body: string;
  sourceUrl?: string;
  originalFilename?: string;
  expiresInDays?: number;
  actorUserId: string;
  actorEmail: string;
}) {
  const admin = createSupabaseAdminClient();
  const property = await getProperty(input.slug);
  const { data, error } = await admin
    .from("property_research_entries")
    .insert({
      property_id: property.id,
      title: input.title.trim(),
      body: input.body.trim(),
      source_url: input.sourceUrl?.trim() || null,
      original_filename: input.originalFilename?.trim() || null,
      expires_at: new Date(
        Date.now() + Math.min(Math.max(input.expiresInDays ?? 90, 7), 365) * 86_400_000,
      ).toISOString(),
      created_by: input.actorUserId,
      created_by_email: input.actorEmail,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { data: existingContent, error: existingContentError } = await admin
    .from("content_items")
    .select("id, content_versions(title, body_mdx, version)")
    .eq("property_id", property.id)
    .in("status", ["needs_review", "approved", "scheduled", "published", "unpublished"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (existingContentError) throw new Error(existingContentError.message);
  for (const content of existingContent ?? []) {
    const versions = Array.isArray(content.content_versions)
      ? [...content.content_versions].sort((a, b) => Number(b.version) - Number(a.version))
      : [];
    const latest = versions[0];
    if (!latest) continue;
    await recordResearchUsage({
      research: [{ id: data.id, title: input.title, body: input.body }],
      contentItemId: content.id,
      generatedTitle: String(latest.title ?? ""),
      generatedBody: String(latest.body_mdx ?? ""),
      request: "",
    });
  }
  return data;
}

export async function addAgentPropertyResearch(input: {
  slug: string;
  title: string;
  body: string;
  sourceUrl?: string;
  originalFilename?: string;
  expiresInDays?: number;
  actorUserId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.getUserById(input.actorUserId);
  return addPropertyResearch({
    ...input,
    actorEmail: data.user?.email?.toLowerCase() ?? "agent",
  });
}

async function getProperty(slug: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("properties")
    .select("id, slug")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("property_not_found");
  return data;
}

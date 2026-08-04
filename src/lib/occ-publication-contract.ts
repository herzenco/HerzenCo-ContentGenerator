import { createHash } from "node:crypto";
import { z } from "zod";

const mediaSchema = z.object({
  asset_id: z.string().optional(),
  role: z.string().optional(),
  url: z.string().max(2_000).optional(),
  storage_bucket: z.string().optional(),
  storage_path: z.string().optional(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  alt_text: z.string().max(300).optional(),
});

export const occPublicationPayloadSchema = z.object({
  schema_version: z.literal(1),
  content_item_id: z.string().uuid(),
  idempotency_key: z.string().trim().min(1).max(240),
  approved_content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(250_000),
  content_type: z.enum(["article", "newsletter", "social_post"]),
  destination: z.string().trim().min(1).max(80),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  canonical_path: z.string().trim().startsWith("/").max(500),
  seo: z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(300),
    keywords: z.array(z.string().trim().min(1).max(100)).max(50),
  }),
  featured_image: mediaSchema.nullable(),
  media: z.array(mediaSchema).max(100),
  author: z.string().trim().min(1).max(160),
  publish_date: z.string().datetime().nullable(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50),
  categories: z.array(z.string().trim().min(1).max(100)).max(50),
  status: z.literal("published"),
  source: z.object({
    system: z.literal("occ"),
    approved_at: z.string().datetime(),
    approved_by: z.string().trim().min(1).max(200),
  }),
});

export type OccPublicationPayload = z.infer<typeof occPublicationPayloadSchema>;

const supportedDestinations = {
  resource_library: { contentType: "article", pathPrefix: "/resources/" },
} as const;

export function validateOccPublicationPayload(input: OccPublicationPayload, requestIdempotencyKey?: string | null) {
  const errors: string[] = [];
  const destination = supportedDestinations[input.destination as keyof typeof supportedDestinations];
  if (!destination) errors.push(`Unsupported website destination: ${input.destination}.`);
  else {
    if (input.content_type !== destination.contentType) errors.push(`Destination ${input.destination} requires content type ${destination.contentType}.`);
    const expectedPath = `${destination.pathPrefix}${input.slug}/`;
    if (input.canonical_path !== expectedPath) errors.push(`Canonical path must be ${expectedPath}.`);
  }
  if (requestIdempotencyKey?.trim() && requestIdempotencyKey.trim() !== input.idempotency_key) errors.push("The Idempotency-Key header does not match the approved package.");
  if (hashOccApprovedFields(input) !== input.approved_content_hash) errors.push("The website package no longer matches the approved content hash.");
  return errors;
}

export function hashOccApprovedFields(input: Pick<OccPublicationPayload,
  "title" | "body" | "content_type" | "destination" | "slug" | "canonical_path" | "seo" |
  "featured_image" | "media" | "author" | "publish_date" | "tags" | "categories" | "status"
>) {
  const approvedFields = {
    title: input.title,
    body: input.body,
    content_type: input.content_type,
    destination: input.destination,
    slug: input.slug,
    canonical_path: input.canonical_path,
    seo: input.seo,
    featured_image: input.featured_image,
    media: input.media,
    author: input.author,
    publish_date: input.publish_date,
    tags: input.tags,
    categories: input.categories,
    status: input.status,
  };
  return createHash("sha256").update(JSON.stringify(stableValue(approvedFields))).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, stableValue(object[key])]));
}

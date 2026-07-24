import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configuredSecret = process.env.PUBLISH_SECRET?.trim();
  const suppliedSecret =
    request.headers.get("x-publish-secret")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!configuredSecret || !suppliedSecret || !secretsMatch(configuredSecret, suppliedSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    contentId?: unknown;
    url?: unknown;
  };
  if (typeof body.contentId !== "string" || typeof body.url !== "string") {
    return Response.json({ error: "contentId_and_url_required" }, { status: 400 });
  }

  let publishedUrl: URL;
  try {
    publishedUrl = new URL(body.url);
  } catch {
    return Response.json({ error: "valid_url_required" }, { status: 400 });
  }
  if (publishedUrl.protocol !== "https:") {
    return Response.json({ error: "https_url_required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select("id, status, properties!inner(base_url)")
    .eq("id", body.contentId)
    .eq("status", "published")
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) return Response.json({ error: "published_content_not_found" }, { status: 404 });

  const property = Array.isArray(item.properties) ? item.properties[0] : item.properties;
  const expectedHost = new URL(String(property.base_url)).hostname.replace(/^www\./, "");
  const receivedHost = publishedUrl.hostname.replace(/^www\./, "");
  if (receivedHost !== expectedHost) {
    return Response.json({ error: "url_host_does_not_match_property" }, { status: 400 });
  }

  const canonicalUrl = publishedUrl.toString();
  const { error: updateError } = await admin
    .from("content_items")
    .update({ published_url: canonicalUrl })
    .eq("id", body.contentId);
  if (updateError) throw new Error(updateError.message);

  return Response.json({
    data: { id: body.contentId, status: "published", publishedUrl: canonicalUrl },
  });
}

function secretsMatch(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

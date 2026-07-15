import { NextRequest, NextResponse } from "next/server";

type BeaconPayload = {
  propertySlug?: unknown;
  slug?: unknown;
};

export async function POST(request: NextRequest) {
  let payload: BeaconPayload;

  try {
    payload = (await request.json()) as BeaconPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const propertySlug =
    typeof payload.propertySlug === "string" ? payload.propertySlug.trim() : "";
  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";

  if (!propertySlug || !slug) {
    return NextResponse.json(
      { error: "propertySlug_and_slug_required" },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  const today = new Date().toISOString().slice(0, 10);
  const dedupeKey = await dailyDedupeKey(`${today}:${ip}:${propertySlug}:${slug}`);

  return NextResponse.json(
    {
      ok: true,
      mode: "local-stub",
      dedupeKey,
    },
    { status: 202 },
  );
}

async function dailyDedupeKey(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

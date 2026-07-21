import { listPublishedContent } from "@/lib/published-content";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const property = new URL(request.url).searchParams.get("property")?.trim() || "herzenco";

  try {
    const [content] = await listPublishedContent(property, slug);
    if (!content) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(
      { data: content },
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

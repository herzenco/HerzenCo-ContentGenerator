import { publishDueScheduledContent } from "@/lib/agent/content-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ data: await publishDueScheduledContent() });
  } catch (error) {
    return Response.json(
      { error: "scheduled_publish_failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

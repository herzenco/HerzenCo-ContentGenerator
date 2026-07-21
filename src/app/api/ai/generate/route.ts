import { ProviderNotConfiguredError, getProvider } from "@/lib/ai/providers";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";

const allowedDomain = "herzenco.co";

const requestSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(100_000),
  instructions: z.string().trim().max(30_000).optional(),
  maxOutputTokens: z.number().int().min(256).max(32_000).optional(),
});

export async function GET() {
  const authorization = await authorizeHerzenUser();
  if (!authorization.ok) return authorization.response;

  return Response.json({
    providers: {
      anthropic: getProvider("anthropic").isConfigured(),
      openai: getProvider("openai").isConfigured(),
    },
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeHerzenUser();
  if (!authorization.ok) return authorization.response;

  const parsed = requestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const model = parsed.data.model ?? defaultModelFor(parsed.data.provider);
    const result = await getProvider(parsed.data.provider).generateText({
      ...parsed.data,
      model,
    });
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return Response.json(
        { error: "provider_not_configured", message: error.message },
        { status: 503 },
      );
    }

    console.error("AI generation failed", {
      provider: parsed.data.provider,
      model: parsed.data.model ?? defaultModelFor(parsed.data.provider),
      error: error instanceof Error ? error.message : "Unknown provider error",
    });
    return Response.json(
      { error: "generation_failed", message: "The AI provider could not complete this request." },
      { status: 502 },
    );
  }
}

function defaultModelFor(provider: "anthropic" | "openai") {
  if (provider === "openai") {
    return process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.6-terra";
  }
  return process.env.ANTHROPIC_TEXT_MODEL?.trim() || "claude-sonnet-4-6";
}

async function authorizeHerzenUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? "";

    if (!user || !email.endsWith(`@${allowedDomain}`)) {
      return {
        ok: false as const,
        response: Response.json({ error: "unauthorized" }, { status: 401 }),
      };
    }

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      response: Response.json({ error: "auth_not_configured" }, { status: 503 }),
    };
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

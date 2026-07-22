import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export interface AgentPrincipal {
  apiKeyId: string | null;
  actorUserId: string;
  scopes: string[];
}

export async function authenticateAgentRequest(
  request: Request,
  requiredScopes: string[] = [],
) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || token.length < 32) return null;

  const admin = createSupabaseAdminClient();
  const keyHash = hashAgentToken(token);
  const { data, error } = await admin
    .from("api_keys")
    .select("id, actor_user_id, scopes, expires_at, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data?.actor_user_id || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;

  const scopes = Array.isArray(data.scopes) ? data.scopes : [];
  if (!requiredScopes.every((scope) => scopes.includes(scope))) return null;

  await admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    apiKeyId: data.id,
    actorUserId: data.actor_user_id,
    scopes,
  } satisfies AgentPrincipal;
}

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function agentUnauthorizedResponse() {
  return Response.json({ error: "unauthorized_agent" }, { status: 401 });
}

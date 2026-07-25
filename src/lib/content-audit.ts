import "server-only";

import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export interface ContentAuditChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

export interface ContentAuditActor {
  userId?: string | null;
  email?: string | null;
  type: "user" | "agent" | "system" | "website";
}

export async function recordContentAudit(input: {
  contentItemId: string;
  actor: ContentAuditActor;
  action: string;
  version?: number | null;
  changes?: ContentAuditChange[];
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  let actorEmail = input.actor.email?.trim().toLowerCase() ?? "";
  if (!actorEmail && input.actor.userId) {
    const { data } = await admin.auth.admin.getUserById(input.actor.userId);
    actorEmail = data.user?.email?.toLowerCase() ?? "";
  }
  if (!actorEmail) {
    actorEmail =
      input.actor.type === "agent"
        ? "lupe@herzenco.co"
        : input.actor.type === "website"
          ? "website@herzenco.co"
          : "system@herzenco.co";
  }

  const { error } = await admin.from("content_audit_events").insert({
    content_item_id: input.contentItemId,
    actor_user_id: input.actor.userId || null,
    actor_email: actorEmail,
    actor_type: input.actor.type,
    action: input.action,
    content_version: input.version ?? null,
    changes: input.changes ?? [],
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`content_audit_failed: ${error.message}`);
}

export async function listContentAudit(contentItemId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_audit_events")
    .select("id, created_at, actor_user_id, actor_email, actor_type, action, content_version, changes, metadata")
    .eq("content_item_id", contentItemId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

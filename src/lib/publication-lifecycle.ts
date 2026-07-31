import "server-only";

import { recordContentAudit } from "@/lib/content-audit";
import { triggerWebsiteBuild } from "@/lib/published-content";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

type HumanPublicationActor = {
  actorUserId: string;
  actorEmail: string;
};

type UnpublishInput = HumanPublicationActor & {
  id: string;
  reason?: string;
};

type RepublishInput = HumanPublicationActor & {
  id: string;
};

type PublicationMutationResult = {
  id: string;
  status: "published" | "unpublished";
  publicationSyncStatus: "pending" | "synced" | "failed";
  publicationSyncError?: string | null;
  websiteBuildTriggered?: boolean;
  [key: string]: unknown;
};

export async function unpublishWorkspaceContent(
  input: UnpublishInput,
): Promise<PublicationMutationResult> {
  return mutatePublicationState({
    rpc: "unpublish_content_item",
    rpcArgs: {
      p_content_id: input.id,
      p_actor_user_id: input.actorUserId,
      p_actor_email: input.actorEmail,
      p_reason: input.reason?.trim() || null,
    },
    id: input.id,
    actor: input,
    action: "content.unpublish",
  });
}

export async function republishWorkspaceContent(
  input: RepublishInput,
): Promise<PublicationMutationResult> {
  return mutatePublicationState({
    rpc: "republish_content_item",
    rpcArgs: {
      p_content_id: input.id,
      p_actor_user_id: input.actorUserId,
      p_actor_email: input.actorEmail,
    },
    id: input.id,
    actor: input,
    action: "content.republish",
  });
}

async function mutatePublicationState(input: {
  rpc: "unpublish_content_item" | "republish_content_item";
  rpcArgs: Record<string, string | null>;
  id: string;
  actor: HumanPublicationActor;
  action: "content.unpublish" | "content.republish";
}) {
  const admin = createSupabaseAdminClient();
  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select("id, properties!inner(slug, revalidate_url)")
    .eq("id", input.id)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new Error("content_not_found");

  const { data, error } = await admin.rpc(input.rpc, input.rpcArgs);
  if (error) throw new Error(error.message);

  const mutation = asMutationResult(data, input.id);
  const property = Array.isArray(item.properties)
    ? item.properties[0]
    : item.properties;
  const deployHookUrl =
    property && typeof property === "object" && "revalidate_url" in property
      ? String(property.revalidate_url ?? "").trim()
      : "";

  if (!deployHookUrl) {
    return finalizePublicationSync({
      id: input.id,
      actor: input.actor,
      action: input.action,
      mutation,
      syncStatus: "synced",
      syncError: null,
      websiteBuildTriggered: false,
    });
  }

  try {
    await triggerWebsiteBuild(deployHookUrl);
    return finalizePublicationSync({
      id: input.id,
      actor: input.actor,
      action: input.action,
      mutation,
      syncStatus: "synced",
      syncError: null,
      websiteBuildTriggered: true,
    });
  } catch (error) {
    return finalizePublicationSync({
      id: input.id,
      actor: input.actor,
      action: input.action,
      mutation,
      syncStatus: "failed",
      syncError:
        error instanceof Error ? error.message : "Website build trigger failed",
      websiteBuildTriggered: false,
    });
  }
}

async function finalizePublicationSync(input: {
  id: string;
  actor: HumanPublicationActor;
  action: "content.unpublish" | "content.republish";
  mutation: PublicationMutationResult;
  syncStatus: "synced" | "failed";
  syncError: string | null;
  websiteBuildTriggered: boolean;
}): Promise<PublicationMutationResult> {
  const admin = createSupabaseAdminClient();
  const updatedAt = new Date().toISOString();
  const { error } = await admin
    .from("content_items")
    .update({
      publication_sync_status: input.syncStatus,
      publication_sync_error: input.syncError,
      publication_sync_updated_at: updatedAt,
    })
    .eq("id", input.id);
  if (error) throw new Error(`publication_sync_record_failed: ${error.message}`);

  await recordContentAudit({
    contentItemId: input.id,
    actor: {
      userId: input.actor.actorUserId,
      email: input.actor.actorEmail,
      type: "user",
    },
    action: `${input.action}.sync`,
    changes: [
      {
        field: "publication_sync_status",
        before: "pending",
        after: input.syncStatus,
      },
      {
        field: "publication_sync_error",
        before: null,
        after: input.syncError,
      },
    ],
    metadata: {
      websiteBuildTriggered: input.websiteBuildTriggered,
      publicationSyncUpdatedAt: updatedAt,
    },
  });

  return {
    ...input.mutation,
    publicationSyncStatus: input.syncStatus,
    publicationSyncError: input.syncError,
    websiteBuildTriggered: input.websiteBuildTriggered,
  };
}

function asMutationResult(
  data: unknown,
  id: string,
): PublicationMutationResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("publication_mutation_returned_invalid_data");
  }
  const record = data as Record<string, unknown>;
  if (
    record.status !== "published" &&
    record.status !== "unpublished"
  ) {
    throw new Error("publication_mutation_returned_invalid_status");
  }
  return {
    ...record,
    id: typeof record.id === "string" ? record.id : id,
    status: record.status,
    publicationSyncStatus: "pending",
  };
}

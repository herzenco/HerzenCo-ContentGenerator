import { ContentEngineApp } from "@/components/content-engine-app";
import { AuthForm } from "@/components/auth-form";
import { getAgentContent } from "@/lib/agent/content-service";
import { appRoleForUser, canUseContentEngine } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";

const allowedDomain = "herzenco.co";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? "";
  const role = appRoleForUser(user);
  const canAccess =
    userEmail.toLowerCase().endsWith(`@${allowedDomain}`) &&
    canUseContentEngine(role);

  if (!user || !canAccess) {
    return <AuthForm allowedDomain={allowedDomain} />;
  }

  try {
    await getAgentContent(id);
  } catch {
    notFound();
  }

  return <ContentEngineApp initialReviewId={id} userEmail={userEmail} role={role!} />;
}

import { ContentEngineApp } from "@/components/content-engine-app";
import { AuthForm } from "@/components/auth-form";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import { appRoleForUser, canUseContentEngine } from "@/lib/auth/roles";

const allowedDomain = "herzenco.co";

export default async function Home() {
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

  return <ContentEngineApp userEmail={userEmail} role={role!} />;
}

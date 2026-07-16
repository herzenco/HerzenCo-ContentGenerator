import { ContentEngineApp } from "@/components/content-engine-app";
import { AuthForm } from "@/components/auth-form";
import { createServerSupabaseClient } from "@/utils/supabase/server";

const allowedDomain = "herzenco.co";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? "";
  const canAccess = userEmail.toLowerCase().endsWith(`@${allowedDomain}`);

  if (!user || !canAccess) {
    return <AuthForm allowedDomain={allowedDomain} />;
  }

  return <ContentEngineApp userEmail={userEmail} />;
}

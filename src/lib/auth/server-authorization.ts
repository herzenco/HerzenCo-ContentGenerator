import { appRoleForUser, type AppRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export async function authorizeSession(allowedRoles: AppRole[]) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const role = appRoleForUser(user);

    if (!user || !role || !allowedRoles.includes(role)) {
      return {
        ok: false as const,
        response: Response.json({ error: "forbidden" }, { status: 403 }),
      };
    }

    return { ok: true as const, user, role, supabase };
  } catch {
    return {
      ok: false as const,
      response: Response.json({ error: "auth_not_configured" }, { status: 503 }),
    };
  }
}

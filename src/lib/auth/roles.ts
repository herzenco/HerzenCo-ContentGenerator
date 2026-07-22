import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "publisher" | "reviewer" | "editor" | "viewer";

const roles = new Set<AppRole>(["admin", "publisher", "reviewer", "editor", "viewer"]);

export function appRoleForUser(user: User | null | undefined): AppRole | null {
  const role = user?.app_metadata?.role;
  return typeof role === "string" && roles.has(role as AppRole)
    ? (role as AppRole)
    : null;
}

export function canUseContentEngine(role: AppRole | null) {
  return role !== null;
}

export function canGenerateContent(role: AppRole | null) {
  return role === "admin" || role === "publisher" || role === "reviewer" || role === "editor";
}

export function canApproveContent(role: AppRole | null) {
  return role === "admin" || role === "publisher" || role === "reviewer";
}

export function canPublishContent(role: AppRole | null) {
  return role === "admin" || role === "publisher";
}

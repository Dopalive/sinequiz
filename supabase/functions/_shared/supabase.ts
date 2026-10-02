import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./http.ts";

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Verifies the caller's JWT and returns the user id. */
export async function requireUser(req: Request): Promise<{ id: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new AppError("unauthorized");
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new AppError("unauthorized");
  return { id: data.user.id };
}

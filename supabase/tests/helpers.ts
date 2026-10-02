import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

function loadEnv(): { url: string; anon: string; service: string } {
  const out = execSync("pnpm supabase status -o env", { cwd: "../..", encoding: "utf8" });
  const get = (k: string) => {
    const m = out.match(new RegExp(`^${k}="?([^"\\n]+)"?$`, "m"));
    if (!m) throw new Error(`missing ${k} in supabase status`);
    return m[1]!;
  };
  return { url: get("API_URL"), anon: get("ANON_KEY"), service: get("SERVICE_ROLE_KEY") };
}

export const ENV = loadEnv();

export const SEED = {
  titleId: "00000000-0000-0000-0000-000000000001",
  episode1Id: "00000000-0000-0000-0000-000000000011",
  episode2Id: "00000000-0000-0000-0000-000000000012",
} as const;

export function anonClient(): SupabaseClient {
  return createClient(ENV.url, ENV.anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function adminClient(): SupabaseClient {
  return createClient(ENV.url, ENV.service, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Signs in a fresh anonymous user; returns its client, id and access token. */
export async function newUser(locale = "en"): Promise<{ client: SupabaseClient; userId: string; token: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) throw error ?? new Error("no session");
  if (locale !== "en") {
    const { error: upErr } = await client.from("profiles").update({ locale }).eq("id", data.user.id);
    if (upErr) throw upErr;
  }
  return { client, userId: data.user.id, token: data.session.access_token };
}

export async function callFn<T = unknown>(
  name: string,
  body: unknown,
  token: string | null,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${ENV.url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ENV.anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export async function balance(userId: string): Promise<number> {
  const { data, error } = await adminClient().from("profiles").select("coin_balance").eq("id", userId).single();
  if (error) throw error;
  return data.coin_balance as number;
}

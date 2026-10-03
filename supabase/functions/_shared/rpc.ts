import type { SupabaseClient } from "@supabase/supabase-js";
import { ERROR_STATUS, type ErrorCode } from "./shared/errors.ts";
import { AppError } from "./http.ts";

function isErrorCode(s: string): s is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_STATUS, s);
}

/**
 * Calls a single-row Postgres function through PostgREST.
 * Business errors are raised in SQL as `raise exception using message = '<ErrorCode>', errcode = 'P0001'`;
 * PostgREST answers 400 `{ code: "P0001", message: "<ErrorCode>" }`, which becomes an AppError here.
 * 22P02 (invalid input syntax, e.g. a malformed uuid) becomes bad_request; anything else is rethrown (500).
 */
export async function callRpc<T>(admin: SupabaseClient, fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, params).single();
  if (error) {
    if (error.code === "P0001") {
      const message = (error.message ?? "").split("\n", 1)[0]!;
      if (isErrorCode(message)) throw new AppError(message);
    }
    if (error.code === "22P02") throw new AppError("bad_request");
    throw error;
  }
  return data as T;
}

// Typed wrappers around the four Edge Functions. The server is the only authority on correctness
// and coins; this module never computes either, it just transports the shared request/response types.
import type {
  ApiError,
  ErrorCode,
  FinishSessionRequest,
  FinishSessionResponse,
  StartSessionRequest,
  StartSessionResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  UseJokerRequest,
  UseJokerResponse,
} from "@sinequiz/shared";
import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { ENV } from "./env";
import { supabase } from "./supabase";

export class ApiCallError extends Error {
  constructor(
    public code: ErrorCode | "network" | "internal",
    public status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const RETRIES = 3;
const BACKOFF_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error && isAuthRetryableFetchError(error)) throw new ApiCallError("network", 0, error.message);
  if (error || !data.session) throw new ApiCallError("unauthorized", 401, error?.message);
  return data.session.access_token;
}

/** One logical request: transport failures are retried with backoff, any HTTP answer is returned. */
async function post(name: string, body: unknown, token: string): Promise<Response> {
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    try {
      return await fetch(`${ENV.supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: ENV.supabaseAnonKey,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Only transport failures are retried: a business error is final and must not be re-sent.
      lastNetworkError = err;
    }
  }
  throw new ApiCallError("network", 0, lastNetworkError instanceof Error ? lastNetworkError.message : undefined);
}

/**
 * The server refused a token the client believes in. Usually it just expired (backgrounded app,
 * clock skew): a refresh fixes it. Only a refresh the auth server itself refuses proves the identity
 * is gone; then dropping it lets the auth provider bootstrap a fresh anonymous user instead of looping
 * on a dead session. Offline or a 5xx keeps everything as is.
 */
async function refreshedToken(): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();
  if (data.session) return data.session.access_token;
  if (isAuthRetryableFetchError(error)) throw new ApiCallError("network", 0, error.message);
  if ((isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429) || isAuthSessionMissingError(error)) {
    await supabase.auth.signOut({ scope: "local" });
  }
  throw new ApiCallError("unauthorized", 401, error?.message);
}

async function callFn<Req, Res>(name: string, body: Req): Promise<Res> {
  let res = await post(name, body, await accessToken());
  // A 401 is raised before the function touches any state, so re-sending once is safe.
  if (res.status === 401) res = await post(name, body, await refreshedToken());
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw new ApiCallError("network", 0, err instanceof Error ? err.message : undefined);
  }
  const parsed = safeJson(text);
  if (res.ok) {
    // Every function answers with a JSON object; anything else (proxy page, truncated body) is a fault.
    if (typeof parsed !== "object" || parsed === null) throw new ApiCallError("internal", res.status, "non-JSON response");
    return parsed as Res;
  }
  const apiErr = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Partial<ApiError>;
  throw new ApiCallError(apiErr.error ?? "internal", res.status, apiErr.message);
}

function safeJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  startSession: (req: StartSessionRequest) => callFn<StartSessionRequest, StartSessionResponse>("start-session", req),
  submitAnswer: (req: SubmitAnswerRequest) => callFn<SubmitAnswerRequest, SubmitAnswerResponse>("submit-answer", req),
  useJoker: (req: UseJokerRequest) => callFn<UseJokerRequest, UseJokerResponse>("use-joker", req),
  finishSession: (req: FinishSessionRequest) => callFn<FinishSessionRequest, FinishSessionResponse>("finish-session", req),
};

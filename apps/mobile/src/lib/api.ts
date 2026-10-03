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

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new ApiCallError("unauthorized", 401);
  return data.session.access_token;
}

async function callFn<Req, Res>(name: string, body: Req): Promise<Res> {
  const token = await accessToken();
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${ENV.supabaseUrl}/functions/v1/${name}`, {
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
      await new Promise((r) => setTimeout(r, BACKOFF_MS * 2 ** attempt));
      continue;
    }
    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : null;
    if (res.ok) return parsed as Res;
    const apiErr = (parsed ?? {}) as Partial<ApiError>;
    if (res.status === 401) {
      // The server rejected a token the client believes in: the identity is gone. Drop it so the
      // auth provider can bootstrap a fresh anonymous user instead of looping on a dead session.
      await supabase.auth.signOut({ scope: "local" });
    }
    throw new ApiCallError(apiErr.error ?? "internal", res.status, apiErr.message);
  }
  throw new ApiCallError("network", 0, lastNetworkError instanceof Error ? lastNetworkError.message : undefined);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  startSession: (req: StartSessionRequest) => callFn<StartSessionRequest, StartSessionResponse>("start-session", req),
  submitAnswer: (req: SubmitAnswerRequest) => callFn<SubmitAnswerRequest, SubmitAnswerResponse>("submit-answer", req),
  useJoker: (req: UseJokerRequest) => callFn<UseJokerRequest, UseJokerResponse>("use-joker", req),
  finishSession: (req: FinishSessionRequest) => callFn<FinishSessionRequest, FinishSessionResponse>("finish-session", req),
};

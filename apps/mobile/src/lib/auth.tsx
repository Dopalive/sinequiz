import AsyncStorage from "@react-native-async-storage/async-storage";
import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError, type Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import i18n, { deviceLocale, isLocale, type Locale } from "./i18n";
import { clearActiveSession } from "./session";
import { supabase } from "./supabase";

export interface Profile {
  id: string;
  display_name: string | null;
  locale: Locale;
  coin_balance: number;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the anonymous session is established (or failed) and the profile is loaded. */
  loading: boolean;
  error: string | null;
  /** Best-effort re-read of the profile; never rejects (a failed refresh keeps the last known profile). */
  refreshProfile: () => Promise<void>;
  /** Optimistic local update of the balance after a server response that already contains it. */
  setBalance: (balance: number) => void;
  setLocale: (locale: Locale) => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the question language this device has settled on. Its presence means the one-shot alignment
 * with the device language already happened (or the user picked one in Profile), so it is never
 * re-applied over an explicit choice; its value seeds the profile of a replacement anonymous user.
 */
const LOCALE_KEY = "sinequiz.localeAligned.v1";

class ProfileLoadError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error, status } = await supabase
    .from("profiles")
    .select("id, display_name, locale, coin_balance")
    .eq("id", userId)
    .single();
  if (error) throw new ProfileLoadError(error.code, status, error.message);
  const locale = isLocale(data.locale) ? data.locale : "en";
  return { id: data.id, display_name: data.display_name, locale, coin_balance: data.coin_balance };
}

/**
 * True only on a definitive "this user no longer exists" signal (DB reset, account purge). Anything
 * else — offline, 5xx, timeouts — is transient and must keep the stored session: dropping it would
 * orphan the anonymous account and its coins for good.
 */
async function identityGone(err: unknown): Promise<boolean> {
  if (!(err instanceof ProfileLoadError)) return false;
  // .single() on our own id with a token PostgREST accepted: the profile row is gone.
  if (err.code === "PGRST116") return true;
  if (err.status !== 401 && err.status !== 403) return false;
  // PostgREST only checks the JWT signature; the auth server knows whether the user still exists.
  const { error } = await supabase.auth.getUser();
  return isAuthSessionMissingError(error) || (isAuthApiError(error) && (error.status === 401 || error.status === 403));
}

/** Creates a new anonymous user. Whatever was mirrored for the previous identity is unreachable now. */
async function startAnonymous(): Promise<Session> {
  await clearActiveSession();
  // signInAnonymously replaces the stored session itself; no signOut first, so no SIGNED_OUT event.
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session;
}

/**
 * Aligns the question language with the device once per install. A replacement identity inherits
 * the language this device had settled on instead of the server default.
 */
async function alignLocale(p: Profile, created: boolean): Promise<Profile> {
  const settled = await AsyncStorage.getItem(LOCALE_KEY).catch(() => null);
  if (settled !== null && !created) return p;
  const wanted = isLocale(settled) ? settled : deviceLocale();
  let next = p;
  if (p.locale !== wanted) {
    const { error } = await supabase.from("profiles").update({ locale: wanted }).eq("id", p.id);
    // Not fatal: the flag stays unset and the alignment is tried again on the next launch.
    if (error) return p;
    next = { ...p, locale: wanted };
  }
  await AsyncStorage.setItem(LOCALE_KEY, next.locale).catch(() => undefined);
  return next;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Bootstraps run strictly one after another: two concurrent runs would each create a user.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  // While a bootstrap runs, auth events it causes itself (e.g. auth-js dropping an unrefreshable
  // session inside getSession) must not schedule another one.
  const bootingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      bootingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        // Spec §6: start anonymous. The auth trigger creates the profile and the welcome coins.
        const { data: stored, error: storedErr } = await supabase.auth.getSession();
        // A refresh that failed in transit leaves the session in storage: report, retry later. A
        // refused refresh has already cleared storage (auth-js), so there is nothing left to keep.
        if (storedErr && isAuthRetryableFetchError(storedErr)) throw storedErr;
        let current = stored.session;
        let created = false;
        if (!current) {
          current = await startAnonymous();
          created = true;
        }
        if (cancelled) return;
        setSession(current);
        let p: Profile;
        try {
          p = await loadProfile(current.user.id);
        } catch (err) {
          if (!(await identityGone(err))) throw err;
          // A stale anonymous identity has nothing to recover: start a fresh one.
          current = await startAnonymous();
          created = true;
          if (cancelled) return;
          setSession(current);
          p = await loadProfile(current.user.id);
        }
        p = await alignLocale(p, created);
        if (cancelled) return;
        setProfile(p);
        await i18n.changeLanguage(p.locale);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        bootingRef.current = false;
        if (!cancelled) setLoading(false);
      }
    };
    queueRef.current = queueRef.current.then(run);
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== "SIGNED_OUT") {
        setSession(s);
        return;
      }
      if (bootingRef.current) return;
      // A sign-out from anywhere else (e.g. the API layer after a refused refresh) restarts the
      // anonymous bootstrap; the mirrored game belonged to the identity that just went away.
      setSession(null);
      setProfile(null);
      void clearActiveSession();
      setAttempt((a) => a + 1);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    try {
      setProfile(await loadProfile(userId));
    } catch (err) {
      // Focus refreshes are best-effort; only a vanished user is worth acting on.
      if (await identityGone(err).catch(() => false)) setAttempt((a) => a + 1);
    }
  }, [userId]);

  const setBalance = useCallback((balance: number) => {
    setProfile((p) => (p ? { ...p, coin_balance: balance } : p));
  }, []);

  const profileId = profile?.id;
  const setLocale = useCallback(
    async (locale: Locale) => {
      if (!profileId) return;
      const { error: upErr } = await supabase.from("profiles").update({ locale }).eq("id", profileId);
      if (upErr) throw upErr;
      setProfile((p) => (p ? { ...p, locale } : p));
      // An explicit choice ends the first-launch alignment for good.
      await AsyncStorage.setItem(LOCALE_KEY, locale).catch(() => undefined);
      await i18n.changeLanguage(locale);
    },
    [profileId],
  );

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      error,
      refreshProfile,
      setBalance,
      setLocale,
      retry: () => setAttempt((a) => a + 1),
    }),
    [session, profile, loading, error, refreshProfile, setBalance, setLocale],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

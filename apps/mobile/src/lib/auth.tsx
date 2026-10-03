import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import i18n, { deviceLocale, isLocale, type Locale } from "./i18n";
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
  refreshProfile: () => Promise<void>;
  /** Optimistic local update of the balance after a server response that already contains it. */
  setBalance: (balance: number) => void;
  setLocale: (locale: Locale) => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, locale, coin_balance")
    .eq("id", userId)
    .single();
  if (error) throw error;
  const locale = isLocale(data.locale) ? data.locale : "en";
  return { id: data.id, display_name: data.display_name, locale, coin_balance: data.coin_balance };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Spec §6: start anonymous. The auth trigger creates the profile and the welcome coins.
        let { data: { session: current } } = await supabase.auth.getSession();
        if (!current) {
          const { data, error: signErr } = await supabase.auth.signInAnonymously();
          if (signErr) throw signErr;
          current = data.session;
        }
        if (!current) throw new Error("no session");
        if (cancelled) return;
        setSession(current);
        let p: Profile;
        try {
          p = await loadProfile(current.user.id);
        } catch {
          // The stored session points at a user the server no longer knows (DB reset, account purge).
          // A stale anonymous identity has nothing to recover: start a fresh one.
          await supabase.auth.signOut({ scope: "local" });
          const { data, error: signErr } = await supabase.auth.signInAnonymously();
          if (signErr || !data.session) throw signErr ?? new Error("no session");
          current = data.session;
          if (cancelled) return;
          setSession(current);
          p = await loadProfile(current.user.id);
        }
        // First launch: align the question language with the device language once.
        const wanted = deviceLocale();
        if (p.locale !== wanted && !p.display_name && p.coin_balance === 100) {
          const { error: upErr } = await supabase.from("profiles").update({ locale: wanted }).eq("id", p.id);
          if (!upErr) p = { ...p, locale: wanted };
        }
        if (cancelled) return;
        setProfile(p);
        await i18n.changeLanguage(p.locale);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // A sign-out from anywhere (e.g. the API layer on a 401) restarts the anonymous bootstrap.
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setAttempt((a) => a + 1);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [attempt]);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    setProfile(await loadProfile(session.user.id));
  }, [session]);

  const setBalance = useCallback((balance: number) => {
    setProfile((p) => (p ? { ...p, coin_balance: balance } : p));
  }, []);

  const setLocale = useCallback(
    async (locale: Locale) => {
      if (!profile) return;
      const { error: upErr } = await supabase.from("profiles").update({ locale }).eq("id", profile.id);
      if (upErr) throw upErr;
      setProfile({ ...profile, locale });
      await i18n.changeLanguage(locale);
    },
    [profile],
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

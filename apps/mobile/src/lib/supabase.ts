import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { ENV } from "./env";

// One client for the whole app. AsyncStorage keeps the anonymous session across launches on every
// platform (it maps to localStorage on web). detectSessionInUrl stays off: no OAuth redirect flow yet.
export const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Native apps have no visibilitychange, so auth-js cannot tell it was backgrounded: its refresh ticker
// keeps running while suspended and misses the expiry. Tie it to AppState (Supabase React Native
// guidance). Web keeps the library's own visibility handling.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

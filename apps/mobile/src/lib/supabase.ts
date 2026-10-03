import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
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

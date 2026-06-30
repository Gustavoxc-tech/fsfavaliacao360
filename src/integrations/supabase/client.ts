import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://tqtdehcwkzicxjynqtje.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4cruJkX7LU3s_q_uzYBqgA_VM7LQwDg";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

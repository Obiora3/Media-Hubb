import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Log clearly in dev — don't throw so the app shell still renders
  console.error(
    "[MediaHub] Missing Supabase env vars.\n" +
    "Copy packages/web/.env.local.example → packages/web/.env.local and fill in your credentials.\n" +
    "Then restart the dev server."
  );
}

export const supabase = createClient(
  supabaseUrl  ?? "http://localhost",
  supabaseAnonKey ?? "anon",
  {
    auth: {
      storageKey: "mediahub-auth",
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseClientInstance: SupabaseClient | null = null;

function isValidString(val: any): boolean {
  return typeof val === "string" && val.trim() !== "" && val !== "undefined" && val !== "null";
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClientInstance) return supabaseClientInstance;

  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (typeof window !== "undefined" ? localStorage.getItem("supabase_url") : null);
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (typeof window !== "undefined" ? localStorage.getItem("supabase_anon_key") : null);

  const url = isValidString(rawUrl) ? rawUrl!.trim() : null;
  const key = isValidString(rawKey) ? rawKey!.trim() : null;

  if (url && key) {
    try {
      supabaseClientInstance = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      return supabaseClientInstance;
    } catch (err) {
      console.error("Error creating Supabase client:", err);
      return null;
    }
  }

  return null;
}

export function resetSupabaseClient() {
  supabaseClientInstance = null;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 新しい「Publishable key」（sb_publishable_...）。公開してよい値
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Supabase の接続情報が設定されているか。未設定ならブラウザ内保存だけで動く。 */
export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase の接続情報が設定されていません");
  client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "listen-shorts:auth",
    },
  });
  return client;
}

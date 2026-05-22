import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 環境変数チェック
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase] ⚠️ 環境変数が未設定です:', {
          VITE_SUPABASE_URL: supabaseUrl ? '✅ 設定済み' : '❌ 未設定',
          VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? '✅ 設定済み' : '❌ 未設定',
    });
} else {
    console.log('[Supabase] ✅ 接続設定 OK:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

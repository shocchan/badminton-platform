import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; name?: string; email?: string } | null>(null);

  useEffect(() => {
    // 既存セッションを確認
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.name,
          email: session.user.email,
        });
      }
      setLoading(false);
    });

    // セッション変化を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.name,
          email: session.user.email,
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const EDGE_BASE = SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');
  const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const callGuard = async (payload: Record<string, unknown>) => {
    const res = await fetch(`${EDGE_BASE}/login-guard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ログインに失敗しました');
    return data;
  };

  // パスワードログイン（login-guard 経由：ロック判定 + 管理者はメールOTPへ分岐）
  // 戻り値: { needsOtp: true, challengeId } もしくは { needsOtp: false }（セッション確立済み）
  const login = async (email: string, password: string) => {
    const data = await callGuard({ action: 'login', email, password });
    if (data.needs_otp) {
      return { needsOtp: true as const, challengeId: data.challenge_id as string, sentTo: data.sent_to as string };
    }
    const { error } = await supabase.auth.setSession(data.session);
    if (error) throw new Error('ログインに失敗しました');
    return { needsOtp: false as const };
  };

  // 管理者メールOTPの検証 → セッション確立
  const verifyOtp = async (challengeId: string, code: string) => {
    const data = await callGuard({ action: 'verify', challenge_id: challengeId, code });
    const { error } = await supabase.auth.setSession(data.session);
    if (error) throw new Error('ログインに失敗しました');
    return true;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return { loading, login, verifyOtp, logout, isAuthenticated, user };
};

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

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('メールアドレスまたはパスワードが間違っています');
    return true;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return { loading, login, logout, isAuthenticated, user };
};

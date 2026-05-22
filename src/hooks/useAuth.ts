import { useState, useEffect } from 'react';

const ADMIN_PASSWORD = 'Hiranosy0709';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('admin_auth');
    setIsAuthenticated(stored === 'true');
    setLoading(false);
  }, []);

  const login = async (password: string) => {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem('admin_auth', 'true');
      setIsAuthenticated(true);
      return true;
    }
    throw new Error('パスワードが間違っています');
  };

  const logout = async () => {
    localStorage.removeItem('admin_auth');
    setIsAuthenticated(false);
  };

  return { loading, login, logout, isAuthenticated };
};

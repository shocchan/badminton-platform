import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../services/supabaseClient';
import { PasswordInput } from '../components/PasswordInput';
import { translations } from '../locales/translations';

export const PasswordResetFormPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = translations[lang].passwordResetForm;

  useEffect(() => {
    // セッションの確認（リセットリンク経由でのみアクセス可能）
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSessionError(true);
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (password.length < 6) {
        setError(t.errorPasswordTooShort);
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setError(t.errorMismatch);
        setLoading(false);
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateErr) {
        throw new Error(t.errorUpdateFailed);
      }

      // 成功画面に遷移
      navigate(`/${lang}/password-reset-success`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (sessionError) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <div className="text-5xl mb-4">⏰</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">{t.expiredTitle}</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              {t.expiredDesc}
              <br />
              {t.expiredAction}
            </p>
          </div>

          <button
            onClick={() => navigate(`/${lang}/password-reset`)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {t.expiredButton}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.newPasswordLabel}
              </label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                showStrength={true}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.confirmPasswordLabel}
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
                showStrength={false}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-2">{t.passwordMismatch}</p>
              )}
              {confirmPassword && password === confirmPassword && (
                <p className="text-xs text-green-500 mt-2">{t.passwordMatch}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || password.length < 6 || password !== confirmPassword}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors mt-6"
            >
              {loading ? t.submitLoading : t.submit}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
};

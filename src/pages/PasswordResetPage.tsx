import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../services/supabaseClient';
import { translations } from '../locales/translations';

export const PasswordResetPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = translations[lang].passwordReset;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (!email.trim()) {
        setError(t.errorEmailRequired);
        setLoading(false);
        return;
      }

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${lang}/password-reset-form`,
      });

      if (resetErr) {
        throw new Error(t.errorSendFailed);
      }

      setSuccess(true);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <div className="text-5xl mb-4">📧</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">{t.successTitle}</h1>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              {t.successDesc}
              <br />
              {t.successNote}
            </p>
            <p className="text-xs text-gray-500">
              {t.successWarning}
            </p>
          </div>

          <button
            onClick={() => navigate(`/${lang}/login`)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {t.backToLogin}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🔑</div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-600 mt-2">
            {t.subtitle}
          </p>
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
                {t.emailLabel}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t.emailPlaceholder}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors mt-6"
            >
              {loading ? t.submitLoading : t.submit}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {t.forgotPassword}
              <button
                type="button"
                onClick={() => navigate(`/${lang}/login`)}
                className="font-bold text-blue-600 hover:text-blue-700 ml-1"
              >
                {t.backToLogin}
              </button>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../services/supabaseClient';
import { PasswordInput } from '../components/PasswordInput';
import { translations } from '../locales/translations';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignup, setShowSignup] = useState(true);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = translations[lang].login;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (showSignup) {
        if (!name.trim()) {
          setError(t.errorNameRequired);
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError(t.errorPasswordTooShort);
          setLoading(false);
          return;
        }
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() } },
        });
        if (signUpErr) {
          throw new Error(
            signUpErr.message.includes('already registered')
              ? t.errorAlreadyRegistered
              : t.errorSignupFailed,
          );
        }
      } else {
        await login(email, password);
      }
      navigate(`/${lang}/mypage`);
    } catch (err) {
      setError(err instanceof Error ? err.message : (showSignup ? t.errorSignupFailed : t.errorLoginFailed));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* 会員登録メリット表示（初期表示時） */}
        {!showSignup && (
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 p-6">
            <p className="text-sm font-bold text-blue-900 mb-3">🎁 {t.merit}</p>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span className="text-lg">🍜</span>
                <span><strong>{t.meritGame}</strong>{t.meritGameDesc}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">📱</span>
                <span><strong>{t.meritMypage}</strong>{t.meritMypageDesc}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">✅</span>
                <span><strong>{t.meritEntry}</strong>{t.meritEntryDesc}</span>
              </li>
            </ul>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="text-4xl mb-2">{showSignup ? '📝' : '🔓'}</div>
          <h1 className="text-2xl font-bold text-gray-900">{showSignup ? t.title : t.titleLogin}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {showSignup && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.nameLabel}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={30}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t.namePlaceholder}
                  autoFocus
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.emailLabel}</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t.emailPlaceholder}
                autoFocus={!showSignup}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.passwordLabel}</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                showStrength={showSignup}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors mt-6"
            >
              {loading ? (showSignup ? t.submitSignupLoading : t.submitLoginLoading) : (showSignup ? t.submitSignup : t.submitLogin)}
            </button>
          </form>

          <div className="mt-6 text-center">
            {showSignup ? (
              <p className="text-sm text-gray-600">
                {t.existingUser}
                <button
                  type="button"
                  onClick={() => {
                    setShowSignup(false);
                    setName('');
                    setEmail('');
                    setPassword('');
                    setError(null);
                  }}
                  className="font-bold text-blue-600 hover:text-blue-700 ml-1"
                >
                  {t.toggleLogin}
                </button>
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  {t.newUser}
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignup(true);
                      setName('');
                      setEmail('');
                      setPassword('');
                      setError(null);
                    }}
                    className="font-bold text-blue-600 hover:text-blue-700 ml-1"
                  >
                    {t.toggleSignup}
                  </button>
                </p>
                <p className="text-xs text-gray-500 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/${lang}/password-reset`)}
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    {t.forgotPassword}
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

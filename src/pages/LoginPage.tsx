import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../contexts/LanguageContext';
import { PasswordInput } from '../components/PasswordInput';
import { translations } from '../locales/translations';
import { supabase } from '../services/supabaseClient';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 管理者メールOTP（2段階目）
  const [otp, setOtp] = useState<{ challengeId: string; sentTo: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const { login, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = translations[lang].login;

  const goAfterLogin = async () => {
    const { data: isAdmin } = await supabase.rpc('is_admin');
    navigate(`/${lang}/${isAdmin ? 'admin' : 'mypage'}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await login(email, password);
      if (result.needsOtp) {
        setOtp({ challengeId: result.challengeId, sentTo: result.sentTo });
      } else {
        await goAfterLogin();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorLoginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(otp.challengeId, otpCode.trim());
      await goAfterLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorLoginFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* メリット表示 */}
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 p-6">
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

        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🔓</div>
          <h1 className="text-2xl font-bold text-gray-900">{t.titleLogin}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {otp ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center mb-2">
                <div className="text-3xl mb-2">📧</div>
                <p className="text-sm text-gray-700 font-medium">認証コードを送信しました</p>
                <p className="text-xs text-gray-500 mt-1">{otp.sentTo} 宛のメールに記載の6桁コードを入力してください（10分以内）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">認証コード</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-center text-lg tracking-[0.5em] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="000000"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors"
              >
                {loading ? '確認中...' : 'ログイン'}
              </button>
              <button
                type="button"
                onClick={() => { setOtp(null); setOtpCode(''); setError(null); }}
                className="w-full text-xs text-gray-500 hover:text-gray-700"
              >
                ← 最初からやり直す
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.emailLabel}</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t.emailPlaceholder}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.passwordLabel}</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                showStrength={false}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors mt-6"
            >
              {loading ? t.submitLoginLoading : t.submitLogin}
            </button>
          </form>
          )}

          {!otp && (
          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-gray-600">
              {t.newUser}
              <button
                type="button"
                onClick={() => navigate(`/${lang}/signup`)}
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
    </main>
  );
};

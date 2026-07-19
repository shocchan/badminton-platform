// コースのログイン画面（メールOTP）。初回は招待コードを入力。
// 招待コードはフロントの入口ふるい（VITE_AI_COURSE_INVITE）＋ Edge Function/DB でも検証。

import { useState } from 'react';
import { Lock, Mail, ArrowRight, KeyRound } from 'lucide-react';
import { sendEmailOtp, verifyEmailOtp } from '../../lib/aiLesson/course/courseAuth';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  onLoggedIn: () => void;
}

const EXPECTED_INVITE = (import.meta.env.VITE_AI_COURSE_INVITE as string | undefined) ?? 'andy-course-2026';

export const CourseLogin = ({ t, onLoggedIn }: Props) => {
  const tl = t.login;
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [invite, setInvite] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    setError('');
    if (invite.trim() !== EXPECTED_INVITE) { setError(tl.invalidInvite); return; }
    if (!email.trim()) return;
    setBusy(true);
    const r = await sendEmailOtp(email);
    setBusy(false);
    if (!r.ok) { setError(tl.genericError); return; }
    setStep('code');
  };

  const handleVerify = async () => {
    setError('');
    if (code.trim().length < 4) return;
    setBusy(true);
    const r = await verifyEmailOtp(email, code);
    setBusy(false);
    if (!r.ok) { setError(tl.invalidCode); return; }
    onLoggedIn();
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 text-center">{tl.title}</h1>
        <p className="text-sm text-gray-500 mt-2 mb-5 text-center">{tl.subtitle}</p>

        {step === 'email' ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
                <KeyRound className="w-3.5 h-3.5" />{tl.inviteLabel}
              </label>
              <input
                type="text" value={invite} onChange={(e) => { setInvite(e.target.value); setError(''); }}
                placeholder={tl.invitePlaceholder} autoComplete="off"
                className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
                <Mail className="w-3.5 h-3.5" />{tl.emailLabel}
              </label>
              <input
                type="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder={tl.emailPlaceholder} autoComplete="email"
                className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button" onClick={handleSend} disabled={busy || !email.trim() || !invite.trim()}
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {busy ? tl.sending : tl.sendCode}<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 bg-blue-50 rounded-lg p-3">{tl.sentHint}</p>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{tl.codeLabel}</label>
              <input
                type="text" inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder={tl.codePlaceholder} maxLength={8} autoComplete="one-time-code"
                className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl text-center tracking-[0.5em] text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button" onClick={handleVerify} disabled={busy || code.length < 4}
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {busy ? tl.sending : tl.verify}<ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleSend} disabled={busy}
              className="w-full min-h-11 py-2 text-sm text-gray-500 hover:text-gray-700">
              {tl.resend}
            </button>
          </div>
        )}
        <p className="text-[11px] text-gray-400 text-center mt-4">{tl.keepLoggedIn}</p>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed mt-4 px-2">{t.positioning}</p>
    </div>
  );
};

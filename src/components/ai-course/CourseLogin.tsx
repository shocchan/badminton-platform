// コースのログイン画面（メールOTP）。初回は招待コードを入力。
//
// 招待コードはフロントに一切持たない（コード内既定値・環境変数の埋め込みなし）。
// 入力値はそのまま ai-course-auth へ送り、Supabase側のDBで照合する。
// 継続ログイン（learner作成済み）では招待コードは不要。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_PUBLISH } from '../../lib/aiLesson/course/legal/legalFacts';
import { legalPathFor } from '../../lib/aiLesson/course/legal/legalContent';
import { Mail, ArrowRight, KeyRound, RotateCcw } from 'lucide-react';
import { ShokoAvatar } from './ShokoAvatar';
import { sendEmailOtp, verifyEmailOtp } from '../../lib/aiLesson/course/courseAuth';
import type { OtpSendCode } from '../../lib/aiLesson/course/courseAuth';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  onLoggedIn: () => void;
}

/** Supabase無料枠のメール送信を無駄に消費しないための再送間隔（サーバー側でも同じ値を強制） */
const RESEND_COOLDOWN_SEC = 60;

export const CourseLogin = ({ t, onLoggedIn }: Props) => {
  const tl = t.login;
  const lang: 'ja' | 'zh' = t.locale === 'zh' ? 'zh' : 'ja';
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [invite, setInvite] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentNotice, setSentNotice] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // 申込前の同意（Gate③）。法務ページが公開されるまでは要求しない
  //   ＝まだ読めない文書への同意を求めない、が公開後は必須になる
  const [consented, setConsented] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 再送カウントダウン
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [cooldown]);

  const messageFor = useCallback((c: OtpSendCode | undefined, retryAfter?: number): string => {
    switch (c) {
      case 'invalid_invite': return tl.invalidInvite;
      case 'otp_cooldown': return tl.cooldownError(retryAfter ?? RESEND_COOLDOWN_SEC);
      case 'otp_hourly_limit': return tl.hourlyLimitError;
      case 'invalid_email': return tl.invalidEmail;
      case 'network': return tl.networkError;
      default: return tl.genericError;
    }
  }, [tl]);

  const send = async (isResend: boolean) => {
    if (busy || cooldown > 0) return;
    setError('');
    setSentNotice(false);
    if (!email.trim()) return;
    setBusy(true);
    // 継続ログイン（登録済み）では招待コードは送らなくてよいが、
    // 入力があればそのまま渡す（初回判定はサーバー側で行う）
    const r = await sendEmailOtp(email, invite || undefined);
    setBusy(false);
    if (!r.ok) {
      setError(messageFor(r.code, r.retryAfter));
      if (r.code === 'otp_cooldown' && r.retryAfter) setCooldown(r.retryAfter);
      return;
    }
    setCooldown(RESEND_COOLDOWN_SEC);
    setSentNotice(true);
    if (!isResend) setStep('code');
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

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setError('');
    setSentNotice(false);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <ShokoAvatar size={72} className="mx-auto mb-3 ring-4 ring-blue-50" />
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
              <p className="text-[11px] text-gray-400 mt-1">{tl.inviteHint}</p>
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
            {LEGAL_PUBLISH && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox" checked={consented}
                    onChange={(e) => { setConsented(e.target.checked); setError(''); }}
                    className="mt-0.5 w-4 h-4 shrink-0"
                    aria-describedby="course-consent-links"
                  />
                  <span>{tl.consentLabel}</span>
                </label>
                <p id="course-consent-links" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  <Link to={legalPathFor(lang, 'terms')} className="underline underline-offset-2 text-blue-700">{tl.consentTerms}</Link>
                  <Link to={legalPathFor(lang, 'privacy')} className="underline underline-offset-2 text-blue-700">{tl.consentPrivacy}</Link>
                  <Link to={legalPathFor(lang, 'ai-disclosure')} className="underline underline-offset-2 text-blue-700">{tl.consentAi}</Link>
                </p>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button" onClick={() => void send(false)}
              disabled={busy || !email.trim() || cooldown > 0 || (LEGAL_PUBLISH && !consented)}
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {busy ? tl.sending : cooldown > 0 ? tl.resendIn(cooldown) : tl.sendCode}
              {!busy && cooldown === 0 && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sentNotice && (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3">{tl.sentSuccess}</p>
            )}
            <p className="text-sm text-gray-600 bg-blue-50 rounded-lg p-3">{tl.sentHint(email)}</p>
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

            <button
              type="button" onClick={() => void send(true)} disabled={busy || cooldown > 0}
              className="w-full min-h-11 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {cooldown > 0 ? tl.resendIn(cooldown) : tl.resend}
            </button>

            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <p className="text-[11px] text-gray-500 leading-relaxed">{tl.notArrivedHint}</p>
              <button type="button" onClick={changeEmail}
                className="min-h-11 text-xs text-blue-600 hover:text-blue-700 underline">
                {tl.changeEmail}
              </button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400 text-center mt-4">{tl.keepLoggedIn}</p>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed mt-4 px-2">{t.positioning}</p>
    </div>
  );
};

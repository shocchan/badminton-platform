// コースのログイン画面（メールOTP）。初回は招待コードを入力。
//
// 招待コードはフロントに一切持たない（コード内既定値・環境変数の埋め込みなし）。
// 入力値はそのまま ai-course-auth へ送り、Supabase側のDBで照合する。
// 継続ログイン（learner作成済み）では招待コードは不要。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_PUBLISH } from '../../lib/aiLesson/course/legal/legalFacts';
import { legalPathFor } from '../../lib/aiLesson/course/legal/legalContent';
import { Mail, ArrowRight, KeyRound, RotateCcw, Loader2, User, Lock, Ticket } from 'lucide-react';
import { ShokoAvatar } from './ShokoAvatar';
import {
  sendEmailOtp, verifyEmailOtp, signInWithStudentId, signInWithLearningCode,
} from '../../lib/aiLesson/course/courseAuth';
import type { OtpSendCode } from '../../lib/aiLesson/course/courseAuth';
import { formatLearningCode, isValidLearningCode } from '../../lib/aiLesson/course/learningCode';
import type { AiCourseDict } from '../../locales/aiCourse';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';

interface Props {
  t: AiCourseDict;
  onLoggedIn: () => void;
}

/** Supabase無料枠のメール送信を無駄に消費しないための再送間隔（サーバー側でも同じ値を強制） */
const RESEND_COOLDOWN_SEC = 60;

export const CourseLogin = ({ t, onLoggedIn }: Props) => {
  const tl = t.login;
  const lang: 'ja' | 'zh' = t.locale === 'zh' ? 'zh' : 'ja';
  /*
   * 既定は**ID＋パスワード**（2026-09-09 CEO決定「招待コードはやめよう。
   * サイトから直接入る場合は、ID＝申込時のメアドとパスワードで入れるようにする」）。
   *
   * ふだん使う入口は配った個人専用URL（/learn/:code）で、この画面には来ない。
   * ここに来るのは「検索でサイトに直接来た」人なので、その人に必要なのはID＋パスワード。
   *
   * 学習コードの手入力は**既定から外したが、まだ消していない**。
   * 合成メール時代の生徒14人が移行中で、URLを無くして手元にパスワードも無い人の
   * 最後の道が消えてしまうため。全員が新方式に乗ったら外す。
   */
  const [mode, setMode] = useState<'code' | 'id' | 'email'>(
    // 招待URLから来た人は、その場でメール登録に入れる（IDログインを探させない）
    () => (new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
      .get('invite') ? 'email' : 'id'),
  );
  const [learnCode, setLearnCode] = useState('');
  const [codeBlockedFor, setCodeBlockedFor] = useState(0);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  /**
   * ログインの失敗回数（2026-09-07）。
   * IDとパスワードは先生が配る方式なので、**忘れた人の行き先がどこにも無かった**。
   * 完全な再発行機能を作る前に、まず詰まりを見えるようにする（8/23監査 P1-8）。
   */
  const [idFailures, setIdFailures] = useState(0);
  const [step, setStep] = useState<'email' | 'code'>('email');
  /**
   * 招待コード。**URLの `?invite=` から拾う**（2026-09-10）。
   *
   * 小紅書・朋友圈・微信で配るのはURL1本だけにしたい。8桁を手で打たせると、
   * そこで人が減る（学習コードの12桁で実際にCEOが「入力が大変」と詰まった）。
   * URLから来たときは、招待の入力欄を出さずに**メールアドレスだけ**を聞く。
   * 打ち間違いようがないぶん、失敗の理由も1つ減る。
   */
  const urlInvite = (() => {
    try {
      const v = new URLSearchParams(window.location.search).get('invite') ?? '';
      // 学習コード・紹介コードと同じ文字集合（0/O/1/I/L/U を使わない）
      const n = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(n) ? n : '';
    } catch { return ''; }
  })();
  const [invite, setInvite] = useState(urlInvite);
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
    trackCourse('login_ai_course', { method: 'otp' });   // 個人情報は送らない
    onLoggedIn();
  };

  const tx = (ja: string, zh: string) => (lang === 'zh' ? zh : ja);

  /** 学習コード1つでログインする。理由は粗いまま出す（存在/失効を外へ教えない） */
  const handleCodeLogin = async () => {
    if (busy || !isValidLearningCode(learnCode)) return;
    setError('');
    setBusy(true);
    const r = await signInWithLearningCode(learnCode);
    setBusy(false);
    if (r.ok) { trackCourse('login_ai_course', { method: 'code' }); onLoggedIn(); return; }
    if (r.code === 'too_many_attempts') {
      setCodeBlockedFor(r.retryAfter ?? 900);
      setError(tx('短い時間に何度も試されました。15分ほどおいてから、もう一度お試しください。',
        '短时间内尝试了太多次。请等15分钟后再试。'));
    } else if (r.code === 'network' || r.code === 'unavailable') {
      setError(tx('通信がうまくいきませんでした。電波のよい場所でもう一度お試しください。',
        '网络连接不太顺利。请在信号好的地方再试一次。'));
    } else {
      setError(tx('この学習コードは確認できませんでした。もう一度ご確認ください。',
        '无法确认这个学习码。请再确认一下。'));
    }
    trackCourse('fail_ai_course_login', { method: 'code' });   // コードそのものは送らない
  };

  const handleIdLogin = async () => {
    if (busy || !loginId.trim() || !password) return;
    setError('');
    setBusy(true);
    const r = await signInWithStudentId(loginId, password);
    setBusy(false);
    if (!r.ok) {
      setError(tx('IDまたはパスワードが違います。', 'ID或密码不正确。'));
      setIdFailures((n) => n + 1);
      trackCourse('fail_ai_course_login', { method: 'id' });
      return;
    }
    trackCourse('login_ai_course', { method: 'id' });   // IDそのものは送らない
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
        <p className="text-sm text-gray-500 mt-2 mb-5 text-center">
          {mode === 'code'
            ? (lang === 'zh' ? '输入老师给你的「学习码」就可以开始。不需要密码。'
              : '先生から届いた「学習コード」だけで始められます。パスワードは要りません。')
            : mode === 'id'
              ? (lang === 'zh' ? '用购买时的邮箱地址和密码登录（老师发给你ID的学员，用那个ID）。'
                : '購入時のメールアドレスとパスワードでログインします（先生からIDをもらっている方はそのIDで）。')
              : tl.subtitle}
        </p>

        {mode === 'code' ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="course-learning-code" className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
                <Ticket className="w-3.5 h-3.5" />{tx('学習コード', '学习码')}
              </label>
              <input
                id="course-learning-code"
                type="text"
                inputMode="text"
                value={learnCode}
                /* 打ちながら4桁ずつ区切る。小文字・区切り無しで貼っても通る */
                onChange={(e) => { setLearnCode(formatLearningCode(e.target.value)); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCodeLogin(); }}
                placeholder="K7PX-29QM-4T6B"
                autoComplete="one-time-code"
                autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                maxLength={14}
                className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl text-center text-lg tracking-[0.18em] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                {tx('ふだんは、先生から届いたリンクを押すだけで入れます。',
                  '平时只要点老师发给你的链接就能进入。')}
              </p>
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button
              type="button" onClick={() => void handleCodeLogin()}
              disabled={busy || !isValidLearningCode(learnCode) || codeBlockedFor > 0}
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-40 transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {busy ? tx('確認中…', '确认中…') : tx('学習を始める', '开始学习')}
              {!busy && <ArrowRight className="w-4 h-4" />}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-gray-500">
              {tx('コードが分からないときは、WeChatで先生に「入れません」と送ってください。すぐに新しいコードをお渡しします。',
                '想不起学习码时，请在微信上告诉老师「进不去」，我们会马上给你新的。')}
            </p>
            <p id="course-consent-links" className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
              <Link to={legalPathFor(lang, 'terms')} className="underline underline-offset-2 text-blue-700">{tl.consentTerms}</Link>
              <Link to={legalPathFor(lang, 'privacy')} className="underline underline-offset-2 text-blue-700">{tl.consentPrivacy}</Link>
              <Link to={legalPathFor(lang, 'ai-disclosure')} className="underline underline-offset-2 text-blue-700">{tl.consentAi}</Link>
            </p>
            {/* 移行期間中の道。ID＋パスワードを配られている人がここで詰まらないように */}
            <button type="button" onClick={() => { setMode('id'); setError(''); }}
              className="w-full min-h-11 py-2 text-sm text-gray-500 hover:text-gray-700 active:text-gray-800 transition-colors rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
              {tx('IDとパスワードを受け取っている方はこちら', '收到的是ID和密码的学员点这里')}
            </button>
          </div>
        ) : mode === 'id' ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
                <User className="w-3.5 h-3.5" />{tx('ID（メールアドレス）', 'ID（邮箱地址）')}
              </label>
              {/*
                2026-09-09 CEO決定で、購入者のIDは**申込時のメールアドレス**になった。
                これまでの生徒の短いID（tanaka など）もそのまま使えるので、
                どちらも受け付ける（判定は courseAuth.loginEmailFor）。
                inputMode="email" にすると @ がすぐ出せて、打ち間違いが減る
              */}
              <input
                type="text" inputMode="email" value={loginId}
                onChange={(e) => { setLoginId(e.target.value.toLowerCase()); setError(''); }}
                placeholder={tx('例：you@example.com', '例如：you@example.com')} autoComplete="username"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">{tx('購入時のメールアドレス（先生からIDをもらっている方はそのID）を入力してください。', '请输入购买时使用的邮箱地址（如果老师给了你ID，就输入那个ID）。')}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
                <Lock className="w-3.5 h-3.5" />{tx('パスワード', '密码')}
              </label>
              <input
                type="password" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleIdLogin(); }}
                className="w-full min-h-11 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                {tx('ログイン後に、設定からパスワードを変更できます。', '登录后可在「设置」中修改密码。')}
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {/*
              忘れた人の行き先（2026-09-07）。自動の再発行はまだ無いので、
              **無い機能があるように書かない**。人に頼む先だけを、はっきり出す。
              2回失敗したら、探さなくても目に入る位置へ格上げする
            */}
            {idFailures >= 2 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-bold text-amber-900">
                  {tx('パスワードが分からないときは', '想不起密码的时候')}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  {tx('WeChatで先生に「ログインできません」と送ってください。すぐに新しいパスワードをお渡しします。メールでも大丈夫です: info@kawabado.com',
                    '请在微信上告诉老师「登录不了」，我们会马上给你新的密码。发邮件也可以: info@kawabado.com')}
                </p>
              </div>
            ) : (
              <p className="text-center text-[11px] text-gray-500">
                {tx('パスワードが分からないときは、WeChatで先生に連絡してください。',
                  '想不起密码时，请在微信上联系老师。')}
              </p>
            )}
            <button
              type="button" onClick={() => void handleIdLogin()} disabled={busy || !loginId.trim() || !password}
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-40 transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {busy ? tx('確認中…', '确认中…') : tx('ログイン', '登录')}
              {!busy && <ArrowRight className="w-4 h-4" />}
            </button>
            <p id="course-consent-links" className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
              <Link to={legalPathFor(lang, 'terms')} className="underline underline-offset-2 text-blue-700">{tl.consentTerms}</Link>
              <Link to={legalPathFor(lang, 'privacy')} className="underline underline-offset-2 text-blue-700">{tl.consentPrivacy}</Link>
              <Link to={legalPathFor(lang, 'ai-disclosure')} className="underline underline-offset-2 text-blue-700">{tl.consentAi}</Link>
            </p>
            <button type="button" onClick={() => { setMode('code'); setError(''); }}
              className="w-full min-h-11 py-2 text-sm text-gray-500 hover:text-gray-700 active:text-gray-800 transition-colors rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
              {tx('学習コードでログインする', '用学习码登录')}
            </button>
            <button type="button" onClick={() => { setMode('email'); setError(''); }}
              className="w-full min-h-11 py-2 text-sm text-gray-500 hover:text-gray-700 active:text-gray-800 transition-colors rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
              {tx('メールアドレスで登録・ログインする方はこちら', '用邮箱注册・登录的学员点这里')}
            </button>
          </div>
        ) : step === 'email' ? (
          <div className="space-y-3">
            {/*
              招待URLから来た人には、この欄を出さない（2026-09-10）。
              コードは既に入っているので、打たせる理由が無い。**画面に出す入力は少ないほどよい**
              （12桁の学習コードを画面に出したとき、CEO自身が「入力が大変」と詰まった）。
              招待つきで来たことは、下の一文で伝える
            */}
            {urlInvite ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {tx('招待リンクから来ました。メールアドレスだけで始められます。',
                  '你是通过邀请链接来的。只填邮箱就可以开始。')}
              </p>
            ) : (
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
            )}
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
              <div className={`rounded-xl border p-3 transition-colors ${consented ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox" checked={consented}
                    onChange={(e) => { setConsented(e.target.checked); setError(''); }}
                    className="mt-0.5 w-5 h-5 shrink-0 accent-blue-600"
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
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-40 transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
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
              className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-40 transition-all duration-150 flex items-center justify-center gap-2 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}{busy ? tl.sending : tl.verify}{!busy && <ArrowRight className="w-4 h-4" />}
            </button>

            <button
              type="button" onClick={() => void send(true)} disabled={busy || cooldown > 0}
              className="w-full min-h-11 py-2 text-sm text-gray-500 hover:text-gray-700 active:text-gray-800 disabled:text-gray-300 transition-colors flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded-xl"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {cooldown > 0 ? tl.resendIn(cooldown) : tl.resend}
            </button>

            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <p className="text-[11px] text-gray-500 leading-relaxed">{tl.notArrivedHint}</p>
              <button type="button" onClick={changeEmail}
                className="min-h-11 text-xs text-blue-600 hover:text-blue-700 active:text-blue-900 underline transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
                {tl.changeEmail}
              </button>
            </div>
          </div>
        )}
        {mode === 'email' && (
          <button type="button" onClick={() => { setMode('code'); setError(''); }}
            className="mt-3 w-full min-h-11 py-2 text-sm text-gray-500 hover:text-gray-700 active:text-gray-800 transition-colors rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
            {lang === 'zh' ? '用学习码登录' : '学習コードでログインする'}
          </button>
        )}
        <p className="text-[11px] text-gray-400 text-center mt-4">{tl.keepLoggedIn}</p>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed mt-4 px-2">{t.positioning}</p>
    </div>
  );
};

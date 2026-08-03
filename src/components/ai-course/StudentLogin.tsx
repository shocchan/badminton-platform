// 生徒のログイン画面（PAID STUDENT PILOT §1）。
//
// 画面に出す入力は**2つだけ**: ログインIDとパスワード。
// 初回も2回目以降も同じ方式で、4桁PIN・初回専用コードは作らない。
//
// 失敗の理由は出し分けない（IDの存在を推測させない）。
// 「忘れた方」は2種類（パスワード／ログインID）を用意し、
// どちらも登録の有無にかかわらず同じ文言を返す。

import { useState } from 'react';
import {
  loginWithId, requestPasswordReset, requestLoginIdRecovery,
} from '../../lib/aiLesson/course/auth/studentAuthClient';
import { checkPassword, passwordProblemText } from '../../lib/aiLesson/course/auth/loginCredentials';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

const field = 'w-full min-h-[52px] rounded-xl border border-gray-300 px-4 py-3 text-lg tracking-wider';
const primary = 'w-full min-h-[52px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:bg-gray-300';
const linkBtn = 'w-full min-h-[44px] text-sm text-blue-700 underline';

export interface StudentLoginProps {
  lang: L;
  onLoggedIn: () => void;
}

type View = 'login' | 'forgotPassword' | 'forgotId';

export function StudentLogin({ lang, onLoggedIn }: StudentLoginProps) {
  const [view, setView] = useState<View>('login');

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-center text-xl font-bold text-gray-900">
        {tx(lang, 'AI日本語伴走システム', 'AI日语陪伴学习系统')}
      </h1>

      {view === 'login' && (
        <LoginForm lang={lang} onLoggedIn={onLoggedIn}
          onForgotPassword={() => setView('forgotPassword')}
          onForgotId={() => setView('forgotId')} />
      )}
      {view === 'forgotPassword' && (
        <RecoverForm lang={lang} kind="password" onBack={() => setView('login')} />
      )}
      {view === 'forgotId' && (
        <RecoverForm lang={lang} kind="loginId" onBack={() => setView('login')} />
      )}
    </div>
  );
}

function LoginForm({ lang, onLoggedIn, onForgotPassword, onForgotId }: {
  lang: L; onLoggedIn: () => void; onForgotPassword: () => void; onForgotId: () => void;
}) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 入力途中の形式ヒント。**サーバーへ送る前に**気づけるようにする。
  // ただし「このIDは存在しません」のような当てになる情報は出さない
  const pwCheck = password.length > 0 ? checkPassword(password) : null;
  const pwHint = pwCheck && !pwCheck.ok && password.length >= 6
    ? passwordProblemText(pwCheck.problems[0], lang)
    : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await loginWithId({ loginId, password, lang });
    setBusy(false);
    if (r.ok) { onLoggedIn(); return; }
    setError(r.message);
  };

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label htmlFor="login-id" className="block text-sm font-semibold text-gray-800">
          {tx(lang, 'ログインID', '登录ID')}
        </label>
        <input id="login-id" type="text" value={loginId} autoComplete="username"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          placeholder="MN-4K7Q"
          onChange={(e) => setLoginId(e.target.value)}
          className={`${field} mt-1 uppercase`} />
      </div>

      <div>
        <label htmlFor="login-password" className="block text-sm font-semibold text-gray-800">
          {tx(lang, 'パスワード', '密码')}
        </label>
        <input id="login-password" type="password" value={password} autoComplete="current-password"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          inputMode="text" maxLength={12}
          onChange={(e) => setPassword(e.target.value)}
          className={`${field} mt-1`} />
        <p className="mt-1 text-xs text-gray-500">
          {tx(lang, '半角の英数字6文字（大文字・小文字は区別しません）', '6位半角英文和数字（不区分大小写）')}
        </p>
        {pwHint && <p className="mt-1 text-xs text-amber-800">{pwHint}</p>}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" className={primary} disabled={busy || !loginId || !password}>
        {busy ? tx(lang, 'ログインしています…', '正在登录…') : tx(lang, 'ログイン', '登录')}
      </button>

      <div className="space-y-1 pt-2">
        <button type="button" className={linkBtn} onClick={onForgotPassword}>
          {tx(lang, 'パスワードを忘れた方', '忘记密码')}
        </button>
        <button type="button" className={linkBtn} onClick={onForgotId}>
          {tx(lang, 'ログインIDも忘れた方', '也忘记了登录ID')}
        </button>
      </div>
    </form>
  );
}

/**
 * パスワード再設定・ログインID問い合わせの共通フォーム（§4・§5）。
 * どちらも**登録の有無にかかわらず同じ文章**を返すので、画面の作りも同じにする。
 */
function RecoverForm({ lang, kind, onBack }: {
  lang: L; kind: 'password' | 'loginId'; onBack: () => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = kind === 'password'
      ? await requestPasswordReset({ email, lang })
      : await requestLoginIdRecovery({ email, lang });
    setBusy(false);
    setDone(r.message);
  };

  const title = kind === 'password'
    ? tx(lang, 'パスワードの再設定', '重设密码')
    : tx(lang, 'ログインIDの確認', '确认登录ID');
  const help = kind === 'password'
    ? tx(lang, '登録したメールアドレスを入れてください。再設定用のリンクをお送りします。',
      '请输入注册时使用的邮箱。我们会发送重设链接。')
    : tx(lang, '登録したメールアドレスを入れてください。ログインIDをお送りします。',
      '请输入注册时使用的邮箱。我们会把登录ID发送给你。');

  return (
    <div className="mt-8">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">{help}</p>

      {done ? (
        <div className="mt-6">
          <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm leading-relaxed text-gray-800">
            {done}
          </p>
          {kind === 'loginId' && (
            <p className="mt-2 text-xs text-gray-500">
              {tx(lang, '※ パスワードはメールに書きません。分からないときは「パスワードを忘れた方」から再設定してください。',
                '※ 邮件中不会写密码。如果不清楚，请从「忘记密码」重新设置。')}
            </p>
          )}
          <button type="button" className={`${primary} mt-6`} onClick={onBack}>
            {tx(lang, 'ログイン画面へもどる', '返回登录页面')}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="recover-email" className="block text-sm font-semibold text-gray-800">
              {tx(lang, 'メールアドレス', '邮箱地址')}
            </label>
            <input id="recover-email" type="email" value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1 text-base tracking-normal`} />
          </div>
          <button type="submit" className={primary} disabled={busy || !email}>
            {busy ? tx(lang, '送信しています…', '正在发送…') : tx(lang, '送信する', '发送')}
          </button>
          <button type="button" className={linkBtn} onClick={onBack}>
            {tx(lang, 'ログイン画面へもどる', '返回登录页面')}
          </button>
        </form>
      )}
    </div>
  );
}

export default StudentLogin;

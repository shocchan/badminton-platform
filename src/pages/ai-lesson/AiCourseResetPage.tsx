// パスワード再設定画面（PAID STUDENT PILOT §4）。
//
// メールのリンクから戻ってくる先。Supabase が URL のハッシュに復帰用トークンを付けるので、
// supabase-js がそれを拾ってセッションを張った状態で開く。
// ここで新しい6文字パスワードを設定すると、古いパスワードは使えなくなる。

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { applyNewPassword } from '../../lib/aiLesson/course/auth/studentAuthClient';
import { checkPassword, passwordProblemText } from '../../lib/aiLesson/course/auth/loginCredentials';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

const field = 'w-full min-h-[52px] rounded-xl border border-gray-300 px-4 py-3 text-lg tracking-wider';
const primary = 'w-full min-h-[52px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:bg-gray-300';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

export function AiCourseResetPage() {
  const params = useParams();
  const lang: L = params.lang === 'zh' ? 'zh' : 'ja';
  const [phase, setPhase] = useState<Phase>('checking');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // メールのリンクから来たか（復帰セッションが張られているか）を確かめる
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (!alive) return;
        setPhase(data.session ? 'ready' : 'invalid');
      });
    }, 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, []);

  const check = pw1.length > 0 ? checkPassword(pw1) : null;
  const mismatch = pw2.length > 0 && checkPassword(pw1).normalized !== checkPassword(pw2).normalized;
  const canSubmit = Boolean(check?.ok) && !mismatch && pw2.length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    // 正規化した値で保存する（大小・全角の揺れを吸収した形で一意にする）
    const r = await applyNewPassword(checkPassword(pw1).normalized);
    setBusy(false);
    if (!r.ok) {
      setError(tx(lang, 'パスワードを変更できませんでした。もう一度お試しください。', '未能更改密码。请再试一次。'));
      return;
    }
    // 変更後は古いセッションを畳む（他端末のセッションもサーバー側で無効になる）
    await supabase.auth.signOut();
    setPhase('done');
  };

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-center text-xl font-bold text-gray-900">
        {tx(lang, 'パスワードの再設定', '重设密码')}
      </h1>

      {phase === 'checking' && (
        <p className="mt-8 text-center text-sm text-gray-500" role="status">
          {tx(lang, '確認しています…', '正在确认…')}
        </p>
      )}

      {phase === 'invalid' && (
        <div className="mt-8">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-relaxed text-gray-800">
            {tx(lang,
              'このリンクは期限が切れているか、すでに使われています。もう一度、ログイン画面の「パスワードを忘れた方」からお試しください。',
              '此链接已过期或已被使用。请从登录页面的「忘记密码」重新申请。')}
          </p>
          <Link to={`/${lang}/ai-course/login`} className={`${primary} mt-6 block text-center`}>
            {tx(lang, 'ログイン画面へ', '前往登录页面')}
          </Link>
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-8">
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-relaxed text-gray-800">
            {tx(lang,
              'パスワードを変更しました。新しいパスワードでログインしてください。学習の記録はそのまま残っています。',
              '密码已更改。请使用新密码登录。学习记录会完整保留。')}
          </p>
          <Link to={`/${lang}/ai-course/login`} className={`${primary} mt-6 block text-center`}>
            {tx(lang, 'ログイン画面へ', '前往登录页面')}
          </Link>
        </div>
      )}

      {phase === 'ready' && (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="new-pw" className="block text-sm font-semibold text-gray-800">
              {tx(lang, '新しいパスワード', '新密码')}
            </label>
            <input id="new-pw" type="password" value={pw1} autoComplete="new-password"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={12}
              onChange={(e) => setPw1(e.target.value)} className={`${field} mt-1`} />
            <p className="mt-1 text-xs text-gray-500">
              {tx(lang, '半角の英数字6文字。英字と数字を1つ以上ずつ入れてください。',
                '6位半角英文和数字。请至少各包含1个英文字母和数字。')}
            </p>
            {check && !check.ok && pw1.length >= 6 && (
              <p className="mt-1 text-xs text-amber-800">{passwordProblemText(check.problems[0], lang)}</p>
            )}
          </div>

          <div>
            <label htmlFor="new-pw2" className="block text-sm font-semibold text-gray-800">
              {tx(lang, 'もう一度入力', '再输入一次')}
            </label>
            <input id="new-pw2" type="password" value={pw2} autoComplete="new-password"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={12}
              onChange={(e) => setPw2(e.target.value)} className={`${field} mt-1`} />
            {mismatch && (
              <p className="mt-1 text-xs text-amber-800">
                {tx(lang, '2つのパスワードが違います。', '两次输入的密码不一致。')}
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}

          <button type="submit" className={primary} disabled={!canSubmit}>
            {busy ? tx(lang, '変更しています…', '正在更改…') : tx(lang, 'パスワードを変更する', '更改密码')}
          </button>
        </form>
      )}
    </div>
  );
}

export default AiCourseResetPage;

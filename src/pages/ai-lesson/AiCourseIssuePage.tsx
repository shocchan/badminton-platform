// 生徒アカウントの発行画面（先生用・PAID STUDENT PILOT §10）。/:lang/ai-course/issue
//
// 生徒には見せない運営画面。合言葉を知らないと発行できない（照合はサーバー側）。
// **発行結果のログインIDとパスワードは、この画面に一度だけ出る。**
// 再表示できないので、その場で控えるか、生徒へ渡す文面をコピーして使う。
//
// パスワードを再表示できない作りにしているのは、
// 「あとから見られる場所」を作らないため（見られる場所は必ず漏れる）。

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, Copy } from 'lucide-react';

type L = 'ja' | 'zh';

const field = 'w-full min-h-[48px] rounded-xl border border-gray-300 px-4 py-2.5';
const primaryBase = 'w-full min-h-[52px] rounded-xl px-4 py-3 text-base font-bold text-white';
const primary = `${primaryBase} bg-blue-600 disabled:bg-gray-300`;
const label = 'block text-sm font-semibold text-gray-800';

interface Issued {
  loginId: string;
  password: string;
  startDate: string;
  endDate: string;
  planId: string;
  purpose: string;
}

const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * コピーボタン。押したことが見た目で分かるようにする。
 * クリップボードはOSやブラウザの設定で拒否されることがあるので、
 * 成功したときだけ「コピーしました」に変える（失敗を成功に見せない）。
 */
const CopyButton = ({ text, className }: { text: string; className: string }) => {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState('done');
    } catch {
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const done = state === 'done';
  return (
    <>
      <button type="button" onClick={() => { void copy(); }}
        // 押した瞬間: 色が変わる・文字が変わる・アイコンがチェックになる・少し沈む
        // （bg は片方だけを渡す。同じ指定を重ねても、どちらが勝つかは決まらないため）
        className={`${className} ${done ? 'bg-emerald-600' : 'bg-blue-600'} flex items-center justify-center gap-2 transition-colors duration-150 active:scale-[0.98]`}
        aria-live="polite">
        {done ? <Check className="h-5 w-5" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
        {done ? 'コピーしました' : '文面をコピーする'}
      </button>
      {state === 'failed' && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          コピーできませんでした。上の文面を選んでコピーしてください。
        </p>
      )}
    </>
  );
};

export function AiCourseIssuePage() {
  const params = useParams();
  const lang: L = params.lang === 'zh' ? 'zh' : 'ja';

  const [passphrase, setPassphrase] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [purpose, setPurpose] = useState<'owner_pilot_test' | 'paid_student'>('owner_pilot_test');
  // 最初に見える言語。生徒は画面右上でいつでも切り替えられる
  const [locale, setLocale] = useState<'zh' | 'ja'>('zh');
  const [startDate, setStartDate] = useState(todayISO);
  const [months, setMonths] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<Issued | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ai-course/admin/issue-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase, email, displayName, purpose, locale,
          planId: 'coach-6m', startDate, months,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 401
          ? '合言葉が違います。'
          : res.status === 404
            ? 'この環境では発行できません（合言葉が未設定です）。'
            : (body.message ?? '発行できませんでした。入力を確認してください。'));
        return;
      }
      setIssued(body as Issued);
    } catch {
      setError('通信に失敗しました。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  /** 生徒へそのまま送れる文面 */
  const handoverText = issued ? [
    'AI日本語伴走コースのログイン情報です。',
    '',
    `ログインURL: ${origin}/${lang}/ai-course/login`,
    `ログインID : ${issued.loginId}`,
    `パスワード : ${issued.password}`,
    '',
    'パスワードは半角英数字6文字です（大文字・小文字は区別しません）。',
    'パスワードが分からなくなったときは、ログイン画面の',
    '「パスワードを忘れた方」から再設定できます。',
    '',
    `ご利用期間: ${issued.startDate} 〜 ${issued.endDate}`,
  ].join('\n') : '';

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <Helmet>
        <title>生徒アカウントの発行（運営用）</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <h1 className="text-xl font-bold text-gray-900">生徒アカウントの発行</h1>
      <p className="mt-1 text-sm text-gray-600">
        運営用の画面です。発行したログインIDとパスワードは<strong>この画面に一度だけ</strong>表示されます。
      </p>

      {issued ? (
        <div className="mt-6">
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-900">発行しました</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-600">ログインID</dt>
                <dd className="font-mono text-lg font-bold tracking-widest text-gray-900">{issued.loginId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-600">パスワード</dt>
                <dd className="font-mono text-lg font-bold tracking-widest text-gray-900">{issued.password}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-600">利用期間</dt>
                <dd className="text-gray-900">{issued.startDate} 〜 {issued.endDate}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-amber-900">
              ⚠️ パスワードは<strong>あとから見られません</strong>。いま控えるか、下の文面をコピーしてください。
            </p>
          </div>

          <div className="mt-4">
            <p className={label}>生徒へ送る文面</p>
            <textarea readOnly value={handoverText} rows={12}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 font-mono text-xs leading-relaxed"
              aria-label="生徒へ送る文面" />
            <CopyButton text={handoverText} className={`${primaryBase} mt-2`} />
          </div>

          <a href={`/${lang}/ai-course/login`}
            className="mt-4 block w-full min-h-[48px] rounded-xl border border-blue-300 bg-white px-4 py-3 text-center font-semibold text-blue-700">
            ログイン画面を開いて試す
          </a>
          <button type="button" className="mt-2 w-full min-h-[44px] text-sm text-gray-500 underline"
            onClick={() => { setIssued(null); setEmail(''); setDisplayName(''); }}>
            続けてもう1件発行する
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="pp" className={label}>合言葉（運営用）</label>
            <input id="pp" type="password" value={passphrase} autoComplete="off"
              onChange={(e) => setPassphrase(e.target.value)} className={`${field} mt-1`} />
          </div>
          <div>
            <label htmlFor="em" className={label}>生徒のメールアドレス</label>
            <input id="em" type="email" value={email} autoComplete="off"
              onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} />
            <p className="mt-1 text-xs text-gray-500">
              パスワード再設定に使います。案内メールは自動送信されません。
            </p>
          </div>
          <div>
            <label htmlFor="nm" className={label}>登録名</label>
            <input id="nm" type="text" value={displayName} autoComplete="off"
              onChange={(e) => setDisplayName(e.target.value)} className={`${field} mt-1`} />
          </div>
          <div>
            <label htmlFor="pu" className={label}>用途</label>
            <select id="pu" value={purpose} className={`${field} mt-1`}
              onChange={(e) => setPurpose(e.target.value as 'owner_pilot_test' | 'paid_student')}>
              <option value="owner_pilot_test">自分のテスト用（owner_pilot_test）</option>
              <option value="paid_student">実際の生徒（paid_student）</option>
            </select>
          </div>
          <div>
            <label htmlFor="lc" className={label}>最初に見える言語</label>
            <select id="lc" value={locale} className={`${field} mt-1`}
              onChange={(e) => setLocale(e.target.value === 'ja' ? 'ja' : 'zh')}>
              <option value="zh">简体中文（中国語話者の生徒）</option>
              <option value="ja">日本語</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">生徒は画面右上でいつでも切り替えられます。</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sd" className={label}>利用開始日</label>
              <input id="sd" type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} className={`${field} mt-1`} />
            </div>
            <div>
              <label htmlFor="mo" className={label}>期間（か月）</label>
              <input id="mo" type="number" min={1} max={24} value={months}
                onChange={(e) => setMonths(Number(e.target.value))} className={`${field} mt-1`} />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}

          <button type="submit" className={primary} disabled={busy || !passphrase || !email || !displayName}>
            {busy ? '発行しています…' : 'アカウントを発行する'}
          </button>
        </form>
      )}
    </div>
  );
}

export default AiCourseIssuePage;

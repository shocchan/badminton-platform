// 100人チャレンジ（2026-09-09 P1-4 / P1-7）。
//
// 見るもの: 何人に配って、何人が始めて、何人が続いていて、いくら使ったか。
// できること: 1枠発行して、WeChatに貼るURLをコピーする。
//
// 【金額の書き方】
// ここに出る原価は**推定**であって実請求ではない。音声はブラウザが OpenAI へ
// 直接つなぐので usage を受け取れず、分数からの見積りしか作れない。
// 「実測」と書かない（2026-08-24 に同じ言い換えで循環参照の事故が起きている）。
import { useCallback, useEffect, useState } from 'react';
import { Users, Copy, Check, Ticket, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  fetchBetaDashboard, issueBetaInvite, type BetaDashboard, type BetaInvite,
} from '../../../lib/aiLesson/course/admin/betaApi';
import {
  estimateScenarios, guardLevel, GUARD_MESSAGE, seatsAffordable, FRIENDS_BETA_BUDGET,
} from '../../../lib/aiLesson/course/plans/friendsBeta';
import { learningCodeMessage } from '../../../lib/aiLesson/course/learningCode';

const GUARD_STYLE: Record<ReturnType<typeof guardLevel>, string> = {
  ok: 'border-gray-200 bg-gray-50 text-gray-700',
  warn70: 'border-amber-300 bg-amber-50 text-amber-900',
  warn85: 'border-orange-300 bg-orange-50 text-orange-900',
  over: 'border-red-300 bg-red-50 text-red-900',
};

const Step = ({ label, value, of }: { label: string; value: number; of: number }) => (
  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
    <p className="text-[11px] text-gray-500">{label}</p>
    <p className="text-lg font-bold tabular-nums text-gray-900">
      {value}
      {of > 0 && <span className="ml-1 text-xs font-normal text-gray-400">/ {of}</span>}
    </p>
  </div>
);

export const AdminBetaChallengePanel = () => {
  const [d, setD] = useState<BetaDashboard | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<BetaInvite | null>(null);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const v = await fetchBetaDashboard();
    if (v) { setD(v); setFailed(false); } else setFailed(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setMsg('コピーできませんでした。長押しで選択してコピーしてください。');
    }
  };

  const invite = async () => {
    setBusy(true);
    setMsg('');
    const r = await issueBetaInvite('', 'zh');
    setBusy(false);
    if (!r.ok) {
      setMsg(
        r.reason === 'seats_full' ? '席数の上限に達しました。設定（friends_beta.maxSeats）を見直してください。'
          : r.reason === 'forbidden' ? '発行できませんでした（管理者アカウントでログインしてください）'
            : '発行できませんでした。もう一度お試しください。',
      );
      return;
    }
    setFresh(r.invite);
    void load();
  };

  if (failed) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-gray-800">
          <Users className="h-4 w-4 text-blue-600" />100人チャレンジ
        </p>
        <p className="text-sm text-gray-700">読み込めませんでした。管理者アカウントでログインしているか確認してください。</p>
        <button type="button" onClick={() => { setFailed(false); void load(); }}
          className="mt-3 min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-bold text-gray-700">
          もう一度読み込む
        </button>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-400">100人チャレンジを読み込み中…</p>
      </div>
    );
  }

  const level = guardLevel(d.costJpyEstimated, d.budgetJpy);
  const pct = d.budgetJpy > 0 ? Math.round((d.costJpyEstimated / d.budgetJpy) * 100) : 0;
  const affordable = seatsAffordable(d.costJpyEstimated, d.budgetJpy, d.maxSeats);
  const scenarios = estimateScenarios(d.maxSeats, d.budgetJpy);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-800">
          <Users className="h-4 w-4 text-blue-600" />100人チャレンジ（Friends Beta）
        </p>
        <button type="button" onClick={() => void load()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-3 text-xs font-bold text-gray-700 sm:min-h-9">
          <RefreshCw className="h-3.5 w-3.5" />更新
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        CEO招待制。クレジットカードも氏名も要りません。渡すのはURL1本だけです（{d.days}日間）。
      </p>

      {/* 進み具合 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Step label="招待した席" value={d.seats} of={d.maxSeats} />
        <Step label="学習を始めた" value={d.started} of={d.seats} />
        <Step label="初回を終えた" value={d.firstLessonDone} of={d.seats} />
        <Step label="2日目にも来た" value={d.secondVisit} of={d.seats} />
        <Step label="7日目以降も" value={d.day7} of={d.seats} />
        <Step label="25日目以降も" value={d.day30} of={d.seats} />
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <p className="text-[11px] text-gray-500">AI費用（推定）</p>
          <p className="text-lg font-bold tabular-nums text-gray-900">
            ¥{d.costJpyEstimated.toLocaleString()}
            <span className="ml-1 text-xs font-normal text-gray-400">/ ¥{d.budgetJpy.toLocaleString()}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <p className="text-[11px] text-gray-500">1人あたり（推定）</p>
          <p className="text-lg font-bold tabular-nums text-gray-900">
            ¥{d.seats > 0 ? Math.round(d.costJpyEstimated / d.seats).toLocaleString() : 0}
          </p>
        </div>
      </div>

      {/* 予算バー */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div className={`h-full rounded-full transition-[width] duration-500 ${
            level === 'over' ? 'bg-red-600' : level === 'warn85' ? 'bg-orange-500'
              : level === 'warn70' ? 'bg-amber-500' : 'bg-green-600'}`}
            style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className={`mt-2 rounded-xl border p-3 text-xs leading-relaxed ${GUARD_STYLE[level]}`}>
          <p className="inline-flex items-center gap-1.5 font-bold">
            {level !== 'ok' && <AlertTriangle className="h-3.5 w-3.5" />}
            予算の{pct}%（{GUARD_MESSAGE[level].ja}）
          </p>
          <p className="mt-1">{GUARD_MESSAGE[level].action}</p>
          <p className="mt-1 text-gray-600">
            この消化ペースなら、あと <b>{affordable}人</b> まで招待できます（見込みシナリオで計算）。
          </p>
        </div>
      </div>

      {/* 発行 */}
      <div className="mt-4">
        <button type="button" disabled={busy || d.seats >= d.maxSeats} onClick={() => void invite()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          <Ticket className="h-4 w-4" />
          {busy ? '発行中…' : 'Friends Beta を1枠発行する'}
        </button>
        {msg && <p className="mt-2 text-sm text-red-700" role="alert">{msg}</p>}
      </div>

      {fresh && (
        <div className="mt-3 rounded-xl border border-green-300 bg-green-50 p-3">
          <p className="text-xs font-bold text-green-900">
            発行しました（{fresh.seatsUsed} / {fresh.maxSeats} 席）。このコードは今だけ表示されます。
          </p>
          <p className="mt-1.5 select-all font-mono text-xl font-bold tracking-widest text-gray-900">{fresh.code}</p>
          <p className="mt-1 break-all text-[11px] text-gray-600">{fresh.url}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy('url', fresh.url)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white">
              {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}URLをコピー
            </button>
            <button type="button" onClick={() => void copy('msg', learningCodeMessage(fresh.code, 'zh'))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-3 text-xs font-bold text-gray-700">
              {copied === 'msg' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}WeChat用の文面（中国語）
            </button>
          </div>
        </div>
      )}

      {/* 費用の見立て */}
      <details className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-gray-700">
          100人 / ¥{d.budgetJpy.toLocaleString()} は成り立つか（3つの見立て）
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-gray-500">
            <tr><th className="py-1 text-left font-medium">見立て</th><th className="text-right font-medium">1人</th><th className="text-right font-medium">100人</th><th className="text-right font-medium">予算比</th></tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.key} className="border-t border-gray-200">
                <td className="py-1.5 pr-2 text-gray-800">{s.labelJa}<span className="block text-[11px] text-gray-500">{s.basisJa}</span></td>
                <td className="text-right tabular-nums text-gray-800">¥{s.estimate.jpyPerInvited}</td>
                <td className="text-right tabular-nums text-gray-800">¥{s.estimate.jpyTotal.toLocaleString()}</td>
                <td className={`text-right tabular-nums font-bold ${s.estimate.withinBudget ? 'text-green-700' : 'text-red-700'}`}>
                  {Math.round(s.estimate.ratioToBudget * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
          枠は音声{FRIENDS_BETA_BUDGET.voiceSessionsTotal}回（1日{FRIENDS_BETA_BUDGET.voiceSessionsPerDay}回）・
          テキスト1日{FRIENDS_BETA_BUDGET.textSessionsPerDay}回。冒険・バトル・模試・復習は原価ゼロなので枠の外です。
          <b>全員が枠を使い切ると予算を超えます</b>——だから上のガードで新規招待だけを止めます
          （いま使っている人の1か月は途中で止めません）。
          金額は分数からの<b>推定</b>で、OpenAIの実請求とはまだ突き合わせていません。
        </p>
      </details>
    </div>
  );
};

export default AdminBetaChallengePanel;

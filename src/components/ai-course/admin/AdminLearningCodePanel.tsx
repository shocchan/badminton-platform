// 生徒1人ぶんの学習コード（2026-09-09 P0-2）。
//
// できること: 発行 / 再発行 / 失効 / 個人専用URLとWeChat用の文面をコピー。
// **平文が見えるのは発行した直後の1回だけ。** 台帳にはハッシュしか無いので、
// 閉じたら管理者にも二度と見えない（分からなくなったらもう一度発行する）。
import { useCallback, useEffect, useState } from 'react';
import { Ticket, Copy, Check, RotateCcw, Ban, ShieldAlert } from 'lucide-react';
import {
  fetchLearningCodes, issueLearningCode, revokeLearningCode, type LearningCodeRow,
} from '../../../lib/aiLesson/course/admin/learningCodesApi';
import { learningCodeUrl, learningCodeMessage } from '../../../lib/aiLesson/course/learningCode';

const jst = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

export const AdminLearningCodePanel = ({ userId, labelJa }: { userId: string; labelJa: string }) => {
  const [rows, setRows] = useState<LearningCodeRow[] | null>(null);
  const [failures, setFailures] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const v = await fetchLearningCodes();
    if (!v) { setRows([]); return; }
    setRows(v.rows.filter((r) => r.userId === userId));
    setFailures(v.recentFailures);
  }, [userId]);

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

  const issue = async (revokeExisting: boolean) => {
    setBusy(true);
    setMsg('');
    const r = await issueLearningCode(userId, '', revokeExisting);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.reason === 'forbidden'
        ? '発行できませんでした（管理者アカウントでログインしてください）'
        : '発行できませんでした。もう一度お試しください。');
      return;
    }
    setFresh(r.code);
    void load();
  };

  const revoke = async (id: string) => {
    setBusy(true);
    const ok = await revokeLearningCode(id, 'admin');
    setBusy(false);
    if (!ok) { setMsg('失効できませんでした。もう一度お試しください。'); return; }
    setFresh(null);
    void load();
  };

  const active = (rows ?? []).filter((r) => !r.revokedAtISO);
  const past = (rows ?? []).filter((r) => r.revokedAtISO);

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-gray-800">
        <Ticket className="h-4 w-4 text-blue-600" />学習コード（パスワード不要の入口）
      </p>
      <p className="mb-3 text-xs leading-relaxed text-gray-500">
        WeChatでURLを送るだけで、この生徒はパスワード無しで学習を始められます。
        コードは平文で保存していないので、<b>見えるのは発行した直後だけ</b>です。
      </p>

      {/* 発行直後だけ出る欄 */}
      {fresh && (
        <div className="mb-3 rounded-xl border border-green-300 bg-green-50 p-3">
          <p className="text-xs font-bold text-green-900">発行しました。この画面を閉じると二度と表示されません。</p>
          <p className="mt-1.5 select-all font-mono text-xl font-bold tracking-widest text-gray-900">{fresh}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy('url', learningCodeUrl(fresh, 'zh'))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white">
              {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              個人専用URLをコピー
            </button>
            <button type="button" onClick={() => void copy('msg', learningCodeMessage(fresh, 'zh'))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-3 text-xs font-bold text-gray-700">
              {copied === 'msg' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              WeChat用の文面をコピー（中国語）
            </button>
            <button type="button" onClick={() => void copy('msgja', learningCodeMessage(fresh, 'ja'))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-3 text-xs font-bold text-gray-700">
              {copied === 'msgja' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              日本語の文面
            </button>
          </div>
          <p className="mt-2 break-all text-[11px] text-gray-500">{learningCodeUrl(fresh, 'zh')}</p>
        </div>
      )}

      {msg && <p className="mb-2 text-sm text-red-700" role="alert">{msg}</p>}

      {/* いま有効なコード */}
      {rows === null ? (
        <p className="text-sm text-gray-400">読み込み中…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-gray-600">
          {labelJa} さんにはまだ学習コードを発行していません。
        </p>
      ) : (
        <ul className="space-y-1.5">
          {active.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs">
              <span className="font-mono font-bold text-gray-800">{r.codePrefix}…</span>
              <span className="text-gray-500">発行 {jst(r.issuedAtISO)}</span>
              <span className={r.useCount > 0 ? 'text-green-700' : 'text-amber-700'}>
                {r.useCount > 0 ? `${r.useCount}回使用・最終 ${jst(r.lastUsedAtISO)}` : 'まだ使われていません'}
              </span>
              <button type="button" disabled={busy} onClick={() => void revoke(r.id)}
                className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-xl border border-red-200 px-2.5 text-red-700 disabled:opacity-40">
                <Ban className="h-3.5 w-3.5" />失効
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void issue(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          <RotateCcw className="h-4 w-4" />
          {active.length > 0 ? '再発行する（古いコードは失効）' : '学習コードを発行する'}
        </button>
        {active.length > 0 && (
          <button type="button" disabled={busy} onClick={() => void issue(false)}
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 text-sm font-bold text-gray-700 disabled:opacity-40">
            古いコードを残したまま追加発行
          </button>
        )}
      </div>

      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-500">失効したコード（{past.length}件）</summary>
          <ul className="mt-1.5 space-y-1">
            {past.map((r) => (
              <li key={r.id} className="text-[11px] text-gray-500">
                {r.codePrefix}… 失効 {jst(r.revokedAtISO)}（{r.revokedReason ?? '—'}）・使用 {r.useCount}回
              </li>
            ))}
          </ul>
        </details>
      )}

      {failures >= 10 && (
        <p className="mt-3 inline-flex items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          直近24時間で、間違った学習コードでの試行が{failures}回ありました。
          総当たりの可能性があるときは、配布済みのコードを再発行してください（15分10回で自動的に止まります）。
        </p>
      )}
    </div>
  );
};

export default AdminLearningCodePanel;

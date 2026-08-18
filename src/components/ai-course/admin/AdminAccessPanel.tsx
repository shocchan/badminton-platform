/* eslint-disable react-refresh/only-export-components -- 状態バッジ・JST日付ヘルパを受講権台帳（AdminAccessLedgerTab）と共用する正準としてここから export する（ResizableImage.tsx と同じ流儀） */
// 利用期間パネル（AiCourseAdminPage の AccessPanel を移設・拡張。2026-08-18 管理ページ刷新）。
//
// 変更点（刷新仕様 §3.5）:
// - userId 起点にし、learner 未作成（未ログイン）のアカウントでも期間の閲覧・変更ができる
//   （andy/wang に SQL 直叩きでしか期間を設定できなかった穴の恒久解消）
// - 「開始日から +1/+3/+6ヶ月」プリセット（JSTの日付文字列演算）
// - 商品 select（PLAN_CATALOG 参照）。『変更しない』なら plan 列をペイロードに含めず既存値温存
// - source 表示バッジ（手動/購入/テスト）。管理UIから source は書かない（purchase は決済フロー専用）
// - 「開始前なのにログイン済み」の矛盾警告（データ是正は CEO 判断・ここでは可視化のみ）
//
// 管理UIは日本語ハードコード（管理者=CEOは日本人。刷新仕様 原則5）。

import { useState } from 'react';
import { adminSetAccess } from '../../../lib/aiLesson/course/courseAdminApi';
import { accessStateOf } from '../../../lib/aiLesson/course/courseAccess';
import { allPlans, planById } from '../../../lib/aiLesson/course/plans/planCatalog';

/**
 * 受講権の行（構造互換型）。
 * courseAdminApi の AdminAccessRow はこの型へそのまま代入できる（追加列は optional で受ける）。
 * grantedBy は AdminAccessRow がまだマップしていないため optional（マップされ次第、台帳に自動で出る）。
 */
export interface AdminAccessRowLike {
  userId: string;
  validFromISO: string;
  validUntilISO: string;
  note: string | null;
  updatedAtISO?: string;
  planId?: string | null;
  planVersion?: number | null;
  source?: 'manual' | 'purchase' | 'test' | null;
  aiSecondsLimit?: number | null;
  grantedBy?: string | null;
}

/** adminSetAccess の opts（刷新仕様 §2.3-6）。opts で渡された列だけ upsert に含める＝未指定列は既存値温存 */
type SetAccessOpts = { planId?: string | null; planVersion?: number | null; source?: 'manual' | 'test' };

/** 状態バッジの正準（受講権台帳と共用）。ソースは ai_course_access の期間（accessStateOf） */
export const ACCESS_STATE_BADGE: Record<'active' | 'not_started' | 'expired' | 'none', { label: string; cls: string }> = {
  active: { label: '利用中', cls: 'bg-emerald-100 text-emerald-700' },
  not_started: { label: '開始前', cls: 'bg-blue-100 text-blue-700' },
  expired: { label: '期限切れ', cls: 'bg-red-100 text-red-700' },
  none: { label: '未設定（入れない）', cls: 'bg-gray-100 text-gray-500' },
};

/** source の表示（表示のみ。書き込みは manual|test を opts 経由でのみ） */
export const ACCESS_SOURCE_BADGE: Record<'manual' | 'purchase' | 'test', { label: string; cls: string }> = {
  manual: { label: '手動', cls: 'bg-gray-100 text-gray-600' },
  purchase: { label: '購入', cls: 'bg-blue-100 text-blue-700' },
  test: { label: 'テスト', cls: 'bg-amber-100 text-amber-700' },
};

/** ISO → JSTの YYYY-MM-DD（date input 用・表示用） */
export const jstDateOf = (iso: string | null | undefined): string => {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso));
};

/** 今日（JST）の YYYY-MM-DD */
const todayJst = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

/**
 * 開始日から +N ヶ月の「その日の終わりまで」に相当する期限日（開始日を含めてちょうどNヶ月）。
 * 例: 08-18 開始 +1ヶ月 → 09-17。月末は繰り上げず月内に丸める（01-31 +1ヶ月 → 02-27/28）。
 * 日付文字列の純演算（タイムゾーン非依存）。
 */
export const untilDateForMonths = (fromDate: string, months: number): string => {
  const [y, m, d] = fromDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  const lastDayOfTarget = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDayOfTarget)));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
};

/** 商品selectの値。'' = 変更しない（ペイロードに含めない）/ 'manual' = 手動（商品なし） */
type PlanSel = '' | 'manual' | string;

export const AdminAccessPanel = ({ userId, labelJa, row, learnerExists, lastSignInAtISO, onSaved }: {
  userId: string;
  labelJa: string;
  row: AdminAccessRowLike | null;
  learnerExists: boolean;
  lastSignInAtISO: string | null;
  onSaved: () => Promise<void>;
}) => {
  // 保存結果メッセージは外側に持つ（保存成功→行の再取得でフォームが作り直されても消えないように）
  const [msg, setMsg] = useState('');
  // 行が変わったら（別の生徒を選んだ／保存して updated_at が進んだ）フォームを初期値から作り直す。
  // effect での setState 連打ではなく key による再マウントで行う（React 推奨のリセット手法）
  const formKey = `${userId}|${row?.updatedAtISO ?? row?.validUntilISO ?? 'none'}`;
  return (
    <AccessForm key={formKey} userId={userId} labelJa={labelJa} row={row}
      learnerExists={learnerExists} lastSignInAtISO={lastSignInAtISO}
      onSaved={onSaved} msg={msg} setMsg={setMsg} />
  );
};

const AccessForm = ({ userId, labelJa, row, learnerExists, lastSignInAtISO, onSaved, msg, setMsg }: {
  userId: string;
  labelJa: string;
  row: AdminAccessRowLike | null;
  learnerExists: boolean;
  lastSignInAtISO: string | null;
  onSaved: () => Promise<void>;
  msg: string;
  setMsg: (m: string) => void;
}) => {
  const [from, setFrom] = useState(jstDateOf(row?.validFromISO));
  const [until, setUntil] = useState(jstDateOf(row?.validUntilISO));
  const [note, setNote] = useState(row?.note ?? '');
  const [planSel, setPlanSel] = useState<PlanSel>('');
  const [busy, setBusy] = useState(false);

  const state = accessStateOf(row, new Date().toISOString(), false);
  const badge = ACCESS_STATE_BADGE[state.kind === 'admin' ? 'none' : state.kind];
  const source = row?.source ?? null;
  const currentPlan = row?.planId ? planById(row.planId) : null;
  // 開始前なのにログイン/学習の実体がある（例: kana）。是正はCEO判断・ここでは見えるようにするだけ
  const contradiction = state.kind === 'not_started' && (learnerExists || lastSignInAtISO !== null);

  const applyPreset = (months: number) => {
    const f = from || todayJst();
    setFrom(f);
    setUntil(untilDateForMonths(f, months));
  };

  const save = async () => {
    if (busy || !from || !until) return;
    if (Date.parse(until) < Date.parse(from)) { setMsg('期限が開始日より前です'); return; }
    setBusy(true);
    setMsg('');
    const opts: SetAccessOpts | undefined =
      planSel === '' ? undefined
        : planSel === 'manual' ? { planId: null, planVersion: null }
          : { planId: planSel, planVersion: planById(planSel)?.version ?? null };
    const r = await adminSetAccess(userId, from, until, note, opts);
    if (r.ok) {
      await onSaved();
      setMsg('保存しました');
    } else {
      setMsg(`保存できませんでした: ${r.error ?? ''}`);
    }
    setBusy(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-gray-800">利用期間 <span className="font-normal text-gray-500">— {labelJa}</span></p>
        <div className="flex items-center gap-1.5">
          {source && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${ACCESS_SOURCE_BADGE[source].cls}`}>
              {ACCESS_SOURCE_BADGE[source].label}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
        </div>
      </div>

      {contradiction && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-300 p-2.5">
          <p className="text-xs font-bold text-amber-800">期間と実態が矛盾しています</p>
          <p className="mt-0.5 text-xs text-amber-800">
            開始前の設定なのに、この人には{learnerExists ? 'ログイン（学習データ）' : '認証記録'}があります。
            開始日が実態と合っていない可能性があります。データの是正はCEO判断です。
          </p>
        </div>
      )}
      {!learnerExists && (
        <p className="mt-2 text-[11px] text-gray-500">
          アカウント発行済み・初回ログイン待ちです。期間はここで先に設定できます。
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">開始日
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full min-h-11 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-gray-500">期限（この日の終わりまで）
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)}
            className="mt-1 w-full min-h-11 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="mt-2 flex gap-1.5">
        {([1, 3, 6] as const).map((m) => (
          <button key={m} type="button" onClick={() => applyPreset(m)}
            className="flex-1 min-h-9 py-1.5 rounded-lg text-xs font-medium border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
            開始日から+{m}ヶ月
          </button>
        ))}
      </div>

      <div className="mt-2">
        <label className="text-xs text-gray-500">商品（受講権とのひも付け）
          <select value={planSel} onChange={(e) => setPlanSel(e.target.value)}
            className="mt-1 w-full min-h-11 px-3 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">変更しない{currentPlan ? `（いま: ${currentPlan.nameJa}）` : row?.planId ? `（いま: ${row.planId}）` : '（いま: 商品なし）'}</option>
            <option value="manual">手動（商品なし）</option>
            {allPlans().map((p) => (
              <option key={p.id} value={p.id}>{p.nameJa}（{p.priceLabelJa}・{p.status === 'published' ? '公開中' : p.status === 'paused' ? '停止中' : '準備中'}）</option>
            ))}
          </select>
        </label>
      </div>

      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（例: 6ヶ月コース）"
        className="mt-2 w-full min-h-11 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />

      <button type="button" disabled={busy || !from || !until}
        className="mt-2 w-full min-h-11 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-40"
        onClick={() => { void save(); }}>
        {busy ? '保存中…' : '保存'}
      </button>
      {msg && <p className="mt-1.5 text-xs text-gray-600">{msg}</p>}
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
        期限が切れた生徒には案内画面が出て学習に入れなくなります。学習記録は消えません（延長すると続きから再開）。
        商品を「変更しない」のままなら、既存のひも付けは温存されます（購入で自動発行された行を上書きしません）。
      </p>
    </div>
  );
};

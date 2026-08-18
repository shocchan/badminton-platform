// 運用タブ（管理ページ刷新 §3.4）。問題報告・コスト全体・上限設定表示・テストデータ一括削除。
//
// - 問題報告: 未解決（amber）を上に。解決/再開は親のコールバック（adminResolveIssue）。
// - コスト: 今月合計を生徒分/検証分（テスト＋管理者）に分けて表示＋累計。値はすべて
//   ai_usage_daily 由来（親が usageMap / RPC totals から合算して渡す。原則13: 推定・仮置きは出さない）。
// - 上限設定: ai_config('usage_limits')→無ければ既定 の解決済みの値を「表示のみ」で明示。
// - テストデータ一括削除: 確認ダイアログに対象者名（is_test の learner）を列挙。0件なら disabled。
//
// 管理UIは日本語ハードコード（刷新仕様 原則5）。

import { useState } from 'react';
import type { AdminIssueReport, AdminLearnerRow } from '../../../lib/aiLesson/course/courseAdminApi';

/** 月次上限（adminAccountsApi の UsageLimits と同形・構造互換） */
export interface OpsUsageLimits {
  monthlyMaxSessions: number;
  monthlyMaxSeconds: number;
}

const usd = (v: number): string => `$${v.toFixed(2)}`;

export const AdminOpsTab = ({
  issues, onResolve, testLearners, onDeleteTestLearners,
  monthCostStudents, monthCostOthers, totalCostAll, limits, dataMsg,
}: {
  issues: AdminIssueReport[];
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  testLearners: AdminLearnerRow[];
  onDeleteTestLearners: () => Promise<number>;
  monthCostStudents: number;
  monthCostOthers: number;
  totalCostAll: number;
  limits: OpsUsageLimits;
  dataMsg: string;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sortedIssues = [...issues].sort((a, b) =>
    Number(a.resolved) - Number(b.resolved) || b.createdAt.localeCompare(a.createdAt));
  const openCount = issues.filter((r) => !r.resolved).length;

  return (
    <div className="space-y-4">
      {/* 問題報告（§18） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-bold text-gray-800 mb-2">
          問題報告{openCount > 0 && <span className="ml-1.5 text-xs font-medium text-amber-700">未対応 {openCount}件</span>}
        </p>
        {sortedIssues.length === 0 ? (
          <p className="text-xs text-gray-500">報告はまだありません。</p>
        ) : (
          <ul className="space-y-2">
            {sortedIssues.map((r) => (
              <li key={r.id} className={`border rounded-lg p-3 ${r.resolved ? 'border-gray-100 bg-gray-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 break-words">{r.comment || 'コメントなし'}</p>
                    <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                      {r.createdAt.slice(0, 16).replace('T', ' ')}
                      {r.page ? ` ・ ${r.page}` : ''}
                      {r.errorCode ? ` ・ ${r.errorCode}` : ''}
                      {r.online === false ? ' ・ オフライン' : ''}
                    </p>
                    {r.userAgent && <p className="text-[10px] text-gray-400 mt-0.5 break-all">{r.userAgent}</p>}
                  </div>
                  <button type="button" onClick={() => { void onResolve(r.id, !r.resolved); }}
                    className="shrink-0 min-h-9 px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-700">
                    {r.resolved ? '未対応に戻す' : '対応済みにする'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* コスト全体（ai_usage_daily 由来。親が生徒/検証に分けて合算した実測値） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-bold text-gray-800 mb-2">AI利用コスト（全体）</p>
        <ul className="text-sm text-gray-700 space-y-1">
          <li className="flex justify-between">
            <span>今月合計</span>
            <span className="font-bold tabular-nums">{usd(monthCostStudents + monthCostOthers)}</span>
          </li>
          <li className="flex justify-between text-xs text-gray-600 pl-3">
            <span>うち生徒分</span><span className="tabular-nums">{usd(monthCostStudents)}</span>
          </li>
          <li className="flex justify-between text-xs text-gray-600 pl-3">
            <span>うち検証分（テスト＋管理者）</span><span className="tabular-nums">{usd(monthCostOthers)}</span>
          </li>
          <li className="flex justify-between border-t border-gray-100 pt-1 mt-1">
            <span>累計（全期間）</span>
            <span className="font-bold tabular-nums">{usd(totalCostAll)}</span>
          </li>
        </ul>
        <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 p-2.5">
          <p className="text-xs font-bold text-gray-700">月間上限の設定値（表示のみ）</p>
          <p className="mt-0.5 text-xs text-gray-600 tabular-nums">
            1人あたり 月{limits.monthlyMaxSessions}回・{Math.round(limits.monthlyMaxSeconds / 60)}分
            <span className="text-gray-400">（ai_config の usage_limits。生徒個別の上書きがあればそちらが優先）</span>
          </p>
        </div>
      </div>

      {/* テストデータ一括削除（§21）。対象者名を列挙してから消す */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-bold text-gray-800 mb-1">テストデータの一括削除</p>
        <p className="text-xs text-gray-500 mb-3">
          is_test の学習者データを削除します。受講権の行と発行済みログインIDは残ります。学習データのみ消えます。
        </p>
        {!confirming ? (
          <>
            <button type="button" disabled={testLearners.length === 0}
              onClick={() => setConfirming(true)}
              className="w-full min-h-11 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              テスト用生徒データを一括削除（{testLearners.length}件）
            </button>
            {testLearners.length === 0 && <p className="text-xs text-gray-400 mt-1.5 text-center">対象なし</p>}
          </>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-bold text-red-800">次の{testLearners.length}件の学習データを削除します。よろしいですか？</p>
            <ul className="mt-1.5 space-y-0.5">
              {testLearners.map((l) => (
                <li key={l.id} className="text-xs text-red-800">・{l.displayName || l.id}</li>
              ))}
            </ul>
            <div className="mt-2.5 flex gap-2">
              <button type="button" disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDeleteTestLearners();
                  setDeleting(false);
                  setConfirming(false);
                }}
                className="flex-1 min-h-11 py-2 rounded-lg text-sm font-bold bg-red-600 text-white disabled:opacity-40">
                {deleting ? '削除中…' : '削除する'}
              </button>
              <button type="button" disabled={deleting} onClick={() => setConfirming(false)}
                className="flex-1 min-h-11 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white">
                やめる
              </button>
            </div>
          </div>
        )}
        {dataMsg && <p className="text-xs text-emerald-600 mt-2 text-center">{dataMsg}</p>}
      </div>
    </div>
  );
};

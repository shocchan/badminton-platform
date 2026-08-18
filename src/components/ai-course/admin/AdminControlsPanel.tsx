// 管理操作パネル（AiCourseAdminPage の「操作」＋発話ログ削除を統合移設。2026-08-18 管理ページ刷新）。
//
// 難易度 Lv1-5・次ミッション指定・管理メモ・一時停止/再開・発話ログ削除。
// 実行は親のコールバック（onUpdate / onDeleteUtterances）。親は settings を書く操作の完了後に
// 必ず learner 行を再取得する（stale settings 上書き対策の一環）。
// 管理UIは日本語ハードコード（刷新仕様 原則5）。

import type { AdminLearnerRow } from '../../../lib/aiLesson/course/courseAdminApi';
import type { AdminOverrides, Learner } from '../../../lib/aiLesson/course/types';
import { COURSE_MISSIONS } from '../../../lib/aiLesson/course/courseData';

/** adminUpdateLearner に渡す patch（courseAdminApi の契約と同形） */
export type AdminLearnerPatch = Partial<{
  difficultyLevel: number;
  isActive: boolean;
  adminOverrides: AdminOverrides;
  settings: Learner['settings'];
}>;

export const AdminControlsPanel = ({ learner, saved, dataMsg, onUpdate, onDeleteUtterances }: {
  learner: AdminLearnerRow;
  saved: boolean;
  dataMsg: string;
  onUpdate: (patch: AdminLearnerPatch) => Promise<void>;
  onDeleteUtterances: () => Promise<void>;
}) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
    <p className="text-sm font-bold text-gray-800 mb-3">管理操作</p>
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500">難易度を変更</label>
        <div className="flex gap-1.5 mt-1">
          {[1, 2, 3, 4, 5].map((lv) => (
            <button key={lv} type="button" onClick={() => { void onUpdate({ difficultyLevel: lv }); }}
              className={`min-h-9 flex-1 py-1.5 rounded-lg text-sm border ${learner.difficultyLevel === lv ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200'}`}>
              Lv{lv}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">次のミッションを指定</label>
        <select value={learner.adminOverrides.nextMissionId ?? ''}
          onChange={(e) => { void onUpdate({ adminOverrides: { ...learner.adminOverrides, nextMissionId: e.target.value || null } }); }}
          className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm">
          <option value="">なし（自動）</option>
          {COURSE_MISSIONS.map((m) => <option key={m.id} value={m.id}>W{m.week}-{m.order} {m.targetExpression}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500">管理メモ</label>
        {/* 生徒を切り替えたら defaultValue を反映し直すため key を張る */}
        <textarea key={learner.id} defaultValue={learner.adminOverrides.note ?? ''}
          onBlur={(e) => { void onUpdate({ adminOverrides: { ...learner.adminOverrides, note: e.target.value } }); }}
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2} />
      </div>
      <button type="button" onClick={() => { void onUpdate({ isActive: !learner.isActive }); }}
        className={`w-full min-h-11 py-2 rounded-lg text-sm font-bold ${learner.isActive ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
        {learner.isActive ? '利用を停止' : '利用を再開'}
      </button>
    </div>
    {saved && <p className="text-xs text-emerald-600 mt-2 text-center">保存しました</p>}

    {/* プライバシー操作（§13）: 発話の文字起こしのみ削除。レポート・進捗は残る */}
    <div className="mt-4 pt-3 border-t border-gray-100">
      <p className="text-sm font-bold text-gray-800 mb-1">学習データの管理</p>
      <p className="text-xs text-gray-500 mb-3">発話の文字起こしのみを削除します（レポート・進捗は残ります）。</p>
      <button type="button" onClick={() => { void onDeleteUtterances(); }}
        className="w-full min-h-11 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 hover:bg-red-50">
        この生徒の発話ログを削除
      </button>
      {dataMsg && <p className="text-xs text-emerald-600 mt-2 text-center">{dataMsg}</p>}
    </div>
  </div>
);

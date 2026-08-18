// 管理ページ 生徒詳細: 冒険モードV2の学習サマリカード。
// すべて settings.adventureV2 由来の実測値（advLearnerUsageOf / readAdvProfile）。
// 推定・仮置きの値は出さない（原則13）。V2オンボーディング済みの生徒のみ描画。

import { readAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { BAND_LABELS, GOAL_LABELS } from '../../../lib/aiLesson/course/adventure/advTypes';
import { weekStartKeyOf, jstDateKeyOf } from '../../../lib/aiLesson/course/adventure/advTeacherNote';
import { jstTodayKey, lastStudyLabelOf } from './AdminStudentsTab';
import type { AdminAccountView } from '../../../lib/aiLesson/course/admin/adminAccountModel';

interface Props {
  /** アカウント統合ビュー（adminAccountModel.buildAccountViews の出力） */
  view: AdminAccountView;
  nowISO: string;
}

const Tile = ({ label, v, warn }: { label: string; v: string; warn?: boolean }) => (
  <div className="bg-white rounded-lg border border-gray-100 p-2.5">
    <p className="text-[10px] text-gray-500">{label}</p>
    <p className={`font-bold text-sm tabular-nums ${warn ? 'text-amber-700' : 'text-gray-900'}`}>{v}</p>
  </div>
);

export const AdminStudentV2Stats = ({ view, nowISO }: Props) => {
  const adv = view.adv;
  const prof = view.learner ? readAdvProfile(view.learner.settings) : null;
  if (!adv || !adv.onboarded || !prof) return null;

  const last = lastStudyLabelOf(view.lastStudyDateKey, jstTodayKey());
  const notes = prof.teacherNotes ?? [];
  const latestNote = notes.length > 0 ? notes[notes.length - 1] : null;
  const thisWeekKey = weekStartKeyOf(jstDateKeyOf(nowISO));
  const noteDueThisWeek = latestNote?.weekStartKey !== thisWeekKey;

  const band = prof.diagnosis?.knowledgeBand ?? null;
  const adjusted = Boolean(prof.diagnosis?.adjustedByTeacherAt);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-sm font-bold text-gray-800 mb-3">冒険モードの学習状況</p>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        <Tile label="直近7日" v={`${adv.studyDays7}日`} />
        <Tile label="直近30日" v={`${adv.studyDays30}日`} />
        <Tile label="累計学習" v={`${adv.totalStudyDays}日`} />
        <Tile label="最終学習" v={last.label} warn={last.warn} />
        <Tile label="冒険完了" v={String(adv.completedQuests)} />
        <Tile label="バトル" v={String(adv.battleAttempts)} />
        <Tile label="ミニ模試" v={String(adv.mockCount)} />
        <Tile label="答案用紙" v={String(prof.answerSheets.length)} />
        <Tile label="XP" v={String(prof.xp)} />
      </div>

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">目的</dt>
          <dd className="font-medium text-gray-800 text-right">
            {prof.goalType ? GOAL_LABELS[prof.goalType].ja : '未選択'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">目標</dt>
          <dd className="font-medium text-gray-800">{prof.targetJlpt ?? '未選択'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">現在地の帯</dt>
          <dd className="font-medium text-gray-800 text-right">
            {band ? BAND_LABELS[band].ja : '未判定'}
            {adjusted && <span className="ml-1 text-blue-700">（先生調整済み）</span>}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">試験日</dt>
          <dd className="font-medium text-gray-800 tabular-nums">{prof.examDateISO ? prof.examDateISO.slice(0, 10) : '未設定'}</dd>
        </div>
      </dl>

      {/* 先生コメント（週1）の状況。送信は先生コメントパネルから */}
      <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 p-2.5 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-gray-600">
          先生コメント最新:{' '}
          {latestNote
            ? <span className="font-medium text-gray-800 tabular-nums">{latestNote.weekStartKey}の週・{latestNote.readAtISO ? '既読' : '未読'}</span>
            : <span className="font-medium text-gray-800">まだありません</span>}
        </p>
        {noteDueThisWeek && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
            今週未送信
          </span>
        )}
      </div>
    </div>
  );
};

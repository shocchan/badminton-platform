// 学習設計の調整パネル（AiCourseAdminPage の TeacherPlanPanel を移設。2026-08-18 管理ページ刷新）。
//
// ロジックは移設元と不変。変更点は props 契約のみ:
// - onApplied: () => Promise<void> になり、**await してから**完了表示を出す。
//   親（ページ）は adminGetLearner で learner 行を単行再取得してから resolve する。
//   これが「2回連続適用で1回目が黙って消える」stale settings 上書き（P0）の対策の要。
//
// 診断は本人の自己申告に引きずられるため、面談で見た実力に先生が合わせられるようにする。
// **学習の記録は消さず**、これから進む道（route）と設定だけを引き直す。

import { useState } from 'react';
import type { AdminLearnerRow } from '../../../lib/aiLesson/course/courseAdminApi';
import { adminUpdateLearner } from '../../../lib/aiLesson/course/courseAdminApi';
import { readAdvProfile, writeAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { applyTeacherPlan, TEACHER_BAND_OPTIONS } from '../../../lib/aiLesson/course/adventure/advAdminPlan';
import type { AdvBand } from '../../../lib/aiLesson/course/adventure/advTypes';

export const AdminTeacherPlanPanel = ({ learner, onApplied }: {
  learner: AdminLearnerRow;
  onApplied: () => Promise<void>;
}) => {
  const prof = readAdvProfile(learner.settings);
  const [band, setBand] = useState<AdvBand | ''>('');
  const [minutes, setMinutes] = useState<'' | '5' | '15' | '30'>('');
  const [days, setDays] = useState<'' | '3' | '5' | '7'>('');
  const [target, setTarget] = useState<'' | 'N3' | 'N2'>('');
  const [goal, setGoal] = useState<'' | 'jlpt' | 'conversation' | 'hybrid'>('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);

  if (!prof) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <p className="text-sm font-bold text-gray-800">学習設計の調整</p>
        <p className="mt-1 text-xs text-gray-500">この生徒はまだ冒険モードの準備（診断）が終わっていません。</p>
      </div>
    );
  }

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    const r = applyTeacherPlan(prof, {
      knowledgeBand: band || undefined,
      dailyMinutes: minutes ? (Number(minutes) as 5 | 15 | 30) : undefined,
      weeklyDays: days ? Number(days) : undefined,
      targetJlpt: target || undefined,
      goalType: goal || undefined,
    }, new Date().toISOString());
    const next = writeAdvProfile(learner.settings, r.profile, new Date().toISOString());
    const ok = await adminUpdateLearner(learner.id, { settings: next });
    if (ok) {
      // 親の learner 行再取得が終わるまで待つ（次の操作が古い settings を土台にしないため）
      await onApplied();
      setDone(r.changes.map((c) => c.ja));
      setBand(''); setMinutes(''); setDays(''); setTarget(''); setGoal('');
    }
    setBusy(false);
  };

  const dirty = band !== '' || minutes !== '' || days !== '' || target !== '' || goal !== '';
  const curBand = prof.diagnosis?.knowledgeBand ?? null;

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 mb-3">
      <p className="text-sm font-bold text-gray-800">学習設計の調整（先生用）</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
        面談で見た実力に合わせて現在地を直せます。**学習の記録は消えません**。変えるのは「これから進む道」だけです。
      </p>
      <div className="mt-2 text-xs text-gray-600">
        いまの設定：現在地 {curBand ?? '未判定'}
        {prof.diagnosis?.adjustedByTeacherAt && <span className="ml-1 text-blue-700">（先生が調整済み）</span>}
        ／目標 {prof.targetJlpt ?? '—'}／{prof.dailyMinutes ?? '—'}分・週{prof.weeklyDays ?? '—'}日
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <label className="text-xs text-gray-500">現在地（実力）を直す</label>
          <select value={band} onChange={(e) => setBand(e.target.value as AdvBand | '')}
            className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm">
            <option value="">変更しない</option>
            {TEACHER_BAND_OPTIONS.map((o) => (
              <option key={o.band} value={o.band}>{o.ja} — {o.note.ja}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">目的（会話をどれだけ入れるか）</label>
          <select value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}
            className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm">
            <option value="">変更しない（いま: {prof.goalType ?? '—'}）</option>
            <option value="jlpt">試験対策のみ（会話ミッションを出さない）</option>
            <option value="hybrid">試験＋会話（毎日の冒険に会話ミッションを入れる）</option>
            <option value="conversation">会話中心（試験のstageを組まない）</option>
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500">1日の量</label>
            <select value={minutes} onChange={(e) => setMinutes(e.target.value as typeof minutes)}
              className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm">
              <option value="">変更しない</option>
              <option value="5">5分（まず続ける）</option>
              <option value="15">15分</option>
              <option value="30">30分</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">週の日数</label>
            <select value={days} onChange={(e) => setDays(e.target.value as typeof days)}
              className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm">
              <option value="">変更しない</option>
              <option value="3">週3日</option>
              <option value="5">週5日</option>
              <option value="7">毎日</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">目標</label>
            <select value={target} onChange={(e) => setTarget(e.target.value as typeof target)}
              className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm">
              <option value="">変更しない</option>
              <option value="N3">N3</option>
              <option value="N2">N2</option>
            </select>
          </div>
        </div>
        <button type="button" disabled={!dirty || busy} onClick={() => { void apply(); }}
          className="w-full min-h-11 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white disabled:opacity-40">
          {busy ? '適用中…' : 'この設計で道を引き直す'}
        </button>
      </div>

      {done && (
        <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
          <p className="text-xs font-bold text-emerald-800">適用しました（記録はそのまま）</p>
          <ul className="mt-1 space-y-0.5">
            {done.length === 0
              ? <li className="text-xs text-emerald-700">変更はありませんでした</li>
              : done.map((c) => <li key={c} className="text-xs text-emerald-700">・{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

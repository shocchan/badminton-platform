// 管理者向け: Andyさん（生徒）の進捗確認＋操作。ai_admins のRLSで保護。
// 一般ユーザーがアクセスしても、RLSにより他人のデータは取得できない（空表示）。

import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../contexts/LanguageContext';
import { aiCourseI18n } from '../../locales/aiCourse';
import { isCourseAdmin, getSession } from '../../lib/aiLesson/course/courseAuth';
import { adminListLearners, adminGetProgress, adminGetSessions, adminUpdateLearner } from '../../lib/aiLesson/course/courseAdminApi';
import type { AdminLearnerRow } from '../../lib/aiLesson/course/courseAdminApi';
import { learnerStats } from '../../lib/aiLesson/course/courseStats';
import { COURSE_MISSIONS } from '../../lib/aiLesson/course/courseData';
import type { CourseSessionRecord, ItemProgress } from '../../lib/aiLesson/course/types';

export default function AiCourseAdminPage() {
  const { lang } = useLanguage();
  const t = aiCourseI18n[lang === 'zh' ? 'zh' : 'ja'];
  const ta = t.admin;
  const [state, setState] = useState<'loading' | 'noauth' | 'ready'>('loading');
  const [learners, setLearners] = useState<AdminLearnerRow[]>([]);
  const [sel, setSel] = useState<AdminLearnerRow | null>(null);
  const [progress, setProgress] = useState<ItemProgress[]>([]);
  const [sessions, setSessions] = useState<CourseSessionRecord[]>([]);
  const [saved, setSaved] = useState(false);

  const selectLearner = useCallback(async (l: AdminLearnerRow) => {
    setSel(l);
    setProgress(await adminGetProgress(l.id));
    setSessions(await adminGetSessions(l.id));
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getSession();
      if (!user) { setState('noauth'); return; }
      const admin = await isCourseAdmin();
      if (!admin) { setState('noauth'); return; }
      const list = await adminListLearners();
      setLearners(list);
      if (list[0]) await selectLearner(list[0]);
      setState('ready');
    })();
  }, [selectLearner]);

  const stats = sel ? learnerStats(sessions, progress) : null;
  const recentReport = sessions.find((s) => s.report)?.report ?? null;

  const update = async (patch: Parameters<typeof adminUpdateLearner>[1]) => {
    if (!sel) return;
    await adminUpdateLearner(sel.id, patch);
    const list = await adminListLearners();
    setLearners(list);
    const updated = list.find((l) => l.id === sel.id);
    if (updated) { setSel(updated); }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  const suggestion = (): string => {
    if (!stats) return ta.none;
    if (stats.overdueReviews > 0) return `復習期限超過が${stats.overdueReviews}件。復習を優先。`;
    if (stats.selfRate >= 0.8) return '自力使用率が高い。難易度を上げる候補。';
    if (stats.selfRate < 0.4 && stats.totalSessions >= 2) return '自力使用率が低い。難易度を下げる／中国語補助を増やす候補。';
    if (stats.streak === 0 && stats.totalSessions > 0) return 'しばらく学習が空いている。声かけ候補。';
    return '順調。現状維持。';
  };

  if (state === 'loading') return <div className="max-w-md mx-auto px-4 py-12 text-center text-gray-500">{t.common.loading}</div>;
  if (state === 'noauth') return (
    <div className="max-w-md mx-auto px-4 py-12 text-center">
      <p className="text-sm text-gray-600">{ta.noAccess}</p>
    </div>
  );

  return (
    <>
      <Helmet><title>{ta.title} | kawabado</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-bold text-gray-900 mb-4">{ta.title}</h1>

        {/* 生徒選択 */}
        <div className="flex gap-2 flex-wrap mb-4">
          {learners.map((l) => (
            <button key={l.id} type="button" onClick={() => selectLearner(l)}
              className={`min-h-9 px-3 py-1.5 rounded-lg text-sm border ${sel?.id === l.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'}`}>
              {l.displayName || l.id.slice(0, 6)} {!l.isActive && `（${ta.paused}）`}
            </button>
          ))}
          {learners.length === 0 && <p className="text-sm text-gray-500">{ta.none}</p>}
        </div>

        {sel && stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              <M label={ta.lastActive} v={stats.lastActiveISO?.slice(0, 10) ?? ta.none} />
              <M label={ta.totalSessions} v={String(stats.totalSessions)} />
              <M label={ta.weekSessions} v={String(stats.weekSessions)} />
              <M label={ta.streak} v={`${stats.streak}日`} />
              <M label={ta.currentWeek} v={`Week ${sel.currentWeek}`} />
              <M label={ta.difficulty} v={`Lv${sel.difficultyLevel}`} />
              <M label={ta.learnedExpr} v={`${stats.learnedCount}/${COURSE_MISSIONS.length}`} />
              <M label={ta.retainedExpr} v={String(stats.retainedCount)} />
              <M label={ta.overdueReviews} v={String(stats.overdueReviews)} danger={stats.overdueReviews > 0} />
              <M label={ta.selfRate} v={`${Math.round(stats.selfRate * 100)}%`} />
              <M label={ta.hintRate} v={`${Math.round(stats.hintRate * 100)}%`} />
              <M label={ta.zhRate} v={`${Math.round(stats.zhRate * 100)}%`} />
              <M label={ta.errors} v={String(stats.errorCount)} danger={stats.errorCount > 0} />
              <M label={ta.interrupted} v={String(stats.interruptedCount)} />
            </div>

            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700">{ta.suggestion}</p>
              <p className="text-sm font-medium text-gray-800">{suggestion()}</p>
            </div>

            {recentReport && (
              <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1">{ta.recentReport}</p>
                <p className="text-sm text-gray-800">{recentReport.todaySummaryJa}</p>
              </div>
            )}

            {/* 操作 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-bold text-gray-800 mb-3">{ta.controls}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">{ta.setDifficulty}</label>
                  <div className="flex gap-1.5 mt-1">
                    {[1, 2, 3, 4, 5].map((lv) => (
                      <button key={lv} type="button" onClick={() => update({ difficultyLevel: lv })}
                        className={`min-h-9 flex-1 py-1.5 rounded-lg text-sm border ${sel.difficultyLevel === lv ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200'}`}>Lv{lv}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">{ta.setNextMission}</label>
                  <select value={sel.adminOverrides.nextMissionId ?? ''} onChange={(e) => update({ adminOverrides: { ...sel.adminOverrides, nextMissionId: e.target.value || null } })}
                    className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm">
                    <option value="">{ta.none}（自動）</option>
                    {COURSE_MISSIONS.map((m) => <option key={m.id} value={m.id}>W{m.week}-{m.order} {m.targetExpression}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">{ta.setNote}</label>
                  <textarea defaultValue={sel.adminOverrides.note ?? ''} onBlur={(e) => update({ adminOverrides: { ...sel.adminOverrides, note: e.target.value } })}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2} />
                </div>
                <button type="button" onClick={() => update({ isActive: !sel.isActive })}
                  className={`w-full min-h-11 py-2 rounded-lg text-sm font-bold ${sel.isActive ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  {sel.isActive ? ta.pause : ta.resume}
                </button>
              </div>
              {saved && <p className="text-xs text-emerald-600 mt-2 text-center">{ta.saved}</p>}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const M = ({ label, v, danger }: { label: string; v: string; danger?: boolean }) => (
  <div className="bg-white rounded-lg border border-gray-100 p-2.5">
    <p className="text-[10px] text-gray-500">{label}</p>
    <p className={`font-bold text-sm ${danger ? 'text-red-600' : 'text-gray-900'}`}>{v}</p>
  </div>
);

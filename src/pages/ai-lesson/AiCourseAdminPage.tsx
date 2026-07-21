// 管理者向け: Andyさん（生徒）の進捗確認＋操作。ai_admins のRLSで保護。
// 一般ユーザーがアクセスしても、RLSにより他人のデータは取得できない（空表示）。

import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../contexts/LanguageContext';
import { aiCourseI18n } from '../../locales/aiCourse';
import { CourseHeader } from '../../components/ai-course/CourseHeader';
import { isCourseAdmin, getSession } from '../../lib/aiLesson/course/courseAuth';
import {
  adminListLearners, adminGetProgress, adminGetSessions, adminUpdateLearner,
  adminListIssueReports, adminResolveIssue, adminDeleteUtterances, adminDeleteTestLearners,
} from '../../lib/aiLesson/course/courseAdminApi';
import type { AdminLearnerRow, AdminIssueReport } from '../../lib/aiLesson/course/courseAdminApi';
import { learnerStats } from '../../lib/aiLesson/course/courseStats';
import { calculateSpeakingGrowth } from '../../lib/aiLesson/course/courseGrowth';
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
  const [issues, setIssues] = useState<AdminIssueReport[]>([]);
  const [dataMsg, setDataMsg] = useState('');

  const selectLearner = useCallback(async (l: AdminLearnerRow) => {
    setSel(l);
    setProgress(await adminGetProgress(l.id));
    setSessions(await adminGetSessions(l.id));
  }, []);

  /** 生徒一覧を取り直す（テストlearner削除後など） */
  const reload = useCallback(async () => {
    const list = await adminListLearners();
    setLearners(list);
    setSel(list[0] ?? null);
    if (list[0]) await selectLearner(list[0]);
  }, [selectLearner]);

  useEffect(() => {
    void (async () => {
      const user = await getSession();
      if (!user) { setState('noauth'); return; }
      const admin = await isCourseAdmin();
      if (!admin) { setState('noauth'); return; }
      const list = await adminListLearners();
      setLearners(list);
      if (list[0]) await selectLearner(list[0]);
      setIssues(await adminListIssueReports());
      setState('ready');
    })();
  }, [selectLearner]);

  const stats = sel ? learnerStats(sessions, progress) : null;
  const growth = sel ? calculateSpeakingGrowth(sessions, progress) : null;
  const lowConfExcluded = sessions.filter((s) => !s.speechMetrics).length; // メトリクス未算出＝除外相当
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

  if (state === 'loading') return (
    <><CourseHeader t={t} /><div className="max-w-md mx-auto px-4 py-12 text-center text-gray-500">{t.common.loading}</div></>
  );
  if (state === 'noauth') return (
    <>
      <CourseHeader t={t} />
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-sm text-gray-600">{ta.noAccess}</p>
      </div>
    </>
  );

  return (
    <>
      <CourseHeader t={t} />
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

            {/* 成長表示の根拠（§27）。学習者に見せている成長の裏付けを確認できる */}
            {growth && (
              <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-gray-700 mb-2">{ta.growthEvidence}</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li className="flex justify-between"><span>{ta.evSufficient}</span><span className="font-medium">{growth.sufficient ? `OK（${growth.sessionsAnalyzed}回）` : `分析中（あと${growth.sessionsUntilReady}回）`}</span></li>
                  <li className="flex justify-between"><span>{ta.evIndependent}</span><span className="font-medium">{Math.round(growth.independentRate * 100)}%</span></li>
                  <li className="flex justify-between"><span>{ta.evReuse}</span><span className="font-medium">{Math.round(growth.reuseRate * 100)}%</span></li>
                  <li className="flex justify-between"><span>{ta.evZhReduction}</span><span className="font-medium">{Math.round(growth.withoutZhRate * 100)}%{growth.zhReductionImproved ? ' ↑' : ''}</span></li>
                  <li className="flex justify-between"><span>{ta.evRoundtrips}</span><span className="font-medium">{growth.avgRoundtrips ? growth.avgRoundtrips.toFixed(1) : '—'}</span></li>
                  <li className="flex justify-between"><span>{ta.evReason}</span><span className="font-medium">{Math.round(growth.reasonRate * 100)}%</span></li>
                  <li className="flex justify-between"><span>{ta.evExcluded}</span><span className="font-medium">{lowConfExcluded}</span></li>
                </ul>
              </div>
            )}

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

            {/* プライバシー操作（§13）・テストデータ削除（§21） */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
              <p className="text-sm font-bold text-gray-800 mb-1">{ta.dataTitle}</p>
              <p className="text-xs text-gray-500 mb-3">{ta.dataDescription}</p>
              <button type="button"
                onClick={async () => { const n = await adminDeleteUtterances(sel.id); setDataMsg(ta.utterancesDeleted(n)); }}
                className="w-full min-h-11 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 hover:bg-red-50">
                {ta.deleteUtterances}
              </button>
              <button type="button"
                onClick={async () => { const n = await adminDeleteTestLearners(); setDataMsg(ta.testLearnersDeleted(n)); await reload(); }}
                className="w-full min-h-11 py-2 mt-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
                {ta.deleteTestLearners}
              </button>
              {dataMsg && <p className="text-xs text-emerald-600 mt-2 text-center">{dataMsg}</p>}
            </div>
          </>
        )}

        {/* 問題報告（§18） */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-bold text-gray-800 mb-2">{ta.issuesTitle}</p>
          {issues.length === 0 ? (
            <p className="text-xs text-gray-500">{ta.issuesEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((r) => (
                <li key={r.id} className={`border rounded-lg p-3 ${r.resolved ? 'border-gray-100 bg-gray-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 break-words">{r.comment || ta.none}</p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {r.createdAt.slice(0, 16).replace('T', ' ')}
                        {r.page ? ` ・ ${r.page}` : ''}
                        {r.errorCode ? ` ・ ${r.errorCode}` : ''}
                        {r.online === false ? ` ・ ${ta.offline}` : ''}
                      </p>
                      {r.userAgent && <p className="text-[10px] text-gray-400 mt-0.5 break-all">{r.userAgent}</p>}
                    </div>
                    <button type="button"
                      onClick={async () => { await adminResolveIssue(r.id, !r.resolved); setIssues(await adminListIssueReports()); }}
                      className="shrink-0 min-h-9 px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-700">
                      {r.resolved ? ta.reopen : ta.resolve}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
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

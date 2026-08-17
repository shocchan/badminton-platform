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
  adminGetUsageCost, adminGetMonthlyUsageMap, adminGetLearnerLogins,
} from '../../lib/aiLesson/course/courseAdminApi';
import type { AdminLearnerRow, AdminIssueReport, AdminUsageCost, LearnerUsageSummary, LearnerLoginInfo } from '../../lib/aiLesson/course/courseAdminApi';
import { CourseUsageCostCard } from '../../components/ai-course/CourseUsageCostCard';
import { CourseLearnerList } from '../../components/ai-course/CourseLearnerList';
import { CourseV2UsageTable } from '../../components/ai-course/CourseV2UsageTable';
import { learnerStats } from '../../lib/aiLesson/course/courseStats';
import { calculateSpeakingGrowth } from '../../lib/aiLesson/course/courseGrowth';
import { COURSE_MISSIONS } from '../../lib/aiLesson/course/courseData';
import type { CourseSessionRecord, ItemProgress } from '../../lib/aiLesson/course/types';
import { readAdvProfile, writeAdvProfile } from '../../lib/aiLesson/course/adventure/advProfile';
import { applyTeacherPlan, TEACHER_BAND_OPTIONS } from '../../lib/aiLesson/course/adventure/advAdminPlan';
import {
  buildNoteDraft, noteBodyWarnings, appendNote, noteIdFor, weekStartKeyOf, jstDateKeyOf,
} from '../../lib/aiLesson/course/adventure/advTeacherNote';
import type { AdvBand } from '../../lib/aiLesson/course/adventure/advTypes';

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
  const [usageCost, setUsageCost] = useState<AdminUsageCost | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, LearnerUsageSummary>>({});
  const [logins, setLogins] = useState<Record<string, LearnerLoginInfo>>({});

  const selectLearner = useCallback(async (l: AdminLearnerRow) => {
    setSel(l);
    setUsageCost(null);
    setProgress(await adminGetProgress(l.id));
    setSessions(await adminGetSessions(l.id));
    setUsageCost(await adminGetUsageCost(l));
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
      setUsageMap(await adminGetMonthlyUsageMap());
      setLogins(await adminGetLearnerLogins());
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
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-lg font-bold text-gray-900 mb-4">{ta.title}</h1>

        {/* 生徒ごとの利用状況（冒険モードV2・ログイン/学習日数/完了クエスト。CEO要望 2026-08-15） */}
        <CourseV2UsageTable lang={lang === 'zh' ? 'zh' : 'ja'} learners={learners}
          logins={logins} usageMap={usageMap} nowISO={new Date().toISOString()} />

        {/* 生徒一覧（選択前に全員の利用状況が分かるカード） */}
        <CourseLearnerList
          learners={learners} usageMap={usageMap} selectedId={sel?.id ?? null}
          emptyLabel={ta.none} onSelect={(l) => void selectLearner(l)}
        />

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

            {/* 利用とコスト（今月）。生徒ごとにどれくらい使っているかを可視化 */}
            {usageCost && <div className="mb-4"><CourseUsageCostCard data={usageCost} /></div>}

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

            {/* 学習設計の調整（2026-08-17）。診断は自己申告に引きずられるため、
                面談で見た実力に先生が合わせられるようにする。記録は消さずルートだけ引き直す */}
            <TeacherPlanPanel learner={sel} onApplied={() => void selectLearner(sel)} />
            <TeacherNotePanel learner={sel} onApplied={() => void selectLearner(sel)} />

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

/**
 * 学習設計の調整（2026-08-17）。
 * 診断は本人の自己申告に引きずられるため、面談で見た実力に先生が合わせられるようにする。
 * **学習の記録は消さず**、これから進む道（route）と設定だけを引き直す。
 */
/**
 * 先生からの一言（週1）。生徒のホームに1件だけ出る。
 *
 * 設計の要点:
 * - **下書きは事実だけ**を並べる（buildNoteDraft）。ほめ言葉や見通しは先生が自分の言葉で足す
 * - 送信前に約束・断定・脅しを検出して警告する（ブロックはしない・判断は人間）
 * - 同じ週に2回書いたら上書き（週1の約束を守り、通知を溜めない）
 */
const TeacherNotePanel = ({ learner, onApplied }: {
  learner: AdminLearnerRow; onApplied: () => void;
}) => {
  const prof = readAdvProfile(learner.settings);
  const [bodyJa, setBodyJa] = useState('');
  const [bodyZh, setBodyZh] = useState('');
  const [author, setAuthor] = useState('しょっちゃん先生');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!prof) return null;
  const warnings = noteBodyWarnings(bodyJa);
  const notes = prof.teacherNotes ?? [];
  const latest = notes[notes.length - 1] ?? null;

  const fillDraft = () => {
    const d = buildNoteDraft(prof, new Date().toISOString());
    setBodyJa(d.ja);
    setBodyZh(d.zh);
    setSent(false);
  };

  const send = async () => {
    if (busy || bodyJa.trim().length === 0) return;
    setBusy(true);
    const nowISO = new Date().toISOString();
    const weekStartKey = weekStartKeyOf(jstDateKeyOf(nowISO));
    const next = appendNote(notes, {
      id: noteIdFor(weekStartKey),
      weekStartKey,
      bodyJa: bodyJa.trim(),
      bodyZh: bodyZh.trim() || undefined,
      authorLabel: author.trim(),
      createdAtISO: nowISO,
      readAtISO: null,
    });
    const settings = writeAdvProfile(learner.settings, { ...prof, teacherNotes: next }, nowISO);
    const ok = await adminUpdateLearner(learner.id, { settings });
    setBusy(false);
    if (ok) { setSent(true); setBodyJa(''); setBodyZh(''); onApplied(); }
  };

  return (
    <div className="bg-white border border-rose-200 rounded-xl p-4 mb-3">
      <p className="text-sm font-bold text-gray-800">先生からの一言（週1）</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
        生徒のホームに1件だけ出ます。同じ週にもう一度書くと上書きされます。
        下書きは実測の事実だけを並べたものです。ほめ言葉や見通しは先生の言葉で足してください。
      </p>
      {latest && (
        <p className="mt-2 text-[11px] text-gray-500">
          直近: {latest.weekStartKey}の週・{latest.readAtISO ? '既読' : '未読'}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <button type="button" onClick={fillDraft}
          className="w-full min-h-11 py-2 rounded-lg text-sm font-bold border border-rose-300 text-rose-700">
          今週の事実から下書きを作る
        </button>
        <div>
          <label className="text-xs text-gray-500">日本語（必須）</label>
          <textarea value={bodyJa} onChange={(e) => { setBodyJa(e.target.value); setSent(false); }} rows={5}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">中国語（任意・空なら日本語だけ出ます）</label>
          <textarea value={bodyZh} onChange={(e) => setBodyZh(e.target.value)} rows={4}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">差出人の表示名</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)}
            className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm" />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-2.5">
            <p className="text-xs font-bold text-amber-800">送る前に確認してください</p>
            <ul className="mt-1 space-y-0.5">
              {warnings.map((w) => <li key={w.ja} className="text-xs text-amber-800">・{w.ja}</li>)}
            </ul>
          </div>
        )}

        <button type="button" disabled={busy || bodyJa.trim().length === 0} onClick={() => { void send(); }}
          className="w-full min-h-11 py-2 rounded-lg text-sm font-bold bg-rose-600 text-white disabled:opacity-40">
          {busy ? '送信中…' : '生徒のホームに出す'}
        </button>
        {sent && <p className="text-xs font-bold text-emerald-700">出しました（生徒が次に開いたときに表示されます）</p>}
      </div>
    </div>
  );
};

const TeacherPlanPanel = ({ learner, onApplied }: {
  learner: AdminLearnerRow; onApplied: () => void;
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
      <div className="bg-white border border-gray-200 rounded-xl p-4">
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
    setBusy(false);
    if (ok) {
      setDone(r.changes.map((c) => c.ja));
      setBand(''); setMinutes(''); setDays(''); setTarget(''); setGoal('');
      onApplied();
    }
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

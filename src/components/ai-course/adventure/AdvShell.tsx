// Adventure V2 オーケストレーター（§12・§13・§21・§22）。
// AiCoursePageからlearner単位flag（settings.adventureV2.enabled）で切替される。
// 学習の正準状態は profile（jsonb）＋mastery台帳。既存learnerデータへは書き込まない。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Learner, LearnerSettings, CourseSessionRecord } from '../../../lib/aiLesson/course/types';
import type {
  AdvEnemyTier, AdvMasteryAttempt, AdvRouteStage, AdvTodayQuest, AdventureV2Profile,
} from '../../../lib/aiLesson/course/adventure/advTypes';
import { readAdvProfile, writeAdvProfile, defaultAdvProfile, migrateLegacyEvidence } from '../../../lib/aiLesson/course/adventure/advProfile';
import { currentStageOf, routeProgressPct, AREA_UNIT_MAP } from '../../../lib/aiLesson/course/adventure/advRoute';
import { recordAttempt, seenQuestionKeys, masteredTargetIds, computeMastery, type MasteryStatus } from '../../../lib/aiLesson/course/adventure/advMastery';
import { generateTodayQuest } from '../../../lib/aiLesson/course/adventure/advQuest';
import { computeReadiness } from '../../../lib/aiLesson/course/adventure/advReadiness';
import { buildLessonPrepSummary } from '../../../lib/aiLesson/course/adventure/advHumanLesson';
import { companionById, companionSvg } from '../../../lib/aiLesson/course/adventure/advCompanion';
import {
  loadGrammarPools, buildDiagnosisPools, stageContent, loadAllN2Drafts,
  type GrammarPools, type StageContent,
} from '../../../lib/aiLesson/course/adventure/advContent';
import type { DiagnosisPools } from '../../../lib/aiLesson/course/adventure/advDiagnosis';
import { N3_GRAMMAR_DRAFTS } from '../../../lib/aiLesson/course/n3GrammarDrafts';
import type { N2GrammarDraft } from '../../../lib/aiLesson/course/n2GrammarDrafts';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { AdvOnboarding, type OnboardingOutcome } from './AdvOnboarding';
import { AdvBattleRunner } from './AdvBattleRunner';
import type { ItemProgress } from '../../../lib/aiLesson/course/types';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);
const dateKeyOf = (d = new Date()): string => d.toLocaleDateString('sv-SE'); // 端末ローカル日付（別日判定）

export interface AdvShellProps {
  lang: L;
  learner: Learner;
  progress: ItemProgress[];
  sessions: CourseSessionRecord[];
  reviewsDue: number;
  onSaveSettings: (next: LearnerSettings) => void;
  onOpenReview: () => void;
  onStartConversation: () => void;
  conversationAvailable: boolean;
  onStartRestate: () => void;
  restateAvailable: boolean;
  onOpenArea: (areaId: string) => void;
  onExitV2: () => void;
}

type View = 'home' | 'map' | 'readiness' | 'grammar' | 'battle' | 'complete' | 'prep';

interface BattleCtx { tier: AdvEnemyTier; targetId: string; targetLabel: string; targetIds: string[]; }

const primary = 'w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-40';
const card = 'rounded-2xl border border-gray-200 bg-white p-4';

export default function AdvShell(props: AdvShellProps) {
  const { lang, learner } = props;
  const nowISO = new Date().toISOString();
  const dateKey = dateKeyOf();

  const profile = useMemo(() => readAdvProfile(learner.settings), [learner.settings]);
  const [view, setView] = useState<View>('home');
  const [pools, setPools] = useState<GrammarPools | null>(null);
  const [diagPools, setDiagPools] = useState<DiagnosisPools | null>(null);
  const [stageCt, setStageCt] = useState<StageContent | null>(null);
  const [quest, setQuest] = useState<AdvTodayQuest | null>(null);
  const [battle, setBattle] = useState<BattleCtx | null>(null);
  const [studyGrammarId, setStudyGrammarId] = useState<string | null>(null);
  const [grammarDoc, setGrammarDoc] = useState<N2GrammarDraft | null>(null);
  const [lastMastery, setLastMastery] = useState<MasteryStatus | null>(null);

  const save = useCallback((next: AdventureV2Profile) => {
    props.onSaveSettings(writeAdvProfile(learner.settings, next, new Date().toISOString()));
  }, [learner.settings, props]);

  // 完了チェックはprofile（jsonb）に保存＝reload/端末間で復元（§25）。攻略の正準はmastery台帳
  const doneSteps = useMemo(() => {
    const ts = profile?.todaySteps;
    return new Set(ts && ts.dateKey === dateKey ? ts.done : []);
  }, [profile?.todaySteps, dateKey]);
  /** profileへstep完了を合成して返す（1イベント1保存にまとめるための純ヘルパー） */
  const withStepDone = useCallback((p: AdventureV2Profile, i: number): AdventureV2Profile => {
    const done = p.todaySteps && p.todaySteps.dateKey === dateKey ? p.todaySteps.done : [];
    return done.includes(i) ? p : { ...p, todaySteps: { dateKey, done: [...done, i] } };
  }, [dateKey]);
  const markStep = useCallback((i: number) => {
    if (!profile || doneSteps.has(i)) return;
    save(withStepDone(profile, i));
  }, [profile, doneSteps, save, withStepDone]);

  // 診断プール（onboarding時のみ必要）
  const needsOnboarding = !profile || !profile.goalType || !profile.diagnosis || !profile.route;
  useEffect(() => {
    if (!needsOnboarding || diagPools) return;
    void buildDiagnosisPools().then(setDiagPools);
  }, [needsOnboarding, diagPools]);

  // 問題プール＋今日のクエスト生成
  useEffect(() => {
    if (needsOnboarding || !profile?.route) return;
    let alive = true;
    void (async () => {
      const p = await loadGrammarPools();
      if (!alive) return;
      setPools(p);
      const mastered = masteredTargetIds(profile.mastery, nowISO);
      const stage = currentStageOf(profile.route!, mastered) ?? profile.route!.stages[profile.route!.stages.length - 1];
      const ct = await stageContent(stage, mastered);
      if (!alive) return;
      setStageCt(ct);
      const weak = Object.entries(profile.mastery)
        .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-')) && at && at.length > 0 && at[at.length - 1].scorePct < 80)
        .map(([id]) => id).slice(0, 5);
      // 表示側（home）と同じdateKey起点で日数を出す（129/128のような食い違い防止）
      const daysToExam = profile.examDateISO
        ? Math.max(0, Math.ceil((new Date(profile.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000))
        : null;
      setQuest(generateTodayQuest({
        profile, route: profile.route!, dueReviewCount: props.reviewsDue, weakGrammarIds: weak,
        dateKey, nowISO, daysToExam,
        availability: {
          nextGrammarIds: ct.nextGrammarIds, nextUnitIds: ct.nextUnitIds,
          conversationTargets: ct.conversationTargets,
        },
      }));
      trackAdv('today_quest_viewed', { goalType: profile.goalType ?? undefined, targetLevel: profile.targetJlpt ?? undefined, locale: lang });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOnboarding, profile?.route, profile?.mastery, props.reviewsDue, dateKey]);

  // 会話ステップの自動完了（今日のセッションが存在したら）
  useEffect(() => {
    if (!quest) return;
    const idx = quest.steps.findIndex((s) => s.kind === 'conversation_mission');
    if (idx < 0 || doneSteps.has(idx)) return;
    const hasToday = props.sessions.some((s) => s.startedAt.slice(0, 10) === dateKey && s.completionStatus === 'completed');
    if (hasToday) markStep(idx);
  }, [quest, props.sessions, dateKey, doneSteps, markStep]);

  // ── onboarding ──
  if (needsOnboarding) {
    if (!diagPools) return <AdvLoading lang={lang} />;
    return (
      <AdvOnboarding
        lang={lang} pools={diagPools} nowISO={nowISO}
        onComplete={(o: OnboardingOutcome) => {
          const base = profile ?? defaultAdvProfile(nowISO);
          const withLegacy = migrateLegacyEvidence(base, props.progress, nowISO);
          save({
            ...withLegacy, enabled: true,
            goalType: o.goalType, targetJlpt: o.targetJlpt, examDateISO: o.examDateISO,
            weeklyDays: o.weeklyDays, dailyMinutes: o.dailyMinutes, companionId: o.companionId,
            diagnosis: o.diagnosis,
            skills: { ...withLegacy.skills, ...o.skills, vocabulary: o.skills.vocabulary.confidence === 'none' ? withLegacy.skills.vocabulary : o.skills.vocabulary },
            route: o.route,
          });
        }}
        onCancel={props.onExitV2}
      />
    );
  }
  const prof = profile!;
  const route = prof.route!;

  // ── battle ──
  if (view === 'battle' && battle && pools) {
    const seen = seenQuestionKeys(prof.mastery);
    const wrong = new Set<string>();
    for (const at of Object.values(prof.mastery)) {
      const last = at?.[at.length - 1];
      if (last) for (const k of last.questionKeys) if (last.scorePct < 80) wrong.add(k);
    }
    return (
      <AdvBattleRunner
        key={`${battle.tier}:${battle.targetId}`}
        lang={lang} tier={battle.tier} targetId={battle.targetId} targetLabel={battle.targetLabel}
        targetIds={battle.targetIds} pool={pools.byItem}
        seenKeys={seen} recentWrongKeys={wrong}
        priorAttempts={prof.mastery[battle.targetId] ?? []}
        dateKey={dateKey} nowISO={nowISO}
        onFinish={(attempt: AdvMasteryAttempt, mastery: MasteryStatus) => {
          let ledger = recordAttempt(prof.mastery, battle.targetId, attempt);
          // stage束にも記録（boss系のみ。通常敵でstageを埋めない）
          if (battle.tier === 'midboss' || battle.tier === 'rankboss') {
            ledger = recordAttempt(ledger, currentStageOf(route, masteredTargetIds(ledger, nowISO))?.stageId ?? battle.targetId, attempt);
          }
          if (mastery.state === 'mastered') trackAdv('delayed_mastery_reached', { locale: lang });
          else if (mastery.qualifyingDays.length >= 1 && attempt.scorePct >= 80) trackAdv('mastery_80_reached', { locale: lang });
          setLastMastery(mastery);
          // mastery更新とstep完了を1回のsaveへ合成（2回saveすると片方が失われる）
          const battleIdx = quest?.steps.findIndex((s) => s.kind === 'battle' || s.kind === 'weak_reinforce') ?? -1;
          const next = { ...prof, mastery: ledger };
          save(battleIdx >= 0 ? withStepDone(next, battleIdx) : next);
        }}
        onClose={() => { setBattle(null); setView('home'); }}
      />
    );
  }

  // ── grammar study ──
  if (view === 'grammar' && studyGrammarId) {
    return (
      <AdvGrammarStudy
        lang={lang} grammarId={studyGrammarId} doc={grammarDoc} setDoc={setGrammarDoc}
        onBattle={() => {
          setBattle({ tier: 'normal', targetId: studyGrammarId, targetLabel: grammarDoc?.pattern ?? studyGrammarId, targetIds: [studyGrammarId] });
          setView('battle');
        }}
        onBack={() => { setStudyGrammarId(null); setGrammarDoc(null); setView('home'); }}
        onLearned={() => {
          const i = quest?.steps.findIndex((s) => s.kind === 'grammar_new') ?? -1;
          if (i >= 0) markStep(i);
        }}
      />
    );
  }

  // ── map ──
  if (view === 'map') {
    const mastered = masteredTargetIds(prof.mastery, nowISO);
    const cur = currentStageOf(route, mastered);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '攻略マップ', '攻略地图')} />
        <div className={`${card} mb-4`}>
          <p className="text-xs text-gray-500">{tx(lang, '最終目的地', '最终目的地')}</p>
          <p className="font-bold text-blue-900">{tx(lang, route.destinationLabelJa, route.destinationLabelZh)}</p>
          <p className="mt-1 text-xs text-gray-600">{tx(lang, `攻略率 ${routeProgressPct(route, mastered)}%`, `攻略率 ${routeProgressPct(route, mastered)}%`)}</p>
        </div>
        <ol className="space-y-2">
          {route.stages.map((s) => {
            const st = computeMastery(prof.mastery[s.stageId], nowISO);
            const isCur = cur?.stageId === s.stageId;
            const done = mastered.has(s.stageId);
            const reviewDue = st.state === 'cleared_pending_delay' && st.delayCheckOpensAt !== null && nowISO >= st.delayCheckOpensAt;
            return (
              <li key={s.stageId} className={`rounded-xl border p-3 ${isCur ? 'border-blue-500 bg-blue-50' : done ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {done ? '✅ ' : isCur ? '📍 ' : ''}{tx(lang, s.titleJa, s.titleZh)}
                      {reviewDue && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{tx(lang, '復習推奨', '建议复习')}</span>}
                    </p>
                    <p className="text-xs text-gray-600">{tx(lang, s.purposeJa, s.purposeZh)}</p>
                    {isCur && <p className="mt-1 text-xs text-blue-700">{tx(lang, st.nextJa, st.nextZh)}</p>}
                  </div>
                  <button type="button" className="min-h-[44px] shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold"
                    onClick={() => startStageBoss(s)}>
                    {tx(lang, '挑戦', '挑战')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-gray-500">{tx(lang, '上のエリアもいつでも見られます。ロックはありません。', '上面的区域随时可以查看，没有锁定。')}</p>
      </div>
    );
  }

  // ── readiness ──
  if (view === 'readiness') {
    const target = prof.targetJlpt ?? 'N2';
    const r = computeReadiness(target, prof.skills, prof.mastery);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, `${target}攻略準備度`, `${target}攻略准备度`)} />
        <div className="space-y-2">
          {r.rows.map((row) => (
            <div key={row.key} className={`${card} flex items-center justify-between`}>
              <div>
                <p className="text-sm font-semibold text-gray-900">{tx(lang, row.labelJa, row.labelZh)}
                  {row.provisional && row.pct !== null && <span className="ml-1 text-xs text-amber-700">{tx(lang, '（暫定）', '（暂定）')}</span>}
                </p>
                {(row.noteJa || row.noteZh) && <p className="text-xs text-gray-500">{tx(lang, row.noteJa ?? '', row.noteZh ?? '')}</p>}
              </div>
              <p className="text-xl font-bold text-blue-800">{row.pct === null ? tx(lang, '未判定', '未判定') : `${row.pct}%`}</p>
            </div>
          ))}
        </div>
        <div className={`${card} mt-4 bg-blue-50`}>
          <p className="text-sm font-bold text-gray-900">
            {tx(lang, '総合準備度', '综合准备度')}：{r.overallPct === null ? tx(lang, '未判定', '未判定') : `${r.overallPct}%`}
          </p>
          {r.topIssueJa && <p className="mt-1 text-sm text-gray-700">{tx(lang, r.topIssueJa, r.topIssueZh ?? '')}</p>}
          <p className="mt-2 text-xs leading-relaxed text-gray-600">{tx(lang, r.summaryJa, r.summaryZh)}</p>
        </div>
      </div>
    );
  }

  // ── 人間レッスン準備 ──
  if (view === 'prep') {
    const s = buildLessonPrepSummary(prof, nowISO);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '次の先生レッスン', '下次真人课')} />
        <div className={card}>
          <p className="text-sm text-gray-700">{tx(lang, `今週の学習：${s.weekStudyDays}日`, `本周学习：${s.weekStudyDays}天`)}</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{tx(lang, '次の先生レッスンで扱うこと', '下次真人课要处理的内容')}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
            {(lang === 'zh' ? s.learnerViewZh : s.learnerViewJa).map((t2) => <li key={t2}>{t2}</li>)}
            {s.learnerViewJa.length === 0 && <li>{tx(lang, 'まだデータが少ないです。冒険を続けると候補が出ます。', '数据还不多。继续冒险后会出现候选。')}</li>}
          </ul>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {tx(lang, 'AIが毎日の量を担当し、先生は難所攻略と方向修正に集中します。', 'AI负责每天的练习量，老师专注于攻克难点和调整方向。')}
        </p>
      </div>
    );
  }

  // ── complete（§22の表示順） ──
  if (view === 'complete' && quest) {
    const mastered = masteredTargetIds(prof.mastery, nowISO);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 className="text-lg font-bold text-gray-900">{tx(lang, '今日の冒険 おつかれさま！', '今天的冒险辛苦了！')}</h2>
        <div className={`${card} mt-3`}>
          <p className="text-sm font-semibold text-gray-900">{tx(lang, '今日できたこと', '今天做到的事')}</p>
          <ul className="mt-1 space-y-1 text-sm text-gray-700">
            {quest.steps.map((s, i) => (
              <li key={s.titleJa + i}>{doneSteps.has(i) ? '✅' : '⬜'} {tx(lang, s.titleJa, s.titleZh)}</li>
            ))}
          </ul>
        </div>
        {quest.targetExpressions.length > 0 && (
          <div className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900">{tx(lang, '今日の表現', '今天的表达')}</p>
            <p className="mt-1 text-sm text-gray-700">{quest.targetExpressions.join('・')}</p>
          </div>
        )}
        {lastMastery && (
          <div className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900">{tx(lang, 'バトルの成果', '战斗成果')}</p>
            <p className="mt-1 text-sm text-gray-700">{tx(lang, lastMastery.nextJa, lastMastery.nextZh)}</p>
          </div>
        )}
        <div className={`${card} mt-3`}>
          <p className="text-sm font-semibold text-gray-900">{tx(lang, '攻略率', '攻略率')}</p>
          <p className="mt-1 text-sm text-gray-700">{routeProgressPct(route, mastered)}%</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{tx(lang, '次の復習', '下次复习')}</p>
          <p className="mt-1 text-sm text-gray-700">
            {props.reviewsDue > 0 ? tx(lang, `残り${props.reviewsDue}件`, `还剩${props.reviewsDue}项`) : tx(lang, '明日・約3分', '明天・约3分钟')}
          </p>
        </div>
        <p className="mt-3 text-center text-xs text-gray-500">XP +{[...doneSteps].length * 10}</p>
        <button type="button" className={`${primary} mt-4`} onClick={() => setView('home')}>
          {tx(lang, 'ホームへ', '回到主页')}
        </button>
      </div>
    );
  }

  // ── home（第一CTAは一つ・§12） ──
  const mastered = masteredTargetIds(prof.mastery, nowISO);
  const stage = currentStageOf(route, mastered);
  const comp = companionById(prof.companionId);
  // render中はDate.now()を使わない（dateKey起点の純計算・react-hooks/purity）
  const daysToExam = prof.examDateISO
    ? Math.max(0, Math.ceil((new Date(prof.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000)) : null;
  const nextStepIdx = quest ? quest.steps.findIndex((_, i) => !doneSteps.has(i)) : -1;
  const allDone = quest !== null && nextStepIdx === -1;

  const runStep = (i: number) => {
    if (!quest) return;
    const s = quest.steps[i];
    trackAdv('today_quest_started', { goalType: prof.goalType ?? undefined, routeStage: stage?.kind, durationBucket: String(prof.dailyMinutes ?? 15) as '5' | '15' | '30', locale: lang });
    if (s.kind === 'review_due') { markStep(i); props.onOpenReview(); return; }
    if (s.kind === 'conversation_mission') { if (props.conversationAvailable) { trackAdv('conversation_started', { locale: lang }); props.onStartConversation(); } return; }
    if (s.kind === 'restate') { markStep(i); if (props.restateAvailable) props.onStartRestate(); return; }
    if (s.kind === 'vocab_new' && s.refIds[0]?.startsWith('n3u-')) {
      markStep(i);
      const areaEntry = Object.entries(AREA_BY_UNIT).find(([u]) => u === s.refIds[0]);
      props.onOpenArea(areaEntry ? areaEntry[1] : 'area01-minato');
      return;
    }
    if (s.kind === 'grammar_new' && s.refIds[0]) { setStudyGrammarId(s.refIds[0]); setView('grammar'); return; }
    if (s.kind === 'weak_reinforce' && s.refIds.length > 0) {
      setBattle({ tier: 'normal', targetId: s.refIds[0], targetLabel: tx(lang, '弱点補強', '弱点补强'), targetIds: s.refIds });
      setView('battle'); return;
    }
    if (s.kind === 'battle' || s.kind === 'reading_short') {
      const targets = s.refIds.length > 0 ? s.refIds : (stageCt?.battleTargetIds ?? []);
      setBattle({ tier: (s.tier ?? 'normal'), targetId: targets[0] ?? (stage?.stageId ?? 'stage'), targetLabel: stage ? tx(lang, stage.titleJa, stage.titleZh) : '', targetIds: targets });
      setView('battle'); return;
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={tx(lang, '今日の冒険', '今天的冒险')}>
      <div className="mb-4 flex items-center gap-3">
        <span className="h-12 w-12 shrink-0" dangerouslySetInnerHTML={{ __html: companionSvg(comp.id) }} />
        <div>
          <p className="text-sm text-gray-600">{tx(lang, comp.greetJa, comp.greetZh)}</p>
          <h1 className="text-lg font-bold text-gray-900">
            {prof.goalType === 'conversation'
              ? tx(lang, '会話力を上げる今日の冒険', '提升会话能力的今日冒险')
              : tx(lang, `${prof.targetJlpt ?? ''}合格への今日の冒険`, `通往${prof.targetJlpt ?? ''}合格的今日冒险`)}
          </h1>
        </div>
      </div>

      <div className={`${card} mb-4`}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <span>🏁 {tx(lang, route.destinationLabelJa, route.destinationLabelZh)}</span>
          <span>📍 {stage ? tx(lang, stage.titleJa, stage.titleZh) : tx(lang, '全stage攻略済み', '全部阶段已攻克')}</span>
          {daysToExam !== null && <span>🗓 {tx(lang, `試験まで${daysToExam}日`, `距考试${daysToExam}天`)}</span>}
          <span>📅 {tx(lang, `今週 ${weekDaysOf(prof, dateKey)}/${prof.weeklyDays ?? 5}日`, `本周 ${weekDaysOf(prof, dateKey)}/${prof.weeklyDays ?? 5}天`)}</span>
        </div>
      </div>

      {!quest && <AdvLoading lang={lang} inline />}

      {quest && (
        <div className={`${card} mb-4 border-blue-200`}>
          <p className="text-sm font-semibold text-gray-900">
            {tx(lang, `今日やること（約${quest.estimatedMinutes}分）`, `今天要做的（约${quest.estimatedMinutes}分钟）`)}
          </p>
          <p className="mt-1 text-xs text-gray-600">{tx(lang, quest.whyJa, quest.whyZh)}</p>
          <ol className="mt-3 space-y-2">
            {quest.steps.map((s, i) => (
              <li key={s.titleJa + i}>
                <button type="button"
                  className={`flex w-full min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left ${
                    doneSteps.has(i) ? 'border-emerald-300 bg-emerald-50' : i === nextStepIdx ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                  onClick={() => runStep(i)}
                  disabled={s.kind === 'conversation_mission' && !props.conversationAvailable}>
                  <span aria-hidden>{doneSteps.has(i) ? '✅' : `${i + 1}.`}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{tx(lang, s.titleJa, s.titleZh)}</span>
                    <span className="block text-xs text-gray-500">{tx(lang, `約${s.estMinutes}分`, `约${s.estMinutes}分钟`)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {!allDone && nextStepIdx >= 0 && (
            <button type="button" className={`${primary} mt-4`} onClick={() => runStep(nextStepIdx)}>
              {tx(lang, '今日の冒険を始める', '开始今天的冒险')}
            </button>
          )}
          {allDone && (
            <button type="button" className={`${primary} mt-4 bg-emerald-600`}
              onClick={() => {
                const log = prof.questLog.filter((e) => e.dateKey !== dateKey);
                save({
                  ...prof,
                  questLog: [...log, { dateKey, completedSteps: doneSteps.size, totalSteps: quest.steps.length }].slice(-60),
                  lastQuest: { dateKey, primaryTargets: quest.primaryTargets, stepKinds: quest.steps.map((s) => s.kind) },
                });
                trackAdv('today_quest_completed', { goalType: prof.goalType ?? undefined, locale: lang });
                setView('complete');
              }}>
              {tx(lang, '今日の冒険を締めくくる', '结束今天的冒险')}
            </button>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {tx(lang, `成功条件：${quest.successConditionJa}`, `成功条件：${quest.successConditionZh}`)}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <SubLink lang={lang} ja="攻略マップ" zh="攻略地图" onClick={() => setView('map')} />
        <SubLink lang={lang} ja="合格準備度" zh="合格准备度" onClick={() => { trackAdv('report_viewed', { locale: lang }); setView('readiness'); }} />
        <SubLink lang={lang} ja="復習の庭" zh="复习之庭" badge={props.reviewsDue} onClick={props.onOpenReview} />
        <SubLink lang={lang} ja="先生レッスン準備" zh="真人课准备" onClick={() => { trackAdv('human_lesson_summary_viewed', { locale: lang }); setView('prep'); }} />
      </div>

      <button type="button" className="mt-6 w-full min-h-[44px] text-xs text-gray-400 underline" onClick={props.onExitV2}>
        {tx(lang, '従来のホームに戻す（データは残ります）', '返回原来的主页（数据会保留）')}
      </button>
    </div>
  );

  function startStageBoss(s: AdvRouteStage) {
    const tier: AdvEnemyTier = s.kind === 'mock_boss' ? 'rankboss' : s.kind === 'n2_gate' ? 'midboss' : 'strong';
    void (async () => {
      const mastered2 = masteredTargetIds(prof.mastery, nowISO);
      const ct = await stageContent(s, mastered2);
      const targets = ct.battleTargetIds.length > 0 ? ct.battleTargetIds : [s.stageId];
      setBattle({ tier, targetId: s.stageId, targetLabel: tx(lang, s.titleJa, s.titleZh), targetIds: targets });
      setView('battle');
    })();
  }
}

/** unit → area 逆引き（advRoute.AREA_UNIT_MAPと同期・ガードテストあり） */
const AREA_BY_UNIT: Record<string, string> = Object.fromEntries(
  Object.entries(AREA_UNIT_MAP).flatMap(([area, units]) => units.map((u) => [u, area])),
);

const weekDaysOf = (p: AdventureV2Profile, dateKey: string): number => {
  const now = new Date(`${dateKey}T00:00:00`);
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return new Set(p.questLog.filter((e) => new Date(`${e.dateKey}T00:00:00`) >= monday && e.completedSteps > 0).map((e) => e.dateKey)).size;
};

function AdvLoading({ lang, inline }: { lang: L; inline?: boolean }) {
  return (
    <div className={inline ? 'py-8 text-center' : 'flex min-h-[40vh] items-center justify-center'} role="status">
      <p className="text-sm text-gray-500">{tx(lang, '冒険の準備をしています…', '正在准备冒险…')}</p>
    </div>
  );
}

function BackBar({ lang, onBack, title }: { lang: L; onBack: () => void; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button type="button" className="min-h-[44px] min-w-[44px] rounded-lg border border-gray-200 px-3" onClick={onBack} aria-label={tx(lang, 'もどる', '返回')}>←</button>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    </div>
  );
}

function SubLink({ lang, ja, zh, badge, onClick }: { lang: L; ja: string; zh: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className="relative min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800" onClick={onClick}>
      {tx(lang, ja, zh)}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{badge}</span>
      )}
    </button>
  );
}

/** 文法学習カード（draft本文をそのまま学ぶ→バトルへ） */
function AdvGrammarStudy({ lang, grammarId, doc, setDoc, onBattle, onBack, onLearned }: {
  lang: L; grammarId: string; doc: N2GrammarDraft | null;
  setDoc: (d: N2GrammarDraft | null) => void;
  onBattle: () => void; onBack: () => void; onLearned: () => void;
}) {
  useEffect(() => {
    let alive = true;
    void (async () => {
      const n3 = (N3_GRAMMAR_DRAFTS as unknown as N2GrammarDraft[]).find((d) => d.grammarId === grammarId);
      if (n3) { if (alive) setDoc(n3); return; }
      const n2 = (await loadAllN2Drafts()).find((d) => d.grammarId === grammarId);
      if (alive) setDoc(n2 ?? null);
    })();
    return () => { alive = false; };
  }, [grammarId, setDoc]);

  useEffect(() => { if (doc) onLearned(); // 表示できた時点で「学んだ」チェック（攻略は別途バトルで判定）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  if (!doc) return <AdvLoading lang={lang} />;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <BackBar lang={lang} onBack={onBack} title={doc.pattern} />
      <div className={card}>
        <p className="text-sm text-gray-600">{doc.meaningJa}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">{doc.explanationZh}</p>
        <p className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">{tx(lang, '接続', '接续')}：{doc.formation}</p>
        <div className="mt-3 space-y-2">
          {doc.examplesJa.map((ex, i) => (
            <div key={ex} className="rounded-xl border border-gray-100 bg-gray-50 p-2">
              <p className="text-sm text-gray-900">{ex}</p>
              {doc.examplesZh[i] && <p className="text-xs text-gray-500">{doc.examplesZh[i]}</p>}
            </div>
          ))}
        </div>
        {doc.commonMistakesZh && (
          <p className="mt-3 text-xs leading-relaxed text-amber-800">⚠️ {doc.commonMistakesZh}</p>
        )}
        {doc.contrast && <p className="mt-2 text-xs leading-relaxed text-gray-600">{doc.contrast}</p>}
      </div>
      <button type="button" className={`${primary} mt-4`} onClick={onBattle}>
        {tx(lang, 'この文法でバトルに挑む', '用这个语法挑战战斗')}
      </button>
    </div>
  );
}

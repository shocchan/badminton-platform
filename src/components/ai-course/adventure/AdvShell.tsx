// Adventure V2 オーケストレーター。
// UX CLARITY: 「1画面、1つの決断」— 現在地と先のルートは見せるが、押すCTAは常に一つ。
// ASSESSMENT INTEGRITY: 「今どの試験科目を鍛えているか」を必ず表示し、
//                       準備度は技能別・データ不足は未判定。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Learner, LearnerSettings, CourseSessionRecord, ItemProgress } from '../../../lib/aiLesson/course/types';
import type {
  AdvEnemyTier, AdvMasteryAttempt, AdvRouteStage, AdvTodayQuest, AdventureV2Profile,
} from '../../../lib/aiLesson/course/adventure/advTypes';
import { readAdvProfile, writeAdvProfile, defaultAdvProfile, migrateLegacyEvidence } from '../../../lib/aiLesson/course/adventure/advProfile';
import { currentStageOf, routeProgressPct, AREA_UNIT_MAP } from '../../../lib/aiLesson/course/adventure/advRoute';
import { recordAttempt, seenQuestionKeys, masteredTargetIds, computeMastery, type MasteryStatus } from '../../../lib/aiLesson/course/adventure/advMastery';
import { generateTodayQuest } from '../../../lib/aiLesson/course/adventure/advQuest';
import { computeReadiness } from '../../../lib/aiLesson/course/adventure/advReadiness';
import { buildLessonPrepSummary } from '../../../lib/aiLesson/course/adventure/advHumanLesson';
import {
  ALL_TEACHERS, resolveTeacher, teacherName, type AdvTeacherId,
} from '../../../lib/aiLesson/course/adventure/advTeacher';
import { TeacherAvatar } from '../TeacherAvatar';
import {
  loadGrammarPools, buildDiagnosisPools, stageContent, loadAllN2Drafts,
  type GrammarPools, type StageContent,
} from '../../../lib/aiLesson/course/adventure/advContent';
import type { DiagnosisPools } from '../../../lib/aiLesson/course/adventure/advDiagnosis';
import { N3_GRAMMAR_DRAFTS } from '../../../lib/aiLesson/course/n3GrammarDrafts';
import type { N2GrammarDraft } from '../../../lib/aiLesson/course/n2GrammarDrafts';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { nowTrainingLabel, masteryScopeName, type ExamSkill } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { TERMS } from '../../../lib/aiLesson/course/adventure/advTerms';
import { AdvOnboarding, type OnboardingOutcome } from './AdvOnboarding';
import { AdvBattleRunner } from './AdvBattleRunner';
import { AdvReadingRunner } from './AdvReadingRunner';
import { AdvListeningRunner } from './AdvListeningRunner';
import { AdvMockRunner } from './AdvMockRunner';
import { buildMockSpec } from '../../../lib/aiLesson/course/adventure/advMock';
import { toMockAttempt, toMockLogEntry, type MockResult, type MockSessionState } from '../../../lib/aiLesson/course/adventure/advMockSession';
import { readingSetsFor, readingTargetIds, readingPool } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { listeningSetsFor, listeningTargetIds, listeningPool } from '../../../lib/aiLesson/course/adventure/listening/listeningBank';
import { vocabPool } from '../../../lib/aiLesson/course/adventure/vocab/vocabQuestions';
import { pickRestateMaterial } from '../../../lib/aiLesson/course/adventure/advRestate';
import { collectSkillEvidence } from '../../../lib/aiLesson/course/adventure/advReadiness';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);
const term = (k: keyof typeof TERMS, lang: L) => TERMS[k][lang];
const dateKeyOf = (d = new Date()): string => d.toLocaleDateString('sv-SE');

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

type View = 'home' | 'map' | 'readiness' | 'grammar' | 'battle' | 'complete' | 'prep' | 'reading' | 'listening' | 'restate' | 'mock' | 'teacher';
interface BattleCtx { tier: AdvEnemyTier; targetId: string; targetLabel: string; targetIds: string[]; }

const primaryBtn = 'w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:opacity-40';
const card = 'rounded-2xl border border-gray-200 bg-white p-4';

/** step種別 → 鍛えている試験科目（Homeの「今鍛えている試験力」表示に使う） */
const skillOfStep = (kind: string): ExamSkill => {
  if (kind === 'grammar_new' || kind === 'weak_reinforce' || kind === 'battle') return 'grammar';
  if (kind === 'vocab_new' || kind === 'review_due') return 'charactersVocabulary';
  if (kind === 'reading_short') return 'reading';
  if (kind === 'listening_practice') return 'listening';
  return 'grammar';
};
/** 会話・言い直しはJLPT科目ではない（別軸） */
const isPracticalStep = (kind: string) => kind === 'conversation_mission' || kind === 'restate';

export default function AdvShell(props: AdvShellProps) {
  const { lang, learner } = props;
  const nowISO = new Date().toISOString();
  const dateKey = dateKeyOf();

  const profile = useMemo(() => readAdvProfile(learner.settings), [learner.settings]);
  const prof0 = useCallback(() => profile, [profile]);
  const [view, setView] = useState<View>('home');
  const [pools, setPools] = useState<GrammarPools | null>(null);
  const [diagPools, setDiagPools] = useState<DiagnosisPools | null>(null);
  const [stageCt, setStageCt] = useState<StageContent | null>(null);
  const [quest, setQuest] = useState<AdvTodayQuest | null>(null);
  const [battle, setBattle] = useState<BattleCtx | null>(null);
  const [studyGrammarId, setStudyGrammarId] = useState<string | null>(null);
  const [grammarDoc, setGrammarDoc] = useState<N2GrammarDraft | null>(null);
  const [lastMastery, setLastMastery] = useState<MasteryStatus | null>(null);
  const [showMore, setShowMore] = useState(false);

  const save = useCallback((next: AdventureV2Profile) => {
    props.onSaveSettings(writeAdvProfile(learner.settings, next, new Date().toISOString()));
  }, [learner.settings, props]);

  const doneSteps = useMemo(() => {
    const ts = profile?.todaySteps;
    return new Set(ts && ts.dateKey === dateKey ? ts.done : []);
  }, [profile?.todaySteps, dateKey]);
  const withStepDone = useCallback((p: AdventureV2Profile, i: number): AdventureV2Profile => {
    const done = p.todaySteps && p.todaySteps.dateKey === dateKey ? p.todaySteps.done : [];
    return done.includes(i) ? p : { ...p, todaySteps: { dateKey, done: [...done, i] } };
  }, [dateKey]);
  const markStep = useCallback((i: number) => {
    if (!profile || doneSteps.has(i)) return;
    save(withStepDone(profile, i));
  }, [profile, doneSteps, save, withStepDone]);

  /** 読解・聴解の結果を mastery台帳へ skill evidence つきで記録する（準備度へ反映される） */
  const recordSkillResult = useCallback((
    p: AdventureV2Profile, skill: 'reading' | 'listening',
    r: { correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number },
    stepIndex: number,
  ) => {
    const targetId = `${skill}-${prof0()?.targetJlpt ?? 'N2'}`.toLowerCase();
    const attempt: AdvMasteryAttempt = {
      dateKey,
      scorePct: r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100),
      unseenRatio: 1,
      questionKeys: r.keys,
      tier: 'normal',
      timed: false,
      completedAt: new Date().toISOString(),
      skills: [skill],
      bySkill: { [skill]: { correct: r.correct, total: r.total, unseen: r.total } },
    };
    const ledger = recordAttempt(p.mastery, targetId, attempt);
    save(withStepDone({ ...p, mastery: ledger }, stepIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, save, withStepDone]);


  const needsOnboarding = !profile || !profile.goalType || !profile.diagnosis || !profile.route;
  useEffect(() => {
    if (!needsOnboarding || diagPools) return;
    void buildDiagnosisPools().then(setDiagPools);
  }, [needsOnboarding, diagPools]);

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
      const daysToExam = profile.examDateISO
        ? Math.max(0, Math.ceil((new Date(profile.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000))
        : null;
      // 試験技能の状況（読解・聴解を毎日ではなく弱点・試験日で配分する・§12）
      const ev = collectSkillEvidence(profile.mastery);
      const measured = (['charactersVocabulary', 'grammar', 'reading', 'listening'] as const)
        .filter((k) => ev[k].evidenceCount > 0);
      const weakestSkill = measured.length > 0
        ? measured.slice().sort((a, b) =>
          (ev[a].correct / Math.max(1, ev[a].evidenceCount)) - (ev[b].correct / Math.max(1, ev[b].evidenceCount)))[0]
        : null;
      const lvl: 'N2' | 'N3' = profile.targetJlpt === 'N3' ? 'N3' : 'N2';
      setQuest(generateTodayQuest({
        profile, route: profile.route!, dueReviewCount: props.reviewsDue, weakGrammarIds: weak,
        dateKey, nowISO, daysToExam,
        availability: {
          nextGrammarIds: ct.nextGrammarIds, nextUnitIds: ct.nextUnitIds,
          conversationTargets: ct.conversationTargets,
        },
        examSkills: {
          weakestSkill,
          readingEvidence: ev.reading.evidenceCount,
          listeningEvidence: ev.listening.evidenceCount,
          readingTargetIds: readingTargetIds(lvl),
          listeningTargetIds: listeningTargetIds(lvl),
        },
      }));
      trackAdv('today_quest_viewed', { goalType: profile.goalType ?? undefined, targetLevel: profile.targetJlpt ?? undefined, locale: lang });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOnboarding, profile?.route, profile?.mastery, props.reviewsDue, dateKey]);

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
            teacherId: o.teacherId,
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
  const level: 'N2' | 'N3' = prof.targetJlpt === 'N3' ? 'N3' : 'N2';
  // 案内の先生。未選択（null）は既定へ倒す＝既存learnerの見え方を変えない
  const teacher = resolveTeacher(prof.teacherId);
  const teacherLabel = teacherName(teacher, lang);
  const pickTeacher = (id: AdvTeacherId) => save({ ...prof, teacherId: id });

  // ── battle ──
  if (view === 'battle' && battle && pools) {
    const seen = seenQuestionKeys(prof.mastery);
    const wrong = new Set<string>();
    for (const at of Object.values(prof.mastery)) {
      const last = at?.[at.length - 1];
      if (last && last.scorePct < 80) for (const k of last.questionKeys) wrong.add(k);
    }
    return (
      <AdvBattleRunner
        key={`${battle.tier}:${battle.targetId}`}
        lang={lang} tier={battle.tier} targetId={battle.targetId} targetLabel={battle.targetLabel}
        targetIds={battle.targetIds} pool={pools.byItem} level={level}
        seenKeys={seen} recentWrongKeys={wrong}
        priorAttempts={prof.mastery[battle.targetId] ?? []}
        dateKey={dateKey} nowISO={nowISO}
        onFinish={(attempt: AdvMasteryAttempt, mastery: MasteryStatus) => {
          let ledger = recordAttempt(prof.mastery, battle.targetId, attempt);
          if (battle.tier === 'midboss' || battle.tier === 'rankboss') {
            ledger = recordAttempt(ledger, currentStageOf(route, masteredTargetIds(ledger, nowISO))?.stageId ?? battle.targetId, attempt);
          }
          if (mastery.state === 'mastered') trackAdv('delayed_mastery_reached', { locale: lang });
          else if (mastery.qualifyingDays.length >= 1 && attempt.scorePct >= 80) trackAdv('mastery_80_reached', { locale: lang });
          setLastMastery(mastery);
          const battleIdx = quest?.steps.findIndex((s) => s.kind === 'battle' || s.kind === 'weak_reinforce') ?? -1;
          const next = { ...prof, mastery: ledger };
          save(battleIdx >= 0 ? withStepDone(next, battleIdx) : next);
        }}
        onClose={() => { setBattle(null); setView('home'); }}
      />
    );
  }

  // ── 読解 ──
  if (view === 'reading') {
    const sets = readingSetsFor(level).slice(0, 3);
    const stepIdx = quest?.steps.findIndex((s) => s.kind === 'reading_short') ?? -1;
    return (
      <AdvReadingRunner
        lang={lang} sets={sets}
        onFinish={(r) => { if (stepIdx >= 0) recordSkillResult(prof, 'reading', r, stepIdx); }}
        onClose={() => setView('home')}
      />
    );
  }

  // ── 聴解 ──
  if (view === 'listening') {
    const sets = listeningSetsFor(level).slice(0, 3);
    const stepIdx = quest?.steps.findIndex((s) => s.kind === 'listening_practice') ?? -1;
    return (
      <AdvListeningRunner
        lang={lang} sets={sets}
        onFinish={(r) => { if (stepIdx >= 0) recordSkillResult(prof, 'listening', r, stepIdx); }}
        onClose={() => setView('home')}
      />
    );
  }

  // ── 先生の設定（あとから変更できる） ──
  if (view === 'teacher') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '案内の先生', '引导你的老师')} />
        <p className="mb-4 text-sm leading-relaxed text-gray-600">
          {tx(lang,
            '学習内容・出題・レベル判定は変わりません。話し方と見た目が変わります。いつでも変えられます。',
            '学习内容、出题和级别判定都不会改变，改变的是说话方式和外观。随时可以更改。')}
        </p>
        <div className="space-y-3" role="radiogroup" aria-label={tx(lang, '先生', '老师')}>
          {ALL_TEACHERS.map((tc) => {
            const on = teacher.id === tc.id;
            return (
              <button key={tc.id} type="button" role="radio" aria-checked={on}
                className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                  on ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'}`}
                onClick={() => pickTeacher(tc.id)}>
                <TeacherAvatar teacher={tc} size={56} lang={lang} labeled={false} className={`ring-2 ${tc.ringClass}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{tx(lang, tc.nameJa, tc.nameZh)}</span>
                  <span className="block text-sm text-gray-600">{tx(lang, tc.roleJa, tc.roleZh)}</span>
                  {!tc.voiceSwitchAvailable && (tc.voiceNoteJa || tc.voiceNoteZh) && (
                    <span className="mt-1 block text-xs text-amber-800">
                      {tx(lang, tc.voiceNoteJa ?? '', tc.voiceNoteZh ?? tc.voiceNoteJa ?? '')}
                    </span>
                  )}
                </span>
                {on && <span className="shrink-0 text-sm font-bold text-blue-700">{tx(lang, '選択中', '已选择')}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-gray-500">
          {tx(lang, '選んだ先生は、今日の冒険・AI会話・学習レポート・言い直し・復習・先生レッスン準備のすべてに表示されます。',
            '所选的老师会显示在今天的冒险、AI会话、学习报告、改口练习、复习和真人课准备的所有页面。')}
        </p>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setView('home')}>
          {tx(lang, 'ホームへもどる', '返回主页')}
        </button>
      </div>
    );
  }

  // ── ミニ模試（§9）──
  if (view === 'mock') {
    if (!pools) return <AdvLoading lang={lang} />;
    const rPool = readingPool(level);
    const lPool = listeningPool(level);
    const vPool = vocabPool(level);
    const merged = new Map(pools.byItem);
    for (const [k, v] of rPool) merged.set(k, v);
    for (const [k, v] of lPool) merged.set(k, v);
    for (const [k, v] of vPool) merged.set(k, v);
    let vocabCount = 0; let grammarCount = 0;
    for (const qs of [...pools.byItem.values(), ...vPool.values()]) {
      for (const q of qs) {
        if (q.skill === 'charactersVocabulary') vocabCount += 1;
        else if (q.skill === 'grammar') grammarCount += 1;
      }
    }
    const readingCount = [...rPool.values()].reduce((n, v) => n + v.length, 0);
    const listeningCount = [...lPool.values()].reduce((n, v) => n + v.length, 0);
    const spec = buildMockSpec(level, { vocabCount, grammarCount, readingCount, listeningCount });
    return (
      <AdvMockRunner
        lang={lang} spec={spec} pools={merged}
        seenKeys={seenQuestionKeys(prof.mastery)}
        savedState={prof.mockSession}
        onPersist={(s: MockSessionState | null) => save({ ...prof, mockSession: s })}
        onFinish={(r: MockResult) => {
          const completedAt = new Date().toISOString();
          const seen = seenQuestionKeys(prof.mastery);
          // 模試は timed evidence と skill別evidenceを同時に台帳へ入れる（準備度へ反映）
          const attempt = toMockAttempt(r, dateKey, seen, completedAt) as unknown as AdvMasteryAttempt;
          const ledger = recordAttempt(prof.mastery, `mock-${level.toLowerCase()}`, attempt);
          save({
            ...prof,
            mastery: ledger,
            mockSession: null,
            mockLog: [...prof.mockLog, toMockLogEntry(r, dateKey, completedAt)].slice(-30),
          });
          for (const s of r.skills) trackAdv('readiness_skill_updated', { locale: lang, skillType: s as ExamSkill });
        }}
        onClose={() => setView('home')}
      />
    );
  }

  // ── 言い直し（素材0件でも必ず進める・§14）──
  if (view === 'restate') {
    const wrongExpressions = Object.entries(prof.mastery)
      .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-')) && at && at[at.length - 1]?.scorePct < 80)
      .slice(0, 3)
      .map(([id]) => ({ expression: id, meaningJa: tx(lang, 'バトルで間違えた文法', '战斗中答错的语法') }));
    const material = pickRestateMaterial({
      conversationCorrection: null,
      battleMistakes: wrongExpressions,
      targetExpressions: quest?.targetExpressions ?? [],
      usedExpressions: [],
    });
    const stepIdx = quest?.steps.findIndex((s) => s.kind === 'restate') ?? -1;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '言い直し', '改口练习')} teacherLang={lang} />
        <div className={card}>
          <p className="text-sm font-semibold text-gray-900">{tx(lang, material.titleJa, material.titleZh)}</p>
          {material.beforeJa && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-gray-900">✕ {material.beforeJa}</p>
          )}
          {material.afterJa && (
            <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-sm text-gray-900">◯ {material.afterJa}</p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            {tx(lang, material.instructionJa, material.instructionZh)}
          </p>
        </div>
        <button type="button" className={`${primaryBtn} mt-4`}
          onClick={() => { if (stepIdx >= 0) markStep(stepIdx); setView('home'); }}>
          {material.source === 'none'
            ? tx(lang, '次に進む', '继续')
            : tx(lang, '言えた（次に進む）', '说出来了（继续）')}
        </button>
      </div>
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

  // ── map（縦型roadmap・§9） ──
  if (view === 'map') {
    const mastered = masteredTargetIds(prof.mastery, nowISO);
    const cur = currentStageOf(route, mastered);
    const curIdx = cur ? route.stages.findIndex((s) => s.stageId === cur.stageId) : route.stages.length;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={term('route', lang)} />
        <div className={`${card} mb-4`}>
          <p className="text-xs text-gray-500">{term('destination', lang)}</p>
          <p className="font-bold text-blue-900">{tx(lang, route.destinationLabelJa, route.destinationLabelZh)}</p>
          <p className="mt-1 text-xs text-gray-600">{term('masteryRate', lang)} {routeProgressPct(route, mastered)}%</p>
        </div>
        <ol className="relative border-l-2 border-gray-200 pl-5">
          {route.stages.map((s, i) => {
            const st = computeMastery(prof.mastery[s.stageId], nowISO);
            const done = mastered.has(s.stageId);
            const isCur = cur?.stageId === s.stageId;
            const isNext = i === curIdx + 1;
            const isBoss = s.kind === 'mock_boss';
            // 総合模試は技能が揃うまで「準備できません」（§9・存在するふりをしない）
            const bossNotReady = isBoss && !done;
            const stateLabel = done ? term('cleared', lang)
              : isCur ? term('currentLocation', lang)
              : isNext ? term('recommended', lang)
              : bossNotReady ? term('notReady', lang)
              : term('viewable', lang);
            return (
              <li key={s.stageId} className="relative mb-3">
                <span aria-hidden
                  className={`absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-white ${
                    done ? 'bg-emerald-500' : isCur ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-gray-300'}`} />
                <div className={`rounded-xl border p-3 ${isCur ? 'border-blue-500 bg-blue-50' : done ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-white'}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{stateLabel}</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">{tx(lang, s.titleJa, s.titleZh)}</p>
                  <p className="text-xs text-gray-600">{tx(lang, s.purposeJa, s.purposeZh)}</p>
                  {isCur && (
                    <>
                      <p className="mt-1 text-xs text-blue-800">{tx(lang, st.nextJa, st.nextZh)}</p>
                      <button type="button" className={`${primaryBtn} mt-2`} onClick={() => { setView('home'); }}>
                        {term('continueHere', lang)}
                      </button>
                    </>
                  )}
                  {!isCur && (
                    <button type="button"
                      className="mt-2 min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700"
                      onClick={() => (isBoss ? setView('mock') : openStageDetail(s))}>
                      {isBoss ? tx(lang, '模試の内容を見る', '查看模拟考内容') : term('viewContents', lang)}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-gray-500">
          {tx(lang, '先のエリアもいつでも見られます。ロックはありません。', '前面的区域随时可以查看，没有锁定。')}
        </p>
      </div>
    );
  }

  // ── readiness（技能別・§9） ──
  if (view === 'readiness') {
    const r = computeReadiness(prof.targetJlpt ?? 'N2', prof.skills, prof.mastery, prof.mockLog);
    const gateRows: { key: keyof typeof r.overallGate; ja: string; zh: string }[] = [
      { key: 'languageKnowledgeEvidence', ja: '言語知識（文字・語彙・文法）のデータ', zh: '语言知识（文字・词汇・语法）数据' },
      { key: 'readingEvidence', ja: '読解のデータ', zh: '阅读数据' },
      { key: 'listeningEvidence', ja: '聴解のデータ', zh: '听力数据' },
      { key: 'timedEvidence', ja: '制限時間つきの記録', zh: '限时记录' },
      { key: 'unseenEvidence', ja: '初めて見る問題での記録', zh: '首次见到的题的记录' },
      { key: 'delayedEvidence', ja: '7日後の測り直し', zh: '7天后的复测' },
      { key: 'mockCount', ja: `ミニ模試 ${r.mockCount}/3回`, zh: `迷你模拟考 ${r.mockCount}/3次` },
    ];
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={`${prof.targetJlpt ?? 'N2'}${term('readiness', lang)}`}
          teacherLang={lang} />
        <div className={`${card} mb-3 bg-gray-50`}>
          <p className="text-xs font-semibold text-gray-700">{tx(lang, '本試験の構成', '本考试的构成')}</p>
          <ul className="mt-1 space-y-0.5">
            {r.examParts.map((p) => (
              <li key={p.labelJa} className="text-xs text-gray-600">
                ・{tx(lang, p.labelJa, p.labelZh)}（{p.minutes}{tx(lang, '分', '分钟')}）
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          {r.rows.map((row) => (
            <div key={row.key} className={card}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {tx(lang, row.labelJa, row.labelZh)}
                    {row.sectionJa && (
                      <span className="ml-1 text-[11px] font-normal text-gray-400">
                        （{tx(lang, row.sectionJa, row.sectionZh ?? row.sectionJa)}）
                      </span>
                    )}
                    {row.provisional && row.pct !== null && <span className="ml-1 text-xs text-amber-700">（{term('provisional', lang)}）</span>}
                  </p>
                  {(row.noteJa || row.noteZh) && <p className="text-xs text-gray-500">{tx(lang, row.noteJa ?? '', row.noteZh ?? '')}</p>}
                  <p className="mt-1 text-[11px] text-gray-400">
                    {tx(lang, '出題', '出题')}{row.evidence.evidenceCount}・{tx(lang, '未出', '未见过')}{row.evidence.unseenQuestionCount}・
                    {tx(lang, '7日後', '7天后')}{row.evidence.delayedEvidenceCount}・{tx(lang, '時間つき', '限时')}{row.evidence.timedEvidenceCount}
                  </p>
                </div>
                <p className={`shrink-0 text-xl font-bold ${row.pct === null ? 'text-gray-400' : 'text-blue-800'}`}>
                  {row.pct === null ? term('undetermined', lang) : `${row.pct}%`}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className={`${card} mt-4 bg-blue-50`}>
          <p className="text-sm font-bold text-gray-900">
            {tx(lang, '総合', '综合')}：{r.overallPct === null ? term('undetermined', lang) : `${r.overallPct}%`}
          </p>
          {r.overallPct === null && (
            <ul className="mt-1 space-y-0.5">
              {(lang === 'zh' ? r.overallBlockersZh : r.overallBlockersJa).slice(0, 3).map((b) => (
                <li key={b} className="text-xs text-gray-700">・{b}</li>
              ))}
            </ul>
          )}
          {r.topIssueJa && <p className="mt-1 text-sm text-gray-700">{tx(lang, r.topIssueJa, r.topIssueZh ?? '')}</p>}
          <p className="mt-2 text-xs leading-relaxed text-gray-600">{tx(lang, r.summaryJa, r.summaryZh)}</p>
        </div>

        {/* 総合を出すための条件（§10）。何が足りないかを隠さない */}
        <div className={`${card} mt-3`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, '総合準備度を出す条件', '给出综合准备度的条件')}</p>
          <ul className="mt-1 space-y-0.5">
            {gateRows.map((g) => (
              <li key={g.key} className="flex items-center gap-2 text-xs">
                <span aria-hidden className={r.overallGate[g.key] ? 'text-emerald-600' : 'text-gray-300'}>
                  {r.overallGate[g.key] ? '✓' : '○'}
                </span>
                <span className={r.overallGate[g.key] ? 'text-gray-700' : 'text-gray-500'}>{tx(lang, g.ja, g.zh)}</span>
              </li>
            ))}
          </ul>
          {!r.overallGate.mockCount && (
            <button type="button" className={`${primaryBtn} mt-3`} onClick={() => setView('mock')}>
              {tx(lang, 'ミニ模試を受ける', '参加迷你模拟考')}
            </button>
          )}
        </div>
        <div className={`${card} mt-3`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, '会話・実践力（JLPTとは別）', '会话・实践力（与JLPT分开）')}</p>
          {r.practical.map((p) => (
            <div key={p.key} className="mt-1 flex items-center justify-between">
              <span className="text-sm text-gray-700">{tx(lang, p.labelJa, p.labelZh)}</span>
              <span className={`text-sm font-bold ${p.pct === null ? 'text-gray-400' : 'text-emerald-700'}`}>
                {p.pct === null ? term('undetermined', lang) : `${p.pct}%`}
              </span>
            </div>
          ))}
          <p className="mt-1 text-xs text-gray-500">{tx(lang, r.practical[0].noteJa, r.practical[0].noteZh)}</p>
        </div>
      </div>
    );
  }

  // ── 人間レッスン準備 ──
  if (view === 'prep') {
    const s = buildLessonPrepSummary(prof, nowISO);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={term('seeTeacherPrep', lang)} teacherLang={lang} />
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

  // ── complete ──
  if (view === 'complete' && quest) {
    const mastered = masteredTargetIds(prof.mastery, nowISO);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="flex items-center gap-3">
          <TeacherAvatar size={44} expression="smile" lang={lang} className={`shrink-0 ring-2 ${teacher.ringClass}`} />
          <h2 className="text-lg font-bold text-gray-900">{tx(lang, '今日の冒険 おつかれさま！', '今天的冒险辛苦了！')}</h2>
        </div>
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
          <p className="text-sm font-semibold text-gray-900">{term('masteryRate', lang)}</p>
          <p className="mt-1 text-sm text-gray-700">{routeProgressPct(route, mastered)}%</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{tx(lang, '次の復習', '下次复习')}</p>
          <p className="mt-1 text-sm text-gray-700">
            {props.reviewsDue > 0 ? tx(lang, `残り${props.reviewsDue}件`, `还剩${props.reviewsDue}项`) : tx(lang, '明日・約3分', '明天・约3分钟')}
          </p>
        </div>
        <p className="mt-3 text-center text-xs text-gray-500">XP +{doneSteps.size * 10}</p>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setView('home')}>
          {tx(lang, 'ホームへ', '回到主页')}
        </button>
      </div>
    );
  }

  // ── home（1画面1決断） ──
  const mastered = masteredTargetIds(prof.mastery, nowISO);
  const stage = currentStageOf(route, mastered);
  const daysToExam = prof.examDateISO
    ? Math.max(0, Math.ceil((new Date(prof.examDateISO).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000)) : null;
  const nextStepIdx = quest ? quest.steps.findIndex((_, i) => !doneSteps.has(i)) : -1;
  const allDone = quest !== null && nextStepIdx === -1;
  const nextStep = quest && nextStepIdx >= 0 ? quest.steps[nextStepIdx] : null;
  const trainingSkill = nextStep ? skillOfStep(nextStep.kind) : 'grammar';

  const runStep = (i: number) => {
    if (!quest) return;
    const s = quest.steps[i];
    trackAdv('today_quest_started', { goalType: prof.goalType ?? undefined, routeStage: stage?.kind, durationBucket: String(prof.dailyMinutes ?? 15) as '5' | '15' | '30', locale: lang });
    if (s.kind === 'review_due') { markStep(i); props.onOpenReview(); return; }
    if (s.kind === 'conversation_mission') { if (props.conversationAvailable) { trackAdv('conversation_started', { locale: lang }); props.onStartConversation(); } return; }
    if (s.kind === 'restate') { setView('restate'); return; }
    if (s.kind === 'reading_short') { setView('reading'); return; }
    if (s.kind === 'listening_practice') { setView('listening'); return; }
    if (s.kind === 'vocab_new' && s.refIds[0]?.startsWith('n3u-')) {
      markStep(i);
      props.onOpenArea(AREA_BY_UNIT[s.refIds[0]] ?? 'area01-minato');
      return;
    }
    if (s.kind === 'grammar_new' && s.refIds[0]) { setStudyGrammarId(s.refIds[0]); setView('grammar'); return; }
    if (s.kind === 'weak_reinforce' && s.refIds.length > 0) {
      setBattle({ tier: 'normal', targetId: s.refIds[0], targetLabel: tx(lang, '弱点補強', '弱点补强'), targetIds: s.refIds });
      setView('battle'); return;
    }
    if (s.kind === 'battle') {
      const targets = s.refIds.length > 0 ? s.refIds : (stageCt?.battleTargetIds ?? []);
      setBattle({ tier: (s.tier ?? 'normal'), targetId: targets[0] ?? (stage?.stageId ?? 'stage'), targetLabel: stage ? tx(lang, stage.titleJa, stage.titleZh) : '', targetIds: targets });
      setView('battle'); return;
    }
  };

  /** 第一CTAの文言は「次の1動作」を名指しする */
  const ctaLabel = (): string => {
    if (!nextStep) return term('startToday', lang);
    if (doneSteps.size === 0) {
      return nextStep.kind === 'review_due'
        ? tx(lang, 'まず復習から始める', '先从复习开始')
        : tx(lang, `まず「${nextStep.titleJa}」から始める`, `先从「${nextStep.titleZh}」开始`);
    }
    return term('continueNext', lang);
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={term('todayAdventure', lang)}>
      {/* 1. 目標と残日数 */}
      <p className="text-sm font-semibold text-gray-600">
        {prof.goalType === 'conversation'
          ? tx(lang, '会話力を上げる', '提升会话能力')
          : daysToExam !== null
            ? tx(lang, `${prof.targetJlpt ?? ''}合格まであと${daysToExam}日`, `距离${prof.targetJlpt ?? ''}合格还有${daysToExam}天`)
            : tx(lang, `${prof.targetJlpt ?? ''}合格をめざす`, `目标：${prof.targetJlpt ?? ''}合格`)}
      </p>

      {/* 案内の先生の一文（次の行動を言う）。7画面すべてで同じ先生に揃える */}
      <div className="mt-2 mb-4 flex items-center gap-3">
        <TeacherAvatar size={48} expression="smile" lang={lang}
          className={`shrink-0 ring-2 ${teacher.ringClass}`} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500">{teacherLabel}</p>
          <p className="text-sm leading-snug text-gray-700">
            {quest
              ? tx(lang,
                `今日は${quest.estimatedMinutes}分。${nextStep ? `まず「${nextStep.titleJa}」から始めましょう。` : '今日のぶんは終わりました！'}`,
                `今天${quest.estimatedMinutes}分钟。${nextStep ? `先从「${nextStep.titleZh}」开始吧。` : '今天的份量已经完成了！'}`)
              : tx(lang, teacher.greetJa, teacher.greetZh)}
          </p>
        </div>
      </div>

      {/* 中断したミニ模試があれば、他の何より先に再開させる（§9 reload recovery） */}
      {prof.mockSession && (
        <div className={`${card} mb-4 border-amber-300 bg-amber-50`} role="status">
          <p className="text-sm font-semibold text-gray-900">
            {tx(lang, 'ミニ模試が途中です', '迷你模拟考进行到一半')}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {tx(lang, '同じ問題・同じ残り時間から再開できます。', '可以从相同的题目和剩余时间继续。')}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white"
              onClick={() => setView('mock')}>
              {tx(lang, '模試を再開する', '继续模拟考')}
            </button>
            <button type="button" className="min-h-[44px] rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm text-amber-900"
              onClick={() => save({ ...prof, mockSession: null })}>
              {tx(lang, '破棄', '放弃')}
            </button>
          </div>
        </div>
      )}

      {!quest && <AdvLoading lang={lang} inline />}

      {quest && (
        <div className={`${card} mb-4 border-blue-200`}>
          <div className="flex items-center gap-2">
            <TeacherAvatar size={28} lang={lang} labeled={false} className="shrink-0" />
            <h1 className="text-lg font-bold text-gray-900">{term('todayAdventure', lang)}</h1>
          </div>
          <p className="mt-0.5 text-sm text-gray-600">
            {tx(lang, `今日はこの${quest.steps.length}つだけ・約${quest.estimatedMinutes}分`,
              `今天只做这${quest.steps.length}项・约${quest.estimatedMinutes}分钟`)}
          </p>
          {/* 今鍛えている試験科目（§8） */}
          {!isPracticalStep(nextStep?.kind ?? '') && (
            <p className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
              {term('nowTraining', lang)}：{nowTrainingLabel(trainingSkill, lang)}
            </p>
          )}

          {/* 2. 今日行う全step（番号は必ず連番） */}
          <ol className="mt-3 space-y-1.5">
            {quest.steps.map((s, i) => {
              const done = doneSteps.has(i);
              const isNext = i === nextStepIdx;
              return (
                <li key={s.titleJa + i}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${isNext ? 'bg-blue-50 font-semibold' : ''}`}>
                  <span className={`w-5 shrink-0 text-center text-sm ${done ? 'text-emerald-600' : 'text-gray-400'}`} aria-hidden>
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={`flex-1 text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {tx(lang, s.titleJa, s.titleZh)}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">{tx(lang, `約${s.estMinutes}分`, `约${s.estMinutes}分钟`)}</span>
                </li>
              );
            })}
          </ol>

          {/* 3. 今日のゴール */}
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs font-semibold text-gray-600">{term('todayGoal', lang)}</p>
            <p className="text-sm text-gray-800">{tx(lang, quest.successConditionJa, quest.successConditionZh)}</p>
          </div>

          {/* 4. 主要CTAは常に一つ＝次の1動作 */}
          {!allDone && nextStepIdx >= 0 && (
            <button type="button" className={`${primaryBtn} mt-4`} onClick={() => runStep(nextStepIdx)}>
              {ctaLabel()}
            </button>
          )}
          {allDone && (
            <button type="button" className={`${primaryBtn} mt-4 bg-emerald-600`}
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
        </div>
      )}

      {/* 5. 二次メニューは折りたたみ（第一CTAより強い表現を使わない） */}
      <div className="mt-2">
        <button type="button" aria-expanded={showMore}
          className="flex w-full min-h-[44px] items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-600"
          onClick={() => setShowMore((v) => !v)}>
          <span>{term('otherLearning', lang)}</span>
          <span aria-hidden>{showMore ? '▲' : '▼'}</span>
        </button>
        {showMore && (
          <div className="mt-2 space-y-1.5">
            <SubLink lang={lang} label={term('seeRoute', lang)} onClick={() => setView('map')} />
            <SubLink lang={lang} label={term('seeReadiness', lang)} onClick={() => { trackAdv('report_viewed', { locale: lang }); setView('readiness'); }} />
            <SubLink lang={lang} label={term('seeReviewList', lang)} badge={props.reviewsDue} onClick={props.onOpenReview} />
            <SubLink lang={lang}
              label={tx(lang, `${level}ミニ模試（時間つき）`, `${level}迷你模拟考（限时）`)}
              onClick={() => setView('mock')} />
            <SubLink lang={lang}
              label={tx(lang, `案内の先生を変える（いまは${teacherLabel}）`, `更换引导老师（当前：${teacherLabel}）`)}
              onClick={() => setView('teacher')} />
            <SubLink lang={lang} label={term('seeTeacherPrep', lang)} onClick={() => { trackAdv('human_lesson_summary_viewed', { locale: lang }); setView('prep'); }} />
            <p className="px-1 pt-1 text-[11px] text-gray-400">
              {tx(lang, `${term('masteryRate', 'ja')}＝単元ごとの定着／${term('readiness', 'ja')}＝試験全体の技能評価`,
                `${term('masteryRate', 'zh')}＝各单元的巩固度／${term('readiness', 'zh')}＝考试整体的能力评估`)}
            </p>
          </div>
        )}
      </div>

      <button type="button" className="mt-6 w-full min-h-[44px] text-xs text-gray-400 underline" onClick={props.onExitV2}>
        {tx(lang, '従来のホームに戻す（データは残ります）', '返回原来的主页（数据会保留）')}
      </button>
    </div>
  );

  function openStageDetail(s: AdvRouteStage) {
    // 先の地点は「内容を見る」= 対象と到達条件の確認（強敵バトルへは飛ばさない）
    void (async () => {
      const mastered2 = masteredTargetIds(prof.mastery, nowISO);
      const ct = await stageContent(s, mastered2);
      const label = tx(lang, s.titleJa, s.titleZh);
      const count = ct.battleTargetIds.length;
      const scope = masteryScopeName([s.kind === 'n2_grammar' || s.kind === 'n3_grammar' ? 'grammar' : 'charactersVocabulary'], level, lang);
      window.alert(tx(lang,
        `${label}\n\n${s.purposeJa}\n\n攻略対象：${count}件\n到達条件：${s.clearConditionJa}\n評価：${scope}`,
        `${label}\n\n${s.purposeZh}\n\n攻略对象：${count}项\n达成条件：${s.clearConditionZh}\n评估：${scope}`));
    })();
  }
}

const AREA_BY_UNIT: Record<string, string> = Object.fromEntries(
  Object.entries(AREA_UNIT_MAP).flatMap(([area, units]) => units.map((u) => [u, area])),
);

function AdvLoading({ lang, inline }: { lang: L; inline?: boolean }) {
  return (
    <div className={inline ? 'py-8 text-center' : 'flex min-h-[40vh] items-center justify-center'} role="status">
      <p className="text-sm text-gray-500">{tx(lang, '冒険の準備をしています…', '正在准备冒险…')}</p>
    </div>
  );
}

function BackBar({ lang, onBack, title, teacherLang }: {
  lang: L; onBack: () => void; title: string;
  /** 指定すると案内の先生のアバターを出す（画面間で案内キャラクターを揃えるため） */
  teacherLang?: L;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button type="button" className="min-h-[44px] min-w-[44px] rounded-lg border border-gray-200 px-3" onClick={onBack} aria-label={tx(lang, 'もどる', '返回')}>←</button>
      {teacherLang && <TeacherAvatar size={32} lang={teacherLang} labeled={false} className="shrink-0" />}
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    </div>
  );
}

function SubLink({ lang, label, badge, onClick }: { lang: L; label: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button"
      className="flex w-full min-h-[44px] items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700"
      onClick={onClick}>
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-amber-500 px-2 text-xs font-bold text-white">{badge}</span>
      )}
      {(badge === undefined || badge === 0) && <span aria-hidden className="text-gray-300">›</span>}
      <span className="sr-only">{tx(lang, '開く', '打开')}</span>
    </button>
  );
}

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

  useEffect(() => { if (doc) onLearned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  if (!doc) return <AdvLoading lang={lang} />;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <BackBar lang={lang} onBack={onBack} title={doc.pattern} />
      <p className="mb-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {TERMS.nowTraining[lang]}：{nowTrainingLabel('grammar', lang)}
      </p>
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
        {doc.commonMistakesZh && <p className="mt-3 text-xs leading-relaxed text-amber-800">⚠️ {doc.commonMistakesZh}</p>}
        {doc.contrast && <p className="mt-2 text-xs leading-relaxed text-gray-600">{doc.contrast}</p>}
      </div>
      <button type="button" className={`${primaryBtn} mt-4`} onClick={onBattle}>
        {tx(lang, 'この文法でバトルに挑む', '用这个语法挑战战斗')}
      </button>
    </div>
  );
}

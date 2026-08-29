// RPG 章冒険パネル（旧: Chapter 1専用 → 2026-07-31 全章対応へ一般化）。
// 学習の進捗＝物語の進行。操作ゲームではない（移動は自動演出）。
// - 章データはchapterRegistryから受け取る（chapterIdプロップ。既定はChapter 1＝後方互換）
// - 文法ミッション（実在FoundationRule/Question・全6 unit対応）・復習Quest「再会」・
//   responsive 2カラム・Fog可視化・自動移動演出・aria-live。
// - 進捗は章ごとのsandboxキーのみ（通常learnerの学習記録には読み書きしない）
import { useEffect, useMemo, useState } from 'react';
import { CHAPTER1_ID, type Chapter1Quest, type GrammarMission } from '../../../lib/aiLesson/course/rpg/chapter1Data';
import { chapterById } from '../../../lib/aiLesson/course/rpg/chapterRegistry';
import {
  loadAdventureState, startQuest, recordLearningResult, completeQuest,
  deriveLocationFog, reviewNeededItems, resetAdventureState,
  advanceSimulatedTime, recordReviewResult, claimReviewReward,
  type AdventureState, type FogLevel,
} from '../../../lib/aiLesson/course/rpg/adventureState';
import { allVocabularyItems } from '../../../lib/aiLesson/course/foundationVocabBank';
import { buildAssessQuestions } from '../../../lib/aiLesson/course/quality/assessQuestionEngine';
import { cognateProfileFor } from '../../../lib/aiLesson/course/quality/cognateProfile';
import { shuffledChoicesSeeded } from '../../../lib/aiLesson/course/foundationGrade';
import type { FoundationItem, FoundationRule, FoundationQuestion } from '../../../lib/aiLesson/course/foundationTypes';
import { UNIT1_RULES, UNIT1_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit1';
import { UNIT2_RULES, UNIT2_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit2';
import { UNIT3_RULES, UNIT3_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit3';
import { UNIT4_RULES, UNIT4_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit4';
import { UNIT5_RULES, UNIT5_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit5';
import { UNIT6_RULES, UNIT6_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit6';
import {
  HeroSprite, ShokoSprite, NpcHanaSprite, NpcGenSprite, LanternMarker,
  NpcSilhouette, TownMapBase, LocationFogOverlay, type SpritePose,
} from './pixelAssets';
import type { AiCourseDict } from '../../../locales/aiCourse';

type Screen =
  | { kind: 'map' }
  | { kind: 'questIntro'; questId: string }
  | { kind: 'learning'; questId: string; itemIndex: number; phase: 'teach' | 'assess'; qIndex: number; built: string[]; wrongOnce: boolean }
  | { kind: 'grammar'; questId: string; missionIndex: number; step: number; built: string[]; wrongOnce: boolean }
  | { kind: 'finale'; questId: string; stepIndex: number; wrongOnce: boolean }
  | { kind: 'questComplete'; questId: string; xpGained: number }
  | { kind: 'chapterComplete' }
  | { kind: 'reviewLetter' }
  | { kind: 'reviewCheck'; keys: string[]; index: number; built: string[]; wrongOnce: boolean }
  | { kind: 'reviewDone'; count: number };

interface Props {
  t: AiCourseDict;
  onBack: () => void;
  /** 開く章（chapterRegistryの実在ID）。未指定はChapter 1＝後方互換 */
  chapterId?: string;
  /**
   * 開発者ツール（時間送り・sandbox注記）。learner viewでは必ず false。
   * §6: learner画面に「試作」「sandbox」「検証用」等の開発表示を出さない。
   */
  devTools?: boolean;
}

type SpriteComp = (p: { className?: string; pose?: SpritePose; decorative?: boolean }) => React.ReactElement;
const NPC_SPRITE: Record<string, SpriteComp> = {
  'c1-npc-shoko': ShokoSprite, 'c1-npc-hana': NpcHanaSprite, 'c1-npc-gen': NpcGenSprite,
};
/** 章2以降の固有NPCは専用ドット絵ができるまで既存の汎用スプライトを役割で使い回す
 *（新規IPは作らない・human_review_candidate段階のvisual）。決定的: npcIdのハッシュで安定選択 */
const FALLBACK_SPRITES: SpriteComp[] = [NpcHanaSprite, NpcGenSprite, ShokoSprite];
const spriteFor = (npcId: string): SpriteComp => {
  if (NPC_SPRITE[npcId]) return NPC_SPRITE[npcId];
  let h = 0;
  for (const c of npcId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK_SPRITES[h % FALLBACK_SPRITES.length];
};

/** 場所→霧領域。全章とも4拠点（テストで固定）なので、拠点の並び順でslotを割り当てる */
const FOG_REGION_SLOTS: { x: number; y: number; w: number; h: number }[] = [
  { x: 0, y: 22, w: 13, h: 14 },
  { x: 12, y: 15, w: 15, h: 16 },
  { x: 24, y: 8, w: 12, h: 12 },
  { x: 35, y: 0, w: 13, h: 13 },
];

const fogLabelOf = (t: AiCourseDict): Record<FogLevel, string> => ({
  clear: t.ch1.fogClear, light_fog: t.ch1.fogLight, foggy: t.ch1.fogDeep, review_needed: t.ch1.fogReview,
});

const ALL_RULES: FoundationRule[] = [
  ...UNIT1_RULES, ...UNIT2_RULES, ...UNIT3_RULES, ...UNIT4_RULES, ...UNIT5_RULES, ...UNIT6_RULES,
];
const ALL_RULE_QUESTIONS: FoundationQuestion[] = [
  ...UNIT1_QUESTIONS, ...UNIT2_QUESTIONS, ...UNIT3_QUESTIONS, ...UNIT4_QUESTIONS, ...UNIT5_QUESTIONS, ...UNIT6_QUESTIONS,
];
const ruleById = new Map(ALL_RULES.map(r => [r.id, r]));
const questionById = new Map(ALL_RULE_QUESTIONS.map(q => [q.id, q]));

/** 産出用トークンの決定的シャッフル（乱数なし・元順と必ず異なる回転） */
const rotatedTokens = (tokens: string[]): string[] =>
  tokens.length < 2 ? tokens : [...tokens.slice(1), tokens[0]];

const initialNowMs = Date.now();
const clockNow = () => Date.now();

export const Chapter1AdventurePanel = ({ t, onBack, chapterId = CHAPTER1_ID, devTools = false }: Props) => {
  const zh = t.locale === 'zh';
  // 章定義（実在IDのみ・chapterIdに対して安定＝React Compilerがmemoを保存できる）
  const chapter = useMemo(() => chapterById(chapterId) ?? chapterById(CHAPTER1_ID)!, [chapterId]);
  const questInChapter = (questId: string): Chapter1Quest | undefined =>
    chapter.quests.find(q => q.questId === questId);
  const [state, setState] = useState<AdventureState>(
    () => loadAdventureState(initialNowMs, undefined, chapter.chapterId));
  const [screen, setScreen] = useState<Screen>({ kind: 'map' });
  const [simpleMode, setSimpleMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  });
  const [announcement, setAnnouncement] = useState('');
  const [heroPose, setHeroPose] = useState<SpritePose>('idle');
  // 歩行演出はeffectで自動停止（refのtimer管理はReact Compilerと相性が悪い）
  useEffect(() => {
    if (heroPose !== 'walk') return;
    const id = window.setTimeout(() => setHeroPose('idle'), 1400);
    return () => window.clearTimeout(id);
  }, [heroPose]);
  // 実時間＋sandboxシミュレーションoffset。renderではnowMs（state由来）を使い、handlerでnow()を呼ぶ
  const [realNowMs, setRealNowMs] = useState(initialNowMs);
  const now = () => { const t = clockNow(); setRealNowMs(t); return t + state.simulatedOffsetMs; };
  const nowMs = realNowMs + state.simulatedOffsetMs;

  const itemById = useMemo(() => new Map(allVocabularyItems().map(i => [i.id, i])), []);
  const chapterPool = useMemo(() => {
    const ids = chapter.quests.flatMap(q => q.learningItemIds);
    return ids.map(id => itemById.get(id)).filter((x): x is FoundationItem => !!x);
  }, [itemById, chapter]);

  /** 語ごとのassess問題（決定的生成・teach内容は含めない）。Chapter開始時に一括構築 */
  const assessByItem = useMemo(() => {
    const pool = allVocabularyItems();
    const m = new Map<string, ReturnType<typeof buildAssessQuestions>>();
    for (const it of chapterPool) m.set(it.id, buildAssessQuestions(it, pool, { introduced: false, max: 2 }));
    return m;
  }, [chapterPool]);
  const assessFor = (item: FoundationItem) =>
    assessByItem.get(item.id) ?? buildAssessQuestions(item, allVocabularyItems(), { introduced: false, max: 2 });

  const nextQuest: Chapter1Quest | null = state.chapter.currentQuestId
    ? questInChapter(state.chapter.currentQuestId) ?? null : null;
  const reviewKeys = reviewNeededItems(state, nowMs);
  const chapterDone = state.chapter.completedAtMs !== null;

  const announce = (msg: string) => setAnnouncement(msg);

  /** Quest完了後の帰還: 主人公が歩き、霧が変わる（Reduced Motionでは即時） */
  const returnToMap = (walkMsg?: string) => {
    setScreen({ kind: 'map' });
    if (walkMsg) announce(walkMsg);
    if (!reducedMotion) setHeroPose('walk'); // 停止はheroPose effectが受け持つ
  };

  const beginQuest = (q: Chapter1Quest) => {
    setState(startQuest(state, q.questId, now()));
    setScreen(simpleMode ? { kind: 'learning', questId: q.questId, itemIndex: 0, phase: 'teach', qIndex: 0, built: [], wrongOnce: false }
      : { kind: 'questIntro', questId: q.questId });
  };

  const finishQuest = (quest: Chapter1Quest, st: AdventureState, finaleCleared = false) => {
    const done = completeQuest(st, quest.questId, now(), finaleCleared);
    setState(done);
    setScreen({ kind: 'questComplete', questId: quest.questId, xpGained: quest.adventureXpReward });
    const opened = [
      ...quest.unlocks.locationIds.map(id => { const l = chapter.locations.find(x => x.locationId === id); return zh ? l?.nameZh : l?.nameJa; }),
      ...quest.unlocks.npcIds.map(id => { const n = chapter.npcs.find(x => x.npcId === id); return zh ? n?.nameZh : n?.nameJa; }),
    ].filter(Boolean);
    announce(t.ch1.announceQuestDone(quest.order, opened.join('・')));
  };

  /** 語彙ステップ完了後の次段階（文法→章末会話→完了） */
  const afterItems = (quest: Chapter1Quest, st: AdventureState) => {
    if (quest.grammarRequirements?.length) {
      setScreen({ kind: 'grammar', questId: quest.questId, missionIndex: 0, step: 0, built: [], wrongOnce: false });
    } else if (quest.isChapterFinale) {
      setScreen({ kind: 'finale', questId: quest.questId, stepIndex: 0, wrongOnce: false });
    } else {
      finishQuest(quest, st);
    }
  };

  /** assess問題への解答。正解した問題数がその語の全問に達したら次の語へ */
  const answerAssess = (s: Extract<Screen, { kind: 'learning' }>, item: FoundationItem, correct: boolean) => {
    const quest = questInChapter(s.questId)!;
    const qs = assessFor(item);
    if (!correct) {
      // 誤答は記録するが要件は充足しない（同じ問題をもう一度）
      setState(recordLearningResult(state, s.questId, item.id, false, now()));
      setScreen({ ...s, wrongOnce: true });
      return;
    }
    const nextQ = s.qIndex + 1;
    if (nextQ < qs.length) { setScreen({ ...s, qIndex: nextQ, built: [], wrongOnce: false }); return; }
    // その語の全assessに正解 → 要件充足として記録
    const next = recordLearningResult(state, s.questId, item.id, true, now());
    setState(next);
    const idx = s.itemIndex + 1;
    if (idx < quest.learningItemIds.length) {
      setScreen({ kind: 'learning', questId: s.questId, itemIndex: idx, phase: 'teach', qIndex: 0, built: [], wrongOnce: false });
    } else {
      afterItems(quest, next);
    }
  };

  /** 文法ミッション: step 0=ルール理解 / 1..n=確認問題 / n+1=産出（並べ替え） */
  const grammarMission = (s: Extract<Screen, { kind: 'grammar' }>): GrammarMission =>
    questInChapter(s.questId)!.grammarRequirements![s.missionIndex];

  const answerGrammarQuestion = (s: Extract<Screen, { kind: 'grammar' }>, q: FoundationQuestion, choiceIndex: number) => {
    if (choiceIndex !== q.answerIndex) { setScreen({ ...s, wrongOnce: true }); return; }
    setScreen({ ...s, step: s.step + 1, wrongOnce: false, built: [] });
  };

  const pushToken = (s: Extract<Screen, { kind: 'grammar' }>, token: string) => {
    const m = grammarMission(s);
    const built = [...s.built, token];
    if (built.length < m.production.tokens.length) { setScreen({ ...s, built }); return; }
    const ok = built.join('') === m.production.tokens.join('');
    if (!ok) { setScreen({ ...s, built: [], wrongOnce: true }); return; }
    const quest = questInChapter(s.questId)!;
    const next = recordLearningResult(state, s.questId, `rule:${m.ruleId}`, true, now());
    setState(next);
    const nextMission = s.missionIndex + 1;
    if (quest.grammarRequirements && nextMission < quest.grammarRequirements.length) {
      setScreen({ kind: 'grammar', questId: s.questId, missionIndex: nextMission, step: 0, built: [], wrongOnce: false });
    } else if (quest.isChapterFinale) {
      setScreen({ kind: 'finale', questId: s.questId, stepIndex: 0, wrongOnce: false });
    } else {
      finishQuest(quest, next);
    }
  };

  const answerFinale = (questId: string, stepIndex: number, choice: string) => {
    const step = chapter.finaleSteps[stepIndex];
    if (choice !== step.correctJa) { setScreen(s => s.kind === 'finale' ? { ...s, wrongOnce: true } : s); return; }
    if (stepIndex + 1 < chapter.finaleSteps.length) {
      setScreen({ kind: 'finale', questId, stepIndex: stepIndex + 1, wrongOnce: false });
      return;
    }
    finishQuest(questInChapter(questId)!, state, true);
  };

  /** 復習「再会」: 学習済みの語を別文脈（例文の中）で再確認。ruleは確認問題を再出題 */
  const answerReview = (s: Extract<Screen, { kind: 'reviewCheck' }>, correct: boolean) => {
    const key = s.keys[s.index];
    const next = recordReviewResult(state, key, correct, now());
    setState(next);
    if (!correct) { setScreen({ ...s, wrongOnce: true }); return; }
    if (s.index + 1 < s.keys.length) {
      setScreen({ kind: 'reviewCheck', keys: s.keys, index: s.index + 1, built: [], wrongOnce: false });
    } else {
      const rewarded = claimReviewReward(next, chapter.reviewReunion.adventureXpReward, now());
      setState(rewarded);
      setScreen({ kind: 'reviewDone', count: s.keys.length });
      announce(t.ch1.reviewCleared);
    }
  };

  /** 並べ替え（産出）解答UI。トークンを順に押して文を作る */
  const OrderAnswer = ({ aq, built, onPush, onReset }: {
    aq: { choices: string[]; orderAnswer?: string[] }; built: string[];
    onPush: (t: string) => void; onReset: () => void;
  }) => (
    <div>
      <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
        {built.length ? built.join('') : <span className="text-gray-300">{t.ch1.orderHere}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {aq.choices.map((tok, i) => {
          const target = aq.orderAnswer ?? aq.choices;
          const used = built.filter(b => b === tok).length >= target.filter(t => t === tok).length;
          return (
            <button key={`${tok}-${i}`} type="button" disabled={used} onClick={() => onPush(tok)}
              className={`min-h-11 px-3 py-2 text-sm rounded-xl border touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${used ? 'bg-gray-100 text-gray-300 border-gray-100' : 'action-raised action-choice bg-white border-indigo-200 hover:border-indigo-400'}`}>
              {tok}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onReset} className="transition-colors active:bg-gray-100 rounded min-h-11 px-3 text-xs text-gray-400 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.orderReset}</button>
    </div>
  );

  const heroLoc = useMemo(() => {
    const site = nextQuest?.siteLocationId ?? chapter.quests[chapter.quests.length - 1].siteLocationId;
    return chapter.locations.find(l => l.locationId === site) ?? chapter.locations[0];
  }, [nextQuest, chapter]);
  const transitionStyle = reducedMotion ? undefined : { transition: 'left 1.2s ease, top 1.2s ease' };

  const currentLocationName = zh ? heroLoc.nameZh : heroLoc.nameJa;
  const nextDestName = nextQuest
    ? (l => (zh ? l?.nameZh : l?.nameJa) ?? '')(chapter.locations.find(l => l.locationId === nextQuest.siteLocationId)) : '';

  return (
    <div className="max-w-4xl mx-auto">
      {/* スクリーンリーダー向け進行通知（解放・霧の変化） */}
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <button type="button" onClick={onBack}
          className="transition-colors active:bg-gray-100 min-h-11 px-2 text-sm text-gray-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg">
          {t.ch1.backToList}
        </button>
        <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
          <span className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg"
            title={t.ch1.xpAria}>{t.ch1.xpLabel} {state.adventureXp}</span>
          <label className="flex items-center gap-1 cursor-pointer min-h-11">
            <input type="checkbox" checked={simpleMode} onChange={(e) => setSimpleMode(e.target.checked)} />
            {t.ch1.simpleMode}
          </label>
          <label className="flex items-center gap-1 cursor-pointer min-h-11">
            <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
            {t.ch1.reduceMotion}
          </label>
        </div>
      </div>
      {/* dev-only:start */}
      {devTools && (
        <p className="text-[11px] text-gray-400 mb-3" data-dev-only="true">
          開発者ツール表示中（この画面の進行は検証用の保存領域を使います）
        </p>
      )}
      {/* dev-only:end */}

      {screen.kind === 'map' && (
        <div className="md:grid md:grid-cols-5 md:gap-4">
          {/* ── 左（desktop 60%）: マップ ── */}
          <div className="md:col-span-3">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{t.ch1.title(chapter.order, zh ? chapter.titleZh : chapter.titleJa)}</h2>
            <p className="text-xs text-gray-500 mb-2">{t.ch1.subtitle}</p>
            <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200 bg-[#9db877]" style={{ aspectRatio: '4/3' }}>
              <svg viewBox="0 0 48 36" className="absolute inset-0 w-full h-full" shapeRendering="crispEdges"
                role="img" aria-label={t.ch1.mapAria(zh ? chapter.titleZh : chapter.titleJa, currentLocationName, nextDestName)}>
                <TownMapBase discoveredLocationIds={state.chapter.discoveredLocationIds} />
                {chapter.locations.map(loc => {
                  const discovered = state.chapter.discoveredLocationIds.includes(loc.locationId);
                  const fog = discovered ? deriveLocationFog(state, loc.locationId, nowMs) : 'foggy';
                  return <LocationFogOverlay key={loc.locationId} region={FOG_REGION_SLOTS[chapter.locations.indexOf(loc)] ?? FOG_REGION_SLOTS[0]}
                    level={fog} animate={!reducedMotion} />;
                })}
                {/* 未出会いNPCの人影（霧の中・解放済みエリアのみ） */}
                {chapter.npcs.filter(n => !state.chapter.encounteredNpcIds.includes(n.npcId)
                  && state.chapter.discoveredLocationIds.includes(n.locationId)).map(n => {
                  const loc = chapter.locations.find(l => l.locationId === n.locationId)!;
                  return (
                    <g key={n.npcId} transform={`translate(${loc.x * 0.48 + 2.2}, ${loc.y * 0.36 - 3.4}) scale(0.36)`} opacity={0.8}>
                      <NpcSilhouette />
                    </g>
                  );
                })}
              </svg>
              {chapter.npcs.filter(n => state.chapter.encounteredNpcIds.includes(n.npcId)).map(n => {
                const loc = chapter.locations.find(l => l.locationId === n.locationId)!;
                const S = spriteFor(n.npcId);
                return (
                  <div key={n.npcId} className="absolute w-[7%]" title={`${n.nameJa}（${n.roleJa}）`}
                    style={{ left: `${loc.x + 5}%`, top: `${loc.y - 8}%` }}>
                    <S decorative />
                  </div>
                );
              })}
              <div className="absolute w-[7%]" style={{ left: `${heroLoc.x - 3}%`, top: `${heroLoc.y - 4}%`, ...transitionStyle }}
                title={t.ch1.hero}>
                <HeroSprite pose={heroPose} decorative />
              </div>
              {nextQuest && (() => {
                const site = chapter.locations.find(l => l.locationId === nextQuest.siteLocationId);
                return site ? (
                  <div className={`absolute w-[4.5%] ${reducedMotion ? '' : 'animate-pulse'}`}
                    style={{ left: `${site.x + 1}%`, top: `${site.y - 14}%` }} title={t.ch1.nextQuestMark}>
                    <LanternMarker decorative />
                  </div>
                ) : null;
              })()}
              {chapter.locations.map(loc => (
                <span key={loc.locationId}
                  className="absolute -translate-x-1/2 text-[10px] px-1 rounded bg-white/85 text-gray-700"
                  style={{ left: `${loc.x}%`, top: `${loc.y + 6}%` }}>
                  {state.chapter.discoveredLocationIds.includes(loc.locationId) ? (zh ? loc.nameZh : loc.nameJa) : '？？？'}
                </span>
              ))}
            </div>
            {/* マップの内容をテキストでも提供（画像・色だけに依存しない） */}
            <dl className="mt-2 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-0.5">
              <div><dt className="inline font-bold">{t.ch1.currentPlace} </dt><dd className="inline">{currentLocationName}</dd></div>
              {nextDestName && <div><dt className="inline font-bold">{t.ch1.nextPlace} </dt><dd className="inline">{nextDestName}</dd></div>}
            </dl>
            <ul className="mt-1 text-[11px] text-gray-500 space-y-0.5">
              {chapter.locations.map(loc => {
                const discovered = state.chapter.discoveredLocationIds.includes(loc.locationId);
                const fog = discovered ? deriveLocationFog(state, loc.locationId, nowMs) : 'foggy';
                return <li key={loc.locationId}>{discovered ? (zh ? loc.nameZh : loc.nameJa) : '？？？'}: {fogLabelOf(t)[fog]}</li>;
              })}
            </ul>
          </div>

          {/* ── 右（desktop 40%）: 行動 ── */}
          <div className="md:col-span-2 mt-3 md:mt-8">
            {nextQuest && !chapterDone && (
              <div className="bg-white border border-indigo-200 rounded-2xl p-3 mb-3">
                <p className="text-[11px] text-indigo-500 font-bold">{t.ch1.nextQuest(nextQuest.order, chapter.quests.length)}</p>
                <p className="text-sm font-bold text-gray-900 mb-1">{zh ? nextQuest.titleZh : nextQuest.titleJa}</p>
                <p className="text-xs text-gray-500 mb-2">{zh ? nextQuest.learnGoalZh : nextQuest.learnGoalJa}・{t.ch1.minutes(nextQuest.estimatedMinutes)}</p>
                <button type="button" onClick={() => beginQuest(nextQuest)}
                  className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                  {t.ch1.startQuestBtn(nextQuest.order)}
                </button>
              </div>
            )}
            {chapterDone && (
              <button type="button" onClick={() => setScreen({ kind: 'chapterComplete' })}
                className="action-raised action-emerald touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm mb-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                {t.ch1.seeRecord}
              </button>
            )}
            {reviewKeys.length > 0 && (
              <div className="mb-3 p-3 bg-violet-50 border border-violet-200 rounded-2xl">
                <p className="text-xs font-bold text-violet-800 mb-1">🏮 {zh ? chapter.reviewReunion.titleZh : chapter.reviewReunion.titleJa}</p>
                <p className="text-[11px] text-violet-700 mb-2">
                  {t.ch1.wordsFading(reviewKeys.length)}
                </p>
                <button type="button" onClick={() => setScreen({ kind: 'reviewLetter' })}
                  className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-11 bg-violet-600 text-white rounded-xl text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.readLetter}</button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-1.5">
              {chapter.quests.map(q => {
                const done = state.chapter.completedQuestIds.includes(q.questId);
                const unlocked = state.chapter.unlockedQuestIds.includes(q.questId);
                return (
                  <div key={q.questId} className={`text-xs px-3 py-2 rounded-xl border ${done ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : unlocked ? 'bg-white border-indigo-200 text-gray-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                    {done ? '✓' : unlocked ? '→' : '🔒'} {t.ch1.questN(q.order)}: {done || unlocked ? (zh ? q.titleZh : q.titleJa) : '？？？'}
                    <span className="block text-[10px] opacity-70">{done || unlocked ? (zh ? q.learnGoalZh : q.learnGoalJa) : t.ch1.lockedBehindFog}</span>
                  </div>
                );
              })}
            </div>
            {/* 開発者ツール（learner viewでは非表示・§6） */}
            {/* dev-only:start */}
            {devTools && (
              <div className="mt-3 flex flex-wrap gap-2" data-dev-only="true">
                <button type="button"
                  onClick={() => { setState(advanceSimulatedTime(state, 3)); announce('時間を3日進めました。'); }}
                  className="min-h-11 px-3 text-[11px] text-gray-500 border border-gray-200 rounded-xl">時間を＋3日</button>
                <button type="button"
                  onClick={() => { if (window.confirm('冒険の進行を最初からやり直しますか？')) { setState(resetAdventureState(clockNow(), undefined, chapter.chapterId)); setScreen({ kind: 'map' }); } }}
                  className="min-h-11 px-3 text-[11px] text-gray-400 underline">最初からやり直す</button>
              </div>
            )}
            {/* dev-only:end */}
          </div>
        </div>
      )}

      {screen.kind === 'questIntro' && (() => {
        const q = questInChapter(screen.questId)!;
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-indigo-500 font-bold mb-1">{t.ch1.questN(q.order)}</p>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{q.titleJa} <span className="text-xs text-gray-400 font-normal">{q.titleZh}</span></h3>
            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl text-sm text-gray-700 mb-3">
              <div className="w-10 shrink-0"><ShokoSprite pose="talk" /></div>
              <div>
                <p>{q.storyIntroJa}</p>
                <p className="text-xs text-gray-400 mt-1">{q.storyIntroZh}</p>
              </div>
            </div>
            <dl className="text-sm text-gray-800 space-y-1.5 mb-4">
              <div><dt className="inline font-bold">{t.ch1.learnWhat} </dt><dd className="inline">{zh ? q.learnGoalZh : q.learnGoalJa}</dd></div>
              <div><dt className="inline font-bold">{t.ch1.timeNeeded} </dt><dd className="inline">{t.ch1.minutes(q.estimatedMinutes)}</dd></div>
              <div><dt className="inline font-bold">{t.ch1.condition} </dt><dd className="inline">{zh ? q.completionConditionZh : q.completionConditionJa}</dd></div>
              <div><dt className="inline font-bold">{t.ch1.unlock} </dt><dd className="inline">{zh ? q.storyOutcomeZh : q.storyOutcomeJa}</dd></div>
              <div><dt className="inline font-bold">{t.ch1.reviewPlan} </dt><dd className="inline">{t.ch1.reviewPlanBody}</dd></div>
            </dl>
            <button type="button" onClick={() => setScreen({ kind: 'learning', questId: q.questId, itemIndex: 0, phase: 'teach', qIndex: 0, built: [], wrongOnce: false })}
              className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.startLearning}</button>
            <button type="button" onClick={() => setScreen({ kind: 'map' })}
              className="transition-colors active:bg-gray-100 rounded w-full min-h-11 mt-1 text-xs text-gray-400 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.backToChapterMap}</button>
          </div>
        );
      })()}

      {screen.kind === 'learning' && (() => {
        const q = questInChapter(screen.questId)!;
        const item = itemById.get(q.learningItemIds[screen.itemIndex])!;
        const profile = cognateProfileFor(item);
        const qs = assessFor(item);

        // ① 教える画面（答えを見せてよい）
        if (screen.phase === 'teach') {
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[11px] text-gray-400 mb-2">{t.ch1.wordProgress(q.order, screen.itemIndex + 1, q.learningItemIds.length)}</p>
              <div className="mb-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-900">{item.displayForm} <span className="text-sm text-gray-500 font-normal">{item.readingKana}</span></p>
                <p className="text-base text-indigo-700 font-bold mt-1">{item.meaningZh}</p>
                <p className="text-sm text-gray-700 mt-2">{item.exampleJa}</p>
                <p className="text-xs text-gray-400">{item.exampleZh}</p>
                {item.usageNoteZh && <p className="text-[11px] text-amber-700 mt-1">💡 {item.usageNoteZh}</p>}
              </div>
              {/* 同形語の注意（中国語話者向け・ここはteachなので出してよい） */}
              {profile.transferRiskZh && (
                <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <p className="text-[11px] font-bold text-rose-700 mb-0.5">
                    {t.n3u.cognateDiffers(profile.zhCognate ?? '')}
                  </p>
                  <p className="text-xs text-rose-800">{profile.transferRiskZh}</p>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mb-2">
                {t.ch1.assessNotice(qs.length)}
              </p>
              <button type="button" onClick={() => setScreen({ ...screen, phase: 'assess', qIndex: 0, built: [], wrongOnce: false })}
                className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                {t.ch1.memorized}
              </button>
              <button type="button" onClick={() => setScreen({ kind: 'map' })}
                className="transition-colors active:bg-gray-100 rounded w-full min-h-11 mt-1 text-xs text-gray-400 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.pauseToMap}</button>
            </div>
          );
        }

        // ② 確認画面（答えを見せない＝leakageなし）
        const aq = qs[Math.min(screen.qIndex, qs.length - 1)];
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-gray-400 mb-2">
              {t.ch1.wordAssess(q.order, screen.itemIndex + 1, q.learningItemIds.length, screen.qIndex + 1, qs.length)}
            </p>
            <p className="text-sm font-bold text-gray-800 mb-1 whitespace-pre-line">{aq.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{aq.promptZh}</p>
            {screen.wrongOnce && (
              <p className="text-xs text-rose-600 mb-2">{t.ch1.wrongRetry}</p>
            )}
            {aq.kind === 'order' ? (
              <OrderAnswer aq={aq} built={screen.built}
                onReset={() => setScreen({ ...screen, built: [] })}
                onPush={(tok) => {
                  const target = aq.orderAnswer ?? aq.choices;
                  const built = [...screen.built, tok];
                  if (built.length < target.length) { setScreen({ ...screen, built }); return; }
                  const ok = built.join('') === target.join('');
                  if (!ok) { setScreen({ ...screen, built: [], wrongOnce: true }); return; }
                  answerAssess(screen, item, true);
                }} />
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {aq.choices.map((opt, i) => (
                  <button key={opt} type="button" onClick={() => answerAssess(screen, item, i === aq.answerIndex)}
                    className="action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setScreen({ ...screen, phase: 'teach' })}
              className="transition-colors active:bg-gray-100 rounded w-full min-h-11 mt-3 text-xs text-gray-500 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.seeAgain}</button>
          </div>
        );
      })()}

      {screen.kind === 'grammar' && (() => {
        const q = questInChapter(screen.questId)!;
        const m = grammarMission(screen);
        const rule = ruleById.get(m.ruleId)!;
        const totalSteps = 1 + m.questionIds.length + 1;
        if (screen.step === 0) {
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[11px] text-gray-400 mb-2">{t.ch1.grammarStep1(q.order, screen.missionIndex + 1, q.grammarRequirements!.length, totalSteps)}</p>
              <h3 className="text-base font-bold text-gray-900 mb-1">{rule.titleJa}</h3>
              <p className="text-xs text-gray-400 mb-2">{rule.titleZh}</p>
              <p className="text-sm text-gray-800 mb-2">{rule.explanationJa}</p>
              <p className="text-xs text-gray-500 mb-4">{rule.explanationZh}</p>
              <button type="button" onClick={() => setScreen({ ...screen, step: 1 })}
                className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.toQuiz}</button>
            </div>
          );
        }
        if (screen.step <= m.questionIds.length) {
          const question = questionById.get(m.questionIds[screen.step - 1])!;
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[11px] text-gray-400 mb-2">{t.ch1.grammarStepK(q.order, screen.missionIndex + 1, screen.step + 1, totalSteps)}</p>
              <p className="text-sm font-bold text-gray-800 mb-1">{question.promptJa}</p>
              <p className="text-xs text-gray-400 mb-2">{question.promptZh}</p>
              {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.ch1.retryHint(rule.titleJa)}</p>}
              <div className="grid grid-cols-1 gap-1.5">
                {shuffledChoicesSeeded(question, 0).map((i) => (
                  <button key={question.choices![i]} type="button" onClick={() => answerGrammarQuestion(screen, question, i)}
                    className="action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                    {question.choices![i]}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        const shuffled = rotatedTokens(m.production.tokens);
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-gray-400 mb-2">{t.ch1.grammarProd(q.order, screen.missionIndex + 1, totalSteps)}</p>
            <p className="text-sm font-bold text-gray-800 mb-1">{m.production.promptJa}</p>
            <p className="text-xs text-gray-400 mb-2">{m.production.promptZh}</p>
            <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
              {screen.built.length ? screen.built.join('') : <span className="text-gray-300">{t.ch1.orderHere}</span>}
            </div>
            {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.ch1.orderWrong(rule.titleJa)}</p>}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {shuffled.map(tok => {
                const used = screen.built.filter(b => b === tok).length
                  >= m.production.tokens.filter(t2 => t2 === tok).length;
                return (
                  <button key={tok} type="button" disabled={used}
                    onClick={() => pushToken(screen, tok)}
                    className={`min-h-11 px-3 py-2 text-sm rounded-xl border touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${used ? 'bg-gray-100 text-gray-300 border-gray-100' : 'action-raised action-choice bg-white border-indigo-200 hover:border-indigo-400'}`}>
                    {tok}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setScreen({ ...screen, built: [] })}
              className="transition-colors active:bg-gray-100 rounded min-h-11 px-3 text-xs text-gray-400 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.orderReset}</button>
          </div>
        );
      })()}

      {screen.kind === 'finale' && (() => {
        const step = chapter.finaleSteps[screen.stepIndex];
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-indigo-500 font-bold mb-2">{t.ch1.finaleProgress(screen.stepIndex + 1, chapter.finaleSteps.length)}</p>
            <div className="flex items-start gap-2 mb-3">
              <div className="w-10 shrink-0">{(() => { const fq = chapter.quests.find(q => q.isChapterFinale); const npc = chapter.npcs.find(n => n.locationId === fq?.siteLocationId) ?? chapter.npcs[chapter.npcs.length - 1]; const S = spriteFor(npc.npcId); return <S pose="talk" />; })()}</div>
              <div className="p-3 bg-slate-50 rounded-xl text-sm text-gray-800 flex-1">
                <p>{step.npcLineJa}</p>
                <p className="text-xs text-gray-400 mt-0.5">{step.npcLineZh}</p>
              </div>
            </div>
            {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.ch1.replyFailed}</p>}
            <div className="grid grid-cols-1 gap-1.5">
              {step.optionsJa.map(opt => (
                <button key={opt} type="button" onClick={() => answerFinale(screen.questId, screen.stepIndex, opt)}
                  className="action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {screen.kind === 'questComplete' && (() => {
        const q = questInChapter(screen.questId)!;
        const unlockedNpcs = chapter.npcs.filter(n => q.unlocks.npcIds.includes(n.npcId));
        const beats = chapter.storyBeats.filter(b => q.unlocks.storyBeatIds.includes(b.beatId));
        // 次の行き先ラベルはrender時に確定させる（onClick内の複雑な式はcompilerがref誤検知する）
        const nextSiteId = chapter.quests.find(x => x.order === q.order + 1)?.siteLocationId ?? q.siteLocationId;
        const nextSiteLoc = chapter.locations.find(l => l.locationId === nextSiteId);
        const nextSiteName = (zh ? nextSiteLoc?.nameZh : nextSiteLoc?.nameJa) ?? t.ch1.nextSpot;
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-emerald-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8"><HeroSprite pose="happy" /></div>
              <h3 className="text-lg font-bold text-emerald-700">{t.ch1.questDone(q.order)}</h3>
            </div>
            <p className="text-xs text-amber-700 mb-3">{t.ch1.xpGained(screen.xpGained)}</p>
            {!simpleMode && beats.map(b => (
              <div key={b.beatId} className="p-3 bg-slate-50 rounded-xl text-sm text-gray-700 mb-2">
                <p>{b.textJa}</p>
                <p className="text-xs text-gray-400 mt-1">{b.textZh}</p>
              </div>
            ))}
            <div className="p-3 bg-emerald-50 rounded-xl text-sm text-emerald-900 mb-2">
              <p>{q.storyOutcomeJa}</p>
              <p className="text-xs text-emerald-600 mt-1">{q.storyOutcomeZh}</p>
            </div>
            {unlockedNpcs.map(n => (
              <div key={n.npcId} className="flex items-center gap-2 p-2 border border-gray-100 rounded-xl mb-2">
                <div className="w-9 shrink-0">{spriteFor(n.npcId)({ pose: 'happy' })}</div>
                <div className="text-sm">
                  <p className="font-bold text-gray-800">{n.nameJa} <span className="text-[10px] text-gray-400">{n.roleJa}</span></p>
                  <p className="text-xs text-gray-600">「{n.greetingJa}」</p>
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => q.isChapterFinale ? setScreen({ kind: 'chapterComplete' })
                : returnToMap(t.ch1.heroMovesTo(nextSiteName))}
              className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm mt-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              {q.isChapterFinale ? t.ch1.toCh1Record(chapter.order) : t.ch1.toMapHeroMoves}
            </button>
          </div>
        );
      })()}

      {screen.kind === 'chapterComplete' && (
        <div className="max-w-2xl bg-white rounded-2xl border border-amber-200 p-4">
          <h3 className="text-lg font-bold text-amber-700 mb-2">{t.ch1.ch1Done(chapter.order, zh ? chapter.titleZh : chapter.titleJa)}</h3>
          <div className="p-3 bg-slate-50 rounded-xl text-sm text-gray-700 mb-3">
            <p>{chapter.storyBeats[chapter.storyBeats.length - 1]?.textJa}</p>
            <p className="text-xs text-gray-400 mt-1">{chapter.storyBeats[chapter.storyBeats.length - 1]?.textZh}</p>
          </div>
          <ul className="text-sm text-gray-800 space-y-1 mb-3">
            <li>✓ {t.ch1.doneQuests(state.chapter.completedQuestIds.length, chapter.quests.length)}</li>
            <li>✓ {t.ch1.metPeople(state.chapter.encounteredNpcIds.length, chapter.npcs.filter(n => state.chapter.encounteredNpcIds.includes(n.npcId)).map(n => zh ? n.nameZh : n.nameJa).join('・'))}</li>
            <li>✓ {t.ch1.xpLabel}: {state.adventureXp}</li>
            <li>🏮 {t.ch1.ch2Coming((() => { const nid = chapter.nextChapterId; if (!nid) return null; const nc = chapterById(nid); return nc ? (zh ? nc.titleZh : nc.titleJa) : null; })())}</li>
          </ul>
          <p className="text-xs text-gray-500 mb-3">
            {t.ch1.fogNote}
          </p>
          <button type="button" onClick={() => returnToMap()}
            className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.backToChapterMap}</button>
        </div>
      )}

      {screen.kind === 'reviewLetter' && (
        <div className="max-w-2xl bg-white rounded-2xl border border-violet-200 p-4">
          <div className="flex items-start gap-2 mb-3">
            <div className="w-10 shrink-0">{(() => { const S = spriteFor((chapter.npcs[1] ?? chapter.npcs[0]).npcId); return <S pose="talk" />; })()}</div>
            <div className="p-3 bg-violet-50 rounded-xl text-sm text-gray-800 flex-1">
              <p className="font-bold text-violet-800 mb-1">{zh ? chapter.reviewReunion.titleZh : chapter.reviewReunion.titleJa}</p>
              <p>{chapter.reviewReunion.letterJa}</p>
              <p className="text-xs text-gray-400 mt-1">{chapter.reviewReunion.letterZh}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">{t.ch1.fadingWords(reviewKeys.length)}</p>
          <button type="button"
            onClick={() => setScreen({ kind: 'reviewCheck', keys: reviewKeys.slice(0, 6), index: 0, built: [], wrongOnce: false })}
            className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-violet-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.goCheck}</button>
          <button type="button" onClick={() => setScreen({ kind: 'map' })}
            className="transition-colors active:bg-gray-100 rounded w-full min-h-11 mt-1 text-xs text-gray-400 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.later}</button>
        </div>
      )}

      {screen.kind === 'reviewCheck' && (() => {
        const key = screen.keys[screen.index];
        if (key.startsWith('rule:')) {
          const rule = ruleById.get(key.slice(5))!;
          const mission = chapter.quests.flatMap(q => q.grammarRequirements ?? []).find(g => g.ruleId === rule.id)!;
          const question = questionById.get(mission.questionIds[0])!;
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-violet-200 p-4">
              <p className="text-[11px] text-violet-500 font-bold mb-2">{t.ch1.reunionRule(screen.index + 1, screen.keys.length, rule.titleJa)}</p>
              <p className="text-sm font-bold text-gray-800 mb-1">{question.promptJa}</p>
              {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.ch1.recallRetry(rule.titleJa)}</p>}
              <div className="grid grid-cols-1 gap-1.5">
                {shuffledChoicesSeeded(question, 0).map((i) => (
                  <button key={question.choices![i]} type="button" onClick={() => answerReview(screen, i === question.answerIndex)}
                    className="action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{question.choices![i]}</button>
                ))}
              </div>
            </div>
          );
        }
        const item = itemById.get(key)!;
        // 別文脈での再確認: 初回と同じ問題ではなく、その語で測る価値のある次元から出す
        const qs = assessFor(item);
        const aq = qs[qs.length - 1] ?? qs[0];
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-violet-200 p-4">
            <p className="text-[11px] text-violet-500 font-bold mb-2">{t.ch1.reunionWord(screen.index + 1, screen.keys.length, item.displayForm)}</p>
            <p className="text-sm font-bold text-gray-800 mb-1 whitespace-pre-line">{aq.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{aq.promptZh}</p>
            {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.ch1.slowOk}</p>}
            {aq.kind === 'order' ? (
              <OrderAnswer aq={aq} built={screen.built}
                onReset={() => setScreen({ ...screen, built: [] })}
                onPush={(tok) => {
                  const target = aq.orderAnswer ?? aq.choices;
                  const built = [...screen.built, tok];
                  if (built.length < target.length) { setScreen({ ...screen, built }); return; }
                  const ok = built.join('') === target.join('');
                  if (!ok) { setScreen({ ...screen, built: [], wrongOnce: true }); return; }
                  answerReview(screen, true);
                }} />
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {aq.choices.map((opt, i) => (
                  <button key={opt} type="button" onClick={() => answerReview(screen, i === aq.answerIndex)}
                    className="action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{opt}</button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {screen.kind === 'reviewDone' && (
        <div className="max-w-2xl bg-white rounded-2xl border border-violet-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8">{(() => { const S = spriteFor((chapter.npcs[1] ?? chapter.npcs[0]).npcId); return <S pose="happy" />; })()}</div>
            <h3 className="text-base font-bold text-violet-700">{t.ch1.reunionDone(screen.count)}</h3>
          </div>
          <div className="p-3 bg-violet-50 rounded-xl text-sm text-gray-800 mb-2">
            <p>{chapter.reviewReunion.outcomeJa}</p>
            <p className="text-xs text-gray-400 mt-1">{chapter.reviewReunion.outcomeZh}</p>
          </div>
          <p className="text-xs text-amber-700 mb-3">{t.ch1.reviewReward(chapter.reviewReunion.adventureXpReward)}</p>
          <button type="button" onClick={() => returnToMap(t.ch1.wordFogCleared)}
            className="action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 bg-violet-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.ch1.checkOnMap}</button>
        </div>
      )}
    </div>
  );
};

export default Chapter1AdventurePanel;

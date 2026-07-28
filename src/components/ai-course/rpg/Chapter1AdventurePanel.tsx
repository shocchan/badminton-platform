// RPG Chapter 1「はじまりの町」playable polished draft（labPreview限定・lazy chunk）v2。
// 学習の進捗＝物語の進行。操作ゲームではない（移動は自動演出）。
// v2: 文法ミッション（実在FoundationRule/Question）・復習Quest「再会」・responsive 2カラム・
//     Fog可視化・自動移動演出・aria-live・sandbox時間シミュレーション。
// 進捗はsandbox専用キーのみ（通常learnerの学習記録には読み書きしない）。
import { useMemo, useRef, useState } from 'react';
import {
  CHAPTER1_LOCATIONS, CHAPTER1_NPCS, CHAPTER1_QUESTS, CHAPTER1_STORY_BEATS,
  CHAPTER1_FINALE_STEPS, REVIEW_REUNION, chapter1QuestById,
  type Chapter1Quest, type GrammarMission,
} from '../../../lib/aiLesson/course/rpg/chapter1Data';
import {
  loadAdventureState, startQuest, recordLearningResult, completeQuest,
  deriveLocationFog, reviewNeededItems, resetAdventureState,
  advanceSimulatedTime, recordReviewResult, claimReviewReward,
  type AdventureState, type FogLevel,
} from '../../../lib/aiLesson/course/rpg/adventureState';
import { allVocabularyItems } from '../../../lib/aiLesson/course/foundationVocabBank';
import { buildAssessQuestions } from '../../../lib/aiLesson/course/quality/assessQuestionEngine';
import { cognateProfileFor } from '../../../lib/aiLesson/course/quality/cognateProfile';
import type { FoundationItem, FoundationRule, FoundationQuestion } from '../../../lib/aiLesson/course/foundationTypes';
import { UNIT1_RULES, UNIT1_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit1';
import { UNIT5_RULES, UNIT5_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit5';
import { UNIT6_RULES, UNIT6_QUESTIONS } from '../../../lib/aiLesson/course/foundationUnit6';
import {
  HeroSprite, ShokoSprite, NpcHanaSprite, NpcGenSprite, LanternMarker,
  NpcSilhouette, TownMapBase, LocationFogOverlay, type SpritePose,
} from './pixelAssets';

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
  onBack: () => void;
  /**
   * 開発者ツール（時間送り・sandbox注記）。learner viewでは必ず false。
   * §6: learner画面に「試作」「sandbox」「検証用」等の開発表示を出さない。
   */
  devTools?: boolean;
}

const NPC_SPRITE: Record<string, (p: { className?: string; pose?: SpritePose; decorative?: boolean }) => React.ReactElement> = {
  'c1-npc-shoko': ShokoSprite, 'c1-npc-hana': NpcHanaSprite, 'c1-npc-gen': NpcGenSprite,
};

const FOG_REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'c1-town-gate': { x: 0, y: 22, w: 13, h: 14 },
  'c1-main-street': { x: 12, y: 15, w: 15, h: 16 },
  'c1-plaza': { x: 24, y: 8, w: 12, h: 12 },
  'c1-station-front': { x: 35, y: 0, w: 13, h: 13 },
};

const FOG_LABEL: Record<FogLevel, string> = {
  clear: 'はっきり見える', light_fog: '少し霞んでいる', foggy: '霧の中', review_needed: '再会待ち（復習でまた晴れる）',
};

const ALL_RULES: FoundationRule[] = [...UNIT1_RULES, ...UNIT5_RULES, ...UNIT6_RULES];
const ALL_RULE_QUESTIONS: FoundationQuestion[] = [...UNIT1_QUESTIONS, ...UNIT5_QUESTIONS, ...UNIT6_QUESTIONS];
const ruleById = new Map(ALL_RULES.map(r => [r.id, r]));
const questionById = new Map(ALL_RULE_QUESTIONS.map(q => [q.id, q]));

/** 産出用トークンの決定的シャッフル（乱数なし・元順と必ず異なる回転） */
const rotatedTokens = (tokens: string[]): string[] =>
  tokens.length < 2 ? tokens : [...tokens.slice(1), tokens[0]];

const initialNowMs = Date.now();
const clockNow = () => Date.now();

export const Chapter1AdventurePanel = ({ onBack, devTools = false }: Props) => {
  const [state, setState] = useState<AdventureState>(() => loadAdventureState(initialNowMs));
  const [screen, setScreen] = useState<Screen>({ kind: 'map' });
  const [simpleMode, setSimpleMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  });
  const [announcement, setAnnouncement] = useState('');
  const [heroPose, setHeroPose] = useState<SpritePose>('idle');
  const walkTimer = useRef<number | null>(null);
  // 実時間＋sandboxシミュレーションoffset。renderではnowMs（state由来）を使い、handlerでnow()を呼ぶ
  const [realNowMs, setRealNowMs] = useState(initialNowMs);
  const now = () => { const t = clockNow(); setRealNowMs(t); return t + state.simulatedOffsetMs; };
  const nowMs = realNowMs + state.simulatedOffsetMs;

  const itemById = useMemo(() => new Map(allVocabularyItems().map(i => [i.id, i])), []);
  const chapterPool = useMemo(() => {
    const ids = CHAPTER1_QUESTS.flatMap(q => q.learningItemIds);
    return ids.map(id => itemById.get(id)).filter((x): x is FoundationItem => !!x);
  }, [itemById]);

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
    ? chapter1QuestById(state.chapter.currentQuestId) ?? null : null;
  const reviewKeys = reviewNeededItems(state, nowMs);
  const chapterDone = state.chapter.completedAtMs !== null;

  const announce = (msg: string) => setAnnouncement(msg);

  /** Quest完了後の帰還: 主人公が歩き、霧が変わる（Reduced Motionでは即時） */
  const returnToMap = (walkMsg?: string) => {
    setScreen({ kind: 'map' });
    if (walkMsg) announce(walkMsg);
    if (!reducedMotion) {
      setHeroPose('walk');
      if (walkTimer.current) window.clearTimeout(walkTimer.current);
      walkTimer.current = window.setTimeout(() => setHeroPose('idle'), 1400);
    }
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
      ...quest.unlocks.locationIds.map(id => CHAPTER1_LOCATIONS.find(l => l.locationId === id)?.nameJa),
      ...quest.unlocks.npcIds.map(id => CHAPTER1_NPCS.find(n => n.npcId === id)?.nameJa),
    ].filter(Boolean);
    announce(`Quest${quest.order}完了。${opened.length ? `${opened.join('・')}が見えるようになりました。` : ''}`);
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
    const quest = chapter1QuestById(s.questId)!;
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
    chapter1QuestById(s.questId)!.grammarRequirements![s.missionIndex];

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
    const quest = chapter1QuestById(s.questId)!;
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
    const step = CHAPTER1_FINALE_STEPS[stepIndex];
    if (choice !== step.correctJa) { setScreen(s => s.kind === 'finale' ? { ...s, wrongOnce: true } : s); return; }
    if (stepIndex + 1 < CHAPTER1_FINALE_STEPS.length) {
      setScreen({ kind: 'finale', questId, stepIndex: stepIndex + 1, wrongOnce: false });
      return;
    }
    finishQuest(chapter1QuestById(questId)!, state, true);
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
      const rewarded = claimReviewReward(next, REVIEW_REUNION.adventureXpReward, now());
      setState(rewarded);
      setScreen({ kind: 'reviewDone', count: s.keys.length });
      announce('再会の復習が終わり、ことばの霧が晴れました。');
    }
  };

  /** 並べ替え（産出）解答UI。トークンを順に押して文を作る */
  const OrderAnswer = ({ aq, built, onPush, onReset }: {
    aq: { choices: string[]; orderAnswer?: string[] }; built: string[];
    onPush: (t: string) => void; onReset: () => void;
  }) => (
    <div>
      <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
        {built.length ? built.join('') : <span className="text-gray-300">ここに文ができます</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {aq.choices.map((tok, i) => {
          const target = aq.orderAnswer ?? aq.choices;
          const used = built.filter(b => b === tok).length >= target.filter(t => t === tok).length;
          return (
            <button key={`${tok}-${i}`} type="button" disabled={used} onClick={() => onPush(tok)}
              className={`min-h-11 px-3 py-2 text-sm rounded-xl border ${used ? 'bg-gray-100 text-gray-300 border-gray-100' : 'bg-white border-indigo-200 hover:border-indigo-400'}`}>
              {tok}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onReset} className="min-h-11 px-3 text-xs text-gray-400 underline">やり直す</button>
    </div>
  );

  const heroLoc = useMemo(() => {
    const site = nextQuest?.siteLocationId ?? CHAPTER1_QUESTS[CHAPTER1_QUESTS.length - 1].siteLocationId;
    return CHAPTER1_LOCATIONS.find(l => l.locationId === site) ?? CHAPTER1_LOCATIONS[0];
  }, [nextQuest]);
  const transitionStyle = reducedMotion ? undefined : { transition: 'left 1.2s ease, top 1.2s ease' };

  const currentLocationName = heroLoc.nameJa;
  const nextDestName = nextQuest
    ? CHAPTER1_LOCATIONS.find(l => l.locationId === nextQuest.siteLocationId)?.nameJa ?? '' : '';

  return (
    <div className="max-w-4xl mx-auto">
      {/* スクリーンリーダー向け進行通知（解放・霧の変化） */}
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <button type="button" onClick={onBack}
          className="min-h-11 px-2 text-sm text-gray-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg">
          ← 教材一覧へ戻る
        </button>
        <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
          <span className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg"
            title="冒険の継続・挑戦の量。日本語の習得度ではありません">冒険値 {state.adventureXp}</span>
          <label className="flex items-center gap-1 cursor-pointer min-h-11">
            <input type="checkbox" checked={simpleMode} onChange={(e) => setSimpleMode(e.target.checked)} />
            シンプル学習モード
          </label>
          <label className="flex items-center gap-1 cursor-pointer min-h-11">
            <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
            動きを減らす
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
            <h2 className="text-lg font-bold text-gray-900 mb-1">Chapter 1: はじまりの町（仮称）</h2>
            <p className="text-xs text-gray-500 mb-2">日本語を学ぶと霧が晴れ、行ける場所と話せる人が増えていきます。</p>
            <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200 bg-[#9db877]" style={{ aspectRatio: '4/3' }}>
              <svg viewBox="0 0 48 36" className="absolute inset-0 w-full h-full" shapeRendering="crispEdges"
                role="img" aria-label={`はじまりの町のマップ。現在地は${currentLocationName}。${nextDestName ? `次の目的地は${nextDestName}。` : ''}`}>
                <TownMapBase discoveredLocationIds={state.chapter.discoveredLocationIds} />
                {CHAPTER1_LOCATIONS.map(loc => {
                  const discovered = state.chapter.discoveredLocationIds.includes(loc.locationId);
                  const fog = discovered ? deriveLocationFog(state, loc.locationId, nowMs) : 'foggy';
                  return <LocationFogOverlay key={loc.locationId} region={FOG_REGIONS[loc.locationId]}
                    level={fog} animate={!reducedMotion} />;
                })}
                {/* 未出会いNPCの人影（霧の中・解放済みエリアのみ） */}
                {CHAPTER1_NPCS.filter(n => !state.chapter.encounteredNpcIds.includes(n.npcId)
                  && state.chapter.discoveredLocationIds.includes(n.locationId)).map(n => {
                  const loc = CHAPTER1_LOCATIONS.find(l => l.locationId === n.locationId)!;
                  return (
                    <g key={n.npcId} transform={`translate(${loc.x * 0.48 + 2.2}, ${loc.y * 0.36 - 3.4}) scale(0.36)`} opacity={0.8}>
                      <NpcSilhouette />
                    </g>
                  );
                })}
              </svg>
              {CHAPTER1_NPCS.filter(n => state.chapter.encounteredNpcIds.includes(n.npcId)).map(n => {
                const loc = CHAPTER1_LOCATIONS.find(l => l.locationId === n.locationId)!;
                const S = NPC_SPRITE[n.npcId];
                return (
                  <div key={n.npcId} className="absolute w-[7%]" title={`${n.nameJa}（${n.roleJa}）`}
                    style={{ left: `${loc.x + 5}%`, top: `${loc.y - 8}%` }}>
                    <S decorative />
                  </div>
                );
              })}
              <div className="absolute w-[7%]" style={{ left: `${heroLoc.x - 3}%`, top: `${heroLoc.y - 4}%`, ...transitionStyle }}
                title="主人公（あなた）">
                <HeroSprite pose={heroPose} decorative />
              </div>
              {nextQuest && (() => {
                const site = CHAPTER1_LOCATIONS.find(l => l.locationId === nextQuest.siteLocationId);
                return site ? (
                  <div className={`absolute w-[4.5%] ${reducedMotion ? '' : 'animate-pulse'}`}
                    style={{ left: `${site.x + 1}%`, top: `${site.y - 14}%` }} title="次のQuest">
                    <LanternMarker decorative />
                  </div>
                ) : null;
              })()}
              {CHAPTER1_LOCATIONS.map(loc => (
                <span key={loc.locationId}
                  className="absolute -translate-x-1/2 text-[10px] px-1 rounded bg-white/85 text-gray-700"
                  style={{ left: `${loc.x}%`, top: `${loc.y + 6}%` }}>
                  {state.chapter.discoveredLocationIds.includes(loc.locationId) ? loc.nameJa : '？？？'}
                </span>
              ))}
            </div>
            {/* マップの内容をテキストでも提供（画像・色だけに依存しない） */}
            <dl className="mt-2 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-0.5">
              <div><dt className="inline font-bold">現在地: </dt><dd className="inline">{currentLocationName}</dd></div>
              {nextDestName && <div><dt className="inline font-bold">次の目的地: </dt><dd className="inline">{nextDestName}</dd></div>}
            </dl>
            <ul className="mt-1 text-[11px] text-gray-500 space-y-0.5">
              {CHAPTER1_LOCATIONS.map(loc => {
                const discovered = state.chapter.discoveredLocationIds.includes(loc.locationId);
                const fog = discovered ? deriveLocationFog(state, loc.locationId, nowMs) : 'foggy';
                return <li key={loc.locationId}>{discovered ? loc.nameJa : '？？？'}: {FOG_LABEL[fog]}</li>;
              })}
            </ul>
          </div>

          {/* ── 右（desktop 40%）: 行動 ── */}
          <div className="md:col-span-2 mt-3 md:mt-8">
            {nextQuest && !chapterDone && (
              <div className="bg-white border border-indigo-200 rounded-2xl p-3 mb-3">
                <p className="text-[11px] text-indigo-500 font-bold">次のQuest {nextQuest.order}／{CHAPTER1_QUESTS.length}</p>
                <p className="text-sm font-bold text-gray-900 mb-1">{nextQuest.titleJa}</p>
                <p className="text-xs text-gray-500 mb-2">{nextQuest.learnGoalJa}・約{nextQuest.estimatedMinutes}分</p>
                <button type="button" onClick={() => beginQuest(nextQuest)}
                  className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                  Quest {nextQuest.order} を始める
                </button>
              </div>
            )}
            {chapterDone && (
              <button type="button" onClick={() => setScreen({ kind: 'chapterComplete' })}
                className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm mb-3">
                Chapter 1 完了記録を見る
              </button>
            )}
            {reviewKeys.length > 0 && (
              <div className="mb-3 p-3 bg-violet-50 border border-violet-200 rounded-2xl">
                <p className="text-xs font-bold text-violet-800 mb-1">🏮 {REVIEW_REUNION.titleJa}</p>
                <p className="text-[11px] text-violet-700 mb-2">
                  {reviewKeys.length}個のことばが霞んでいます。もう一度会いに行っても、場所や記録は失われません。
                </p>
                <button type="button" onClick={() => setScreen({ kind: 'reviewLetter' })}
                  className="w-full min-h-11 bg-violet-600 text-white rounded-xl text-sm font-bold">手紙を読む</button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-1.5">
              {CHAPTER1_QUESTS.map(q => {
                const done = state.chapter.completedQuestIds.includes(q.questId);
                const unlocked = state.chapter.unlockedQuestIds.includes(q.questId);
                return (
                  <div key={q.questId} className={`text-xs px-3 py-2 rounded-xl border ${done ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : unlocked ? 'bg-white border-indigo-200 text-gray-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                    {done ? '✓' : unlocked ? '→' : '🔒'} Quest {q.order}: {done || unlocked ? q.titleJa : '？？？'}
                    <span className="block text-[10px] opacity-70">{done || unlocked ? q.learnGoalJa : '霧の向こうにある'}</span>
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
                  onClick={() => { if (window.confirm('冒険の進行を最初からやり直しますか？')) { setState(resetAdventureState(clockNow())); setScreen({ kind: 'map' }); } }}
                  className="min-h-11 px-3 text-[11px] text-gray-400 underline">最初からやり直す</button>
              </div>
            )}
            {/* dev-only:end */}
          </div>
        </div>
      )}

      {screen.kind === 'questIntro' && (() => {
        const q = chapter1QuestById(screen.questId)!;
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-indigo-500 font-bold mb-1">Quest {q.order}</p>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{q.titleJa} <span className="text-xs text-gray-400 font-normal">{q.titleZh}</span></h3>
            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl text-sm text-gray-700 mb-3">
              <div className="w-10 shrink-0"><ShokoSprite pose="talk" /></div>
              <div>
                <p>{q.storyIntroJa}</p>
                <p className="text-xs text-gray-400 mt-1">{q.storyIntroZh}</p>
              </div>
            </div>
            <dl className="text-sm text-gray-800 space-y-1.5 mb-4">
              <div><dt className="inline font-bold">学ぶこと: </dt><dd className="inline">{q.learnGoalJa}</dd></div>
              <div><dt className="inline font-bold">所要時間: </dt><dd className="inline">約{q.estimatedMinutes}分</dd></div>
              <div><dt className="inline font-bold">完了条件: </dt><dd className="inline">{q.completionConditionJa}</dd></div>
              <div><dt className="inline font-bold">完了すると: </dt><dd className="inline">{q.storyOutcomeJa}</dd></div>
              <div><dt className="inline font-bold">復習予定: </dt><dd className="inline">正解から2日で薄霧、10日で「再会」の復習Questが出ます</dd></div>
            </dl>
            <button type="button" onClick={() => setScreen({ kind: 'learning', questId: q.questId, itemIndex: 0, phase: 'teach', qIndex: 0, built: [], wrongOnce: false })}
              className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">学習を始める</button>
            <button type="button" onClick={() => setScreen({ kind: 'map' })}
              className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">マップへ戻る</button>
          </div>
        );
      })()}

      {screen.kind === 'learning' && (() => {
        const q = chapter1QuestById(screen.questId)!;
        const item = itemById.get(q.learningItemIds[screen.itemIndex])!;
        const profile = cognateProfileFor(item);
        const qs = assessFor(item);

        // ① 教える画面（答えを見せてよい）
        if (screen.phase === 'teach') {
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[11px] text-gray-400 mb-2">Quest {q.order}・ことば {screen.itemIndex + 1}／{q.learningItemIds.length}（おぼえる）</p>
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
                    中国語の「{profile.zhCognate}」と違います
                  </p>
                  <p className="text-xs text-rose-800">{profile.transferRiskZh}</p>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mb-2">
                次は、この画面を閉じてから{qs.length}問確認します（答えは表示されません）。
              </p>
              <button type="button" onClick={() => setScreen({ ...screen, phase: 'assess', qIndex: 0, built: [], wrongOnce: false })}
                className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">
                おぼえた・確認へ進む
              </button>
              <button type="button" onClick={() => setScreen({ kind: 'map' })}
                className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">中断してマップへ戻る（進み具合は保存されます）</button>
            </div>
          );
        }

        // ② 確認画面（答えを見せない＝leakageなし）
        const aq = qs[Math.min(screen.qIndex, qs.length - 1)];
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-gray-400 mb-2">
              Quest {q.order}・ことば {screen.itemIndex + 1}／{q.learningItemIds.length}（確認 {screen.qIndex + 1}／{qs.length}）
            </p>
            <p className="text-sm font-bold text-gray-800 mb-1 whitespace-pre-line">{aq.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{aq.promptZh}</p>
            {screen.wrongOnce && (
              <p className="text-xs text-rose-600 mb-2">もう一度考えてみましょう。（再想一想）</p>
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
                    className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setScreen({ ...screen, phase: 'teach' })}
              className="w-full min-h-11 mt-3 text-xs text-gray-500 underline">もう一度おぼえる画面を見る（この問題はやり直しになります）</button>
          </div>
        );
      })()}

      {screen.kind === 'grammar' && (() => {
        const q = chapter1QuestById(screen.questId)!;
        const m = grammarMission(screen);
        const rule = ruleById.get(m.ruleId)!;
        const totalSteps = 1 + m.questionIds.length + 1;
        if (screen.step === 0) {
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[11px] text-gray-400 mb-2">Quest {q.order}・文法 {screen.missionIndex + 1}／{q.grammarRequirements!.length}（1／{totalSteps}）</p>
              <h3 className="text-base font-bold text-gray-900 mb-1">{rule.titleJa}</h3>
              <p className="text-xs text-gray-400 mb-2">{rule.titleZh}</p>
              <p className="text-sm text-gray-800 mb-2">{rule.explanationJa}</p>
              <p className="text-xs text-gray-500 mb-4">{rule.explanationZh}</p>
              <button type="button" onClick={() => setScreen({ ...screen, step: 1 })}
                className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">確認問題へ</button>
            </div>
          );
        }
        if (screen.step <= m.questionIds.length) {
          const question = questionById.get(m.questionIds[screen.step - 1])!;
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[11px] text-gray-400 mb-2">Quest {q.order}・文法 {screen.missionIndex + 1}（{screen.step + 1}／{totalSteps}）</p>
              <p className="text-sm font-bold text-gray-800 mb-1">{question.promptJa}</p>
              <p className="text-xs text-gray-400 mb-2">{question.promptZh}</p>
              {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">もう一度考えてみましょう。ヒント: {rule.titleJa}</p>}
              <div className="grid grid-cols-1 gap-1.5">
                {(question.choices ?? []).map((c, i) => (
                  <button key={c} type="button" onClick={() => answerGrammarQuestion(screen, question, i)}
                    className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-indigo-400">
                    {c}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        const shuffled = rotatedTokens(m.production.tokens);
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-gray-400 mb-2">Quest {q.order}・文法 {screen.missionIndex + 1}（{totalSteps}／{totalSteps}・産出）</p>
            <p className="text-sm font-bold text-gray-800 mb-1">{m.production.promptJa}</p>
            <p className="text-xs text-gray-400 mb-2">{m.production.promptZh}</p>
            <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
              {screen.built.length ? screen.built.join('') : <span className="text-gray-300">ここに文ができます</span>}
            </div>
            {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">順番が違ったようです。「{rule.titleJa}」を思い出してもう一度。</p>}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {shuffled.map(tok => {
                const used = screen.built.filter(b => b === tok).length
                  >= m.production.tokens.filter(t2 => t2 === tok).length;
                return (
                  <button key={tok} type="button" disabled={used}
                    onClick={() => pushToken(screen, tok)}
                    className={`min-h-11 px-3 py-2 text-sm rounded-xl border ${used ? 'bg-gray-100 text-gray-300 border-gray-100' : 'bg-white border-indigo-200 hover:border-indigo-400'}`}>
                    {tok}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setScreen({ ...screen, built: [] })}
              className="min-h-11 px-3 text-xs text-gray-400 underline">やり直す</button>
          </div>
        );
      })()}

      {screen.kind === 'finale' && (() => {
        const step = CHAPTER1_FINALE_STEPS[screen.stepIndex];
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-indigo-500 font-bold mb-2">章末: 駅前の会話 {screen.stepIndex + 1}／{CHAPTER1_FINALE_STEPS.length}</p>
            <div className="flex items-start gap-2 mb-3">
              <div className="w-10 shrink-0"><NpcGenSprite pose="talk" /></div>
              <div className="p-3 bg-slate-50 rounded-xl text-sm text-gray-800 flex-1">
                <p>{step.npcLineJa}</p>
                <p className="text-xs text-gray-400 mt-0.5">{step.npcLineZh}</p>
              </div>
            </div>
            {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">その返事だと伝わらなかったようです。もう一度選んでみましょう。</p>}
            <div className="grid grid-cols-1 gap-1.5">
              {step.optionsJa.map(opt => (
                <button key={opt} type="button" onClick={() => answerFinale(screen.questId, screen.stepIndex, opt)}
                  className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-indigo-400">
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {screen.kind === 'questComplete' && (() => {
        const q = chapter1QuestById(screen.questId)!;
        const unlockedNpcs = CHAPTER1_NPCS.filter(n => q.unlocks.npcIds.includes(n.npcId));
        const beats = CHAPTER1_STORY_BEATS.filter(b => q.unlocks.storyBeatIds.includes(b.beatId));
        return (
          <div className="max-w-2xl bg-white rounded-2xl border border-emerald-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8"><HeroSprite pose="happy" /></div>
              <h3 className="text-lg font-bold text-emerald-700">Quest {q.order} 完了！</h3>
            </div>
            <p className="text-xs text-amber-700 mb-3">冒険値 +{screen.xpGained}（冒険の記録です。日本語の定着は復習と再挑戦で確かめます）</p>
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
                <div className="w-9 shrink-0">{NPC_SPRITE[n.npcId]({ pose: 'happy' })}</div>
                <div className="text-sm">
                  <p className="font-bold text-gray-800">{n.nameJa} <span className="text-[10px] text-gray-400">{n.roleJa}</span></p>
                  <p className="text-xs text-gray-600">「{n.greetingJa}」</p>
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => q.isChapterFinale ? setScreen({ kind: 'chapterComplete' })
                : returnToMap(`主人公が${CHAPTER1_LOCATIONS.find(l => l.locationId === (CHAPTER1_QUESTS.find(x => x.order === q.order + 1)?.siteLocationId ?? q.siteLocationId))?.nameJa ?? '次の場所'}へ進みます。`)}
              className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm mt-1">
              {q.isChapterFinale ? 'Chapter 1 の記録へ' : 'マップへ（主人公が次の場所へ進みます）'}
            </button>
          </div>
        );
      })()}

      {screen.kind === 'chapterComplete' && (
        <div className="max-w-2xl bg-white rounded-2xl border border-amber-200 p-4">
          <h3 className="text-lg font-bold text-amber-700 mb-2">🏮 Chapter 1「はじまりの町」完了</h3>
          <div className="p-3 bg-slate-50 rounded-xl text-sm text-gray-700 mb-3">
            <p>{CHAPTER1_STORY_BEATS.find(b => b.beatId === 'c1-beat-chapter-end')?.textJa}</p>
            <p className="text-xs text-gray-400 mt-1">{CHAPTER1_STORY_BEATS.find(b => b.beatId === 'c1-beat-chapter-end')?.textZh}</p>
          </div>
          <ul className="text-sm text-gray-800 space-y-1 mb-3">
            <li>✓ 完了Quest: {state.chapter.completedQuestIds.length}／{CHAPTER1_QUESTS.length}</li>
            <li>✓ 出会った人: {state.chapter.encounteredNpcIds.length}人（{CHAPTER1_NPCS.filter(n => state.chapter.encounteredNpcIds.includes(n.npcId)).map(n => n.nameJa).join('・')}）</li>
            <li>✓ 冒険値: {state.adventureXp}</li>
            <li>🏮 次のArea: 次の町（Chapter 2）は今後のリリースで開きます</li>
          </ul>
          <p className="text-xs text-gray-500 mb-3">
            学んだことばは時間がたつと霧がかかります。数日後にマップへ戻ると、復習Quest「再会」でまた晴らせます（場所や記録は失われません）。
          </p>
          <button type="button" onClick={() => returnToMap()}
            className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">マップへ戻る</button>
        </div>
      )}

      {screen.kind === 'reviewLetter' && (
        <div className="max-w-2xl bg-white rounded-2xl border border-violet-200 p-4">
          <div className="flex items-start gap-2 mb-3">
            <div className="w-10 shrink-0"><NpcHanaSprite pose="talk" /></div>
            <div className="p-3 bg-violet-50 rounded-xl text-sm text-gray-800 flex-1">
              <p className="font-bold text-violet-800 mb-1">{REVIEW_REUNION.titleJa}</p>
              <p>{REVIEW_REUNION.letterJa}</p>
              <p className="text-xs text-gray-400 mt-1">{REVIEW_REUNION.letterZh}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">霞んでいることば: {reviewKeys.length}個。別の文の中で確かめます。元のQuestや場所の記録は変わりません。</p>
          <button type="button"
            onClick={() => setScreen({ kind: 'reviewCheck', keys: reviewKeys.slice(0, 6), index: 0, built: [], wrongOnce: false })}
            className="w-full min-h-12 bg-violet-600 text-white rounded-2xl font-bold text-sm">確かめに行く</button>
          <button type="button" onClick={() => setScreen({ kind: 'map' })}
            className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">あとにする</button>
        </div>
      )}

      {screen.kind === 'reviewCheck' && (() => {
        const key = screen.keys[screen.index];
        if (key.startsWith('rule:')) {
          const rule = ruleById.get(key.slice(5))!;
          const mission = CHAPTER1_QUESTS.flatMap(q => q.grammarRequirements ?? []).find(g => g.ruleId === rule.id)!;
          const question = questionById.get(mission.questionIds[0])!;
          return (
            <div className="max-w-2xl bg-white rounded-2xl border border-violet-200 p-4">
              <p className="text-[11px] text-violet-500 font-bold mb-2">再会 {screen.index + 1}／{screen.keys.length}・文法「{rule.titleJa}」</p>
              <p className="text-sm font-bold text-gray-800 mb-1">{question.promptJa}</p>
              {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">「{rule.titleJa}」を思い出してもう一度。</p>}
              <div className="grid grid-cols-1 gap-1.5">
                {(question.choices ?? []).map((c, i) => (
                  <button key={c} type="button" onClick={() => answerReview(screen, i === question.answerIndex)}
                    className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-violet-400">{c}</button>
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
            <p className="text-[11px] text-violet-500 font-bold mb-2">再会 {screen.index + 1}／{screen.keys.length}・{item.displayForm}</p>
            <p className="text-sm font-bold text-gray-800 mb-1 whitespace-pre-line">{aq.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{aq.promptZh}</p>
            {screen.wrongOnce && <p className="text-xs text-rose-600 mb-2">ゆっくりで大丈夫。もう一度考えてみましょう。</p>}
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
                    className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-violet-400">{opt}</button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {screen.kind === 'reviewDone' && (
        <div className="max-w-2xl bg-white rounded-2xl border border-violet-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8"><NpcHanaSprite pose="happy" /></div>
            <h3 className="text-base font-bold text-violet-700">再会できました（{screen.count}個）</h3>
          </div>
          <div className="p-3 bg-violet-50 rounded-xl text-sm text-gray-800 mb-2">
            <p>{REVIEW_REUNION.outcomeJa}</p>
            <p className="text-xs text-gray-400 mt-1">{REVIEW_REUNION.outcomeZh}</p>
          </div>
          <p className="text-xs text-amber-700 mb-3">冒険値 +{REVIEW_REUNION.adventureXpReward}（1日1回）。マップの霧が晴れています。</p>
          <button type="button" onClick={() => returnToMap('ことばの霧が晴れました。')}
            className="w-full min-h-12 bg-violet-600 text-white rounded-2xl font-bold text-sm">マップで確かめる</button>
        </div>
      )}
    </div>
  );
};

export default Chapter1AdventurePanel;

// RPG Chapter 1「はじまりの町」Vertical Slice（labPreview限定・lazy chunk）。
// 学習の進捗＝物語の進行: Quest学習の完了だけが霧を晴らし、道・人物・Storyを解放する。
// 操作ゲームではない（移動は自動演出）。学習内容・所要時間・完了条件・完了後の変化を常に明示する。
// 進捗はsandbox専用キーのみ（通常learnerの学習記録には読み書きしない）。
import { useMemo, useState } from 'react';
import {
  CHAPTER1_LOCATIONS, CHAPTER1_NPCS, CHAPTER1_QUESTS, CHAPTER1_STORY_BEATS,
  CHAPTER1_FINALE_STEPS, chapter1QuestById, type Chapter1Quest,
} from '../../../lib/aiLesson/course/rpg/chapter1Data';
import {
  loadAdventureState, startQuest, recordLearningResult,
  completeQuest, deriveLocationFog, reviewNeededItems, resetAdventureState,
  type AdventureState,
} from '../../../lib/aiLesson/course/rpg/adventureState';
import { allVocabularyItems } from '../../../lib/aiLesson/course/foundationVocabBank';
import type { FoundationItem } from '../../../lib/aiLesson/course/foundationTypes';
import { HeroSprite, ShokoSprite, NpcHanaSprite, NpcGenSprite, LanternMarker, TownMapBase } from './pixelAssets';
import { FOG_FILL } from './fogStyles';

type Screen =
  | { kind: 'map' }
  | { kind: 'questIntro'; questId: string }
  | { kind: 'learning'; questId: string; itemIndex: number; wrongOnce: boolean }
  | { kind: 'finale'; questId: string; stepIndex: number; wrongOnce: boolean }
  | { kind: 'questComplete'; questId: string; xpGained: number }
  | { kind: 'chapterComplete' };

interface Props { onBack: () => void }

const NPC_SPRITE: Record<string, (p: { className?: string }) => React.ReactElement> = {
  'c1-npc-shoko': ShokoSprite, 'c1-npc-hana': NpcHanaSprite, 'c1-npc-gen': NpcGenSprite,
};

/** 場所ごとのFog領域（マップグリッド48x36上の矩形） */
const FOG_REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'c1-town-gate': { x: 0, y: 22, w: 13, h: 14 },
  'c1-main-street': { x: 12, y: 15, w: 15, h: 16 },
  'c1-plaza': { x: 24, y: 8, w: 12, h: 12 },
  'c1-station-front': { x: 35, y: 0, w: 13, h: 13 },
};

/** 意味チェックの選択肢（決定的・シャッフル乱数なし）。正解＋同章の別Item 3語 */
const buildOptions = (item: FoundationItem, pool: FoundationItem[]): string[] => {
  const distractors = pool.filter(p => p.id !== item.id && p.meaningZh !== item.meaningZh).slice(0, 3)
    .map(p => p.meaningZh);
  const opts = [item.meaningZh, ...distractors];
  return [...opts].sort((a, b) => a.localeCompare(b, 'zh'));
};

// render中にDate.now()を呼ばないための起動時刻とhandler専用時計
// （fog表示は操作のたびにnowMs stateで更新。renderからclockNowは呼ばない）
const initialNowMs = Date.now();
const clockNow = () => Date.now();

export const Chapter1AdventurePanel = ({ onBack }: Props) => {
  const [nowMs, setNowMs] = useState(initialNowMs);
  const now = () => { const t = clockNow(); setNowMs(t); return t; };
  const [state, setState] = useState<AdventureState>(() => loadAdventureState(initialNowMs));
  const [screen, setScreen] = useState<Screen>({ kind: 'map' });
  const [simpleMode, setSimpleMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  });
  const itemById = useMemo(() => new Map(allVocabularyItems().map(i => [i.id, i])), []);
  const chapterPool = useMemo(() => {
    const ids = CHAPTER1_QUESTS.flatMap(q => q.learningItemIds);
    return ids.map(id => itemById.get(id)).filter((x): x is FoundationItem => !!x);
  }, [itemById]);

  const nextQuest: Chapter1Quest | null = state.chapter.currentQuestId
    ? chapter1QuestById(state.chapter.currentQuestId) ?? null : null;
  const reviewIds = reviewNeededItems(state, nowMs);
  const chapterDone = state.chapter.completedAtMs !== null;

  const beginQuest = (q: Chapter1Quest) => {
    setState(startQuest(state, q.questId, now()));
    setScreen(simpleMode ? { kind: 'learning', questId: q.questId, itemIndex: 0, wrongOnce: false }
      : { kind: 'questIntro', questId: q.questId });
  };

  const answerLearning = (questId: string, item: FoundationItem, choice: string) => {
    const correct = choice === item.meaningZh;
    const next = recordLearningResult(state, questId, item.id, correct, now());
    setState(next);
    if (!correct) {
      setScreen(s => s.kind === 'learning' ? { ...s, wrongOnce: true } : s);
      return;
    }
    const quest = chapter1QuestById(questId)!;
    const idx = (screen.kind === 'learning' ? screen.itemIndex : 0) + 1;
    if (idx < quest.learningItemIds.length) {
      setScreen({ kind: 'learning', questId, itemIndex: idx, wrongOnce: false });
    } else if (quest.isChapterFinale) {
      setScreen({ kind: 'finale', questId, stepIndex: 0, wrongOnce: false });
    } else {
      const done = completeQuest(next, questId, now());
      setState(done);
      setScreen({ kind: 'questComplete', questId, xpGained: quest.adventureXpReward });
    }
  };

  const answerFinale = (questId: string, stepIndex: number, choice: string) => {
    const step = CHAPTER1_FINALE_STEPS[stepIndex];
    if (choice !== step.correctJa) {
      setScreen(s => s.kind === 'finale' ? { ...s, wrongOnce: true } : s);
      return;
    }
    if (stepIndex + 1 < CHAPTER1_FINALE_STEPS.length) {
      setScreen({ kind: 'finale', questId, stepIndex: stepIndex + 1, wrongOnce: false });
      return;
    }
    const quest = chapter1QuestById(questId)!;
    const done = completeQuest(state, questId, now(), true);
    setState(done);
    setScreen({ kind: 'questComplete', questId, xpGained: quest.adventureXpReward });
  };

  const heroLoc = useMemo(() => {
    const site = nextQuest?.siteLocationId
      ?? CHAPTER1_QUESTS[CHAPTER1_QUESTS.length - 1].siteLocationId;
    return CHAPTER1_LOCATIONS.find(l => l.locationId === site) ?? CHAPTER1_LOCATIONS[0];
  }, [nextQuest]);

  const transitionStyle = reducedMotion ? undefined : { transition: 'left 1.1s ease, top 1.1s ease' };

  return (
    <div className="max-w-2xl mx-auto">
      {/* ヘッダー: 冒険値はJLPT・習得度ではない（§7） */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <button type="button" onClick={onBack} className="min-h-10 text-sm text-gray-500 underline">
          ← 教材一覧へ戻る
        </button>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg" title="冒険の継続・挑戦の量。日本語の習得度ではありません">
            冒険値 {state.adventureXp}
          </span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={simpleMode} onChange={(e) => setSimpleMode(e.target.checked)} />
            シンプル学習モード
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
            動きを減らす
          </label>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        内部プレビュー（labPreview限定・sandbox保存）。冒険の進行はこの画面専用で、通常の学習記録には影響しません。
      </p>

      {screen.kind === 'map' && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Chapter 1: はじまりの町（仮称）</h2>
          <p className="text-xs text-gray-500 mb-2">日本語を学ぶと霧が晴れ、行ける場所と話せる人が増えていきます。</p>
          {reviewIds.length > 0 && (
            <div className="mb-2 p-2 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-800">
              🏮 {reviewIds.length}語のことばに、もう一度会いに行きませんか？（復習しても場所や記録は失われません）
              <span className="block text-violet-500">有{reviewIds.length}个词在等你再会（复习不会失去任何进度）</span>
            </div>
          )}
          {/* 見下ろしマップ（オリジナル・操作歩行なし。主人公は学習で自動移動） */}
          <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200 bg-[#9db877]" style={{ aspectRatio: '4/3' }}>
            <svg viewBox="0 0 48 36" className="absolute inset-0 w-full h-full" shapeRendering="crispEdges" role="img" aria-label="はじまりの町の見下ろしマップ">
              <TownMapBase />
              {/* Fog（場所ごとに導出。解放済みは学習の鮮度で変化・再ロックはしない） */}
              {CHAPTER1_LOCATIONS.map(loc => {
                const discovered = state.chapter.discoveredLocationIds.includes(loc.locationId);
                const fog = discovered ? deriveLocationFog(state, loc.locationId, nowMs) : 'foggy';
                const f = FOG_FILL[fog];
                const r = FOG_REGIONS[loc.locationId];
                return f.opacity > 0 ? (
                  <rect key={loc.locationId} x={r.x} y={r.y} width={r.w} height={r.h}
                    fill={f.fill} opacity={f.opacity} rx={1.5} />
                ) : null;
              })}
            </svg>
            {/* NPC（出会い済みのみ表示） */}
            {CHAPTER1_NPCS.filter(n => state.chapter.encounteredNpcIds.includes(n.npcId)).map(n => {
              const loc = CHAPTER1_LOCATIONS.find(l => l.locationId === n.locationId)!;
              const S = NPC_SPRITE[n.npcId];
              return (
                <div key={n.npcId} className="absolute w-[7%]" title={`${n.nameJa}（${n.roleJa}）`}
                  style={{ left: `${loc.x + 5}%`, top: `${loc.y - 8}%` }}>
                  <S />
                </div>
              );
            })}
            {/* 主人公（現在Questの舞台に自動配置・CSS transitionで自動移動演出） */}
            <div className="absolute w-[7%]" style={{ left: `${heroLoc.x - 3}%`, top: `${heroLoc.y - 4}%`, ...transitionStyle }}
              title="主人公（あなた）">
              <HeroSprite />
            </div>
            {/* 次Questの目印（ことばの灯） */}
            {nextQuest && (() => {
              const site = CHAPTER1_LOCATIONS.find(l => l.locationId === nextQuest.siteLocationId);
              return site ? (
                <div className={`absolute w-[4.5%] ${reducedMotion ? '' : 'animate-pulse'}`}
                  style={{ left: `${site.x + 1}%`, top: `${site.y - 14}%` }} title="次のQuest">
                  <LanternMarker />
                </div>
              ) : null;
            })()}
            {/* 場所ラベル（解放済みのみ読める） */}
            {CHAPTER1_LOCATIONS.map(loc => (
              <span key={loc.locationId}
                className="absolute -translate-x-1/2 text-[10px] px-1 rounded bg-white/80 text-gray-700"
                style={{ left: `${loc.x}%`, top: `${loc.y + 6}%` }}>
                {state.chapter.discoveredLocationIds.includes(loc.locationId) ? loc.nameJa : '？？？'}
              </span>
            ))}
          </div>

          {/* 第一CTAは一つ（§10）: 次のQuest */}
          {nextQuest && !chapterDone && (
            <button type="button" onClick={() => beginQuest(nextQuest)}
              className="w-full mt-3 min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">
              Quest {nextQuest.order}: {nextQuest.titleJa} を始める（約{nextQuest.estimatedMinutes}分）
            </button>
          )}
          {chapterDone && (
            <button type="button" onClick={() => setScreen({ kind: 'chapterComplete' })}
              className="w-full mt-3 min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
              Chapter 1 完了記録を見る
            </button>
          )}
          {/* 完了済みQuestの再確認（記録は失われない） */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
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
          <button type="button"
            onClick={() => { if (window.confirm('冒険の進行（この画面のsandbox保存のみ）を最初からやり直しますか？')) { setState(resetAdventureState(now())); setScreen({ kind: 'map' }); } }}
            className="mt-3 min-h-10 text-[11px] text-gray-400 underline">冒険を最初からやり直す（sandboxのみ初期化）</button>
        </div>
      )}

      {screen.kind === 'questIntro' && (() => {
        const q = chapter1QuestById(screen.questId)!;
        return (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-indigo-500 font-bold mb-1">Quest {q.order}</p>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{q.titleJa} <span className="text-xs text-gray-400 font-normal">{q.titleZh}</span></h3>
            <div className="p-3 bg-slate-50 rounded-xl text-sm text-gray-700 mb-3">
              <p>{q.storyIntroJa}</p>
              <p className="text-xs text-gray-400 mt-1">{q.storyIntroZh}</p>
            </div>
            {/* 学習内容の明示（RPG用語で隠さない・§10） */}
            <dl className="text-sm text-gray-800 space-y-1.5 mb-4">
              <div><dt className="inline font-bold">学ぶこと: </dt><dd className="inline">{q.learnGoalJa}</dd></div>
              <div><dt className="inline font-bold">所要時間: </dt><dd className="inline">約{q.estimatedMinutes}分</dd></div>
              <div><dt className="inline font-bold">完了条件: </dt><dd className="inline">{q.completionConditionJa}</dd></div>
              <div><dt className="inline font-bold">完了すると: </dt><dd className="inline">{q.storyOutcomeJa}</dd></div>
            </dl>
            <button type="button" onClick={() => setScreen({ kind: 'learning', questId: q.questId, itemIndex: 0, wrongOnce: false })}
              className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">学習を始める</button>
            <button type="button" onClick={() => setScreen({ kind: 'map' })}
              className="w-full min-h-10 mt-1 text-xs text-gray-400 underline">マップへ戻る</button>
          </div>
        );
      })()}

      {screen.kind === 'learning' && (() => {
        const q = chapter1QuestById(screen.questId)!;
        const item = itemById.get(q.learningItemIds[screen.itemIndex])!;
        const options = buildOptions(item, chapterPool);
        return (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-gray-400 mb-2">Quest {q.order}・ことば {screen.itemIndex + 1}／{q.learningItemIds.length}</p>
            <div className="mb-3 p-3 bg-slate-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">{item.displayForm} <span className="text-sm text-gray-500 font-normal">{item.readingKana}</span></p>
              <p className="text-sm text-gray-700 mt-1">{item.exampleJa}</p>
              <p className="text-xs text-gray-400">{item.exampleZh}</p>
              {item.usageNoteZh && <p className="text-[11px] text-amber-700 mt-1">💡 {item.usageNoteZh}</p>}
            </div>
            <p className="text-sm font-bold text-gray-800 mb-2">「{item.displayForm}」の意味は？</p>
            {screen.wrongOnce && (
              <p className="text-xs text-rose-600 mb-2">もう一度。正しい意味を例文から考えてみましょう。（再想一想，从例句找线索）</p>
            )}
            <div className="grid grid-cols-1 gap-1.5">
              {options.map(opt => (
                <button key={opt} type="button" onClick={() => answerLearning(q.questId, item, opt)}
                  className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-indigo-400">
                  {opt}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setScreen({ kind: 'map' })}
              className="w-full min-h-10 mt-3 text-xs text-gray-400 underline">中断してマップへ戻る（進み具合は保存されます）</button>
          </div>
        );
      })()}

      {screen.kind === 'finale' && (() => {
        const step = CHAPTER1_FINALE_STEPS[screen.stepIndex];
        return (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-[11px] text-indigo-500 font-bold mb-2">章末: 駅前の会話 {screen.stepIndex + 1}／{CHAPTER1_FINALE_STEPS.length}</p>
            <div className="flex items-start gap-2 mb-3">
              <div className="w-10 shrink-0"><NpcGenSprite /></div>
              <div className="p-3 bg-slate-50 rounded-xl text-sm text-gray-800 flex-1">
                <p>{step.npcLineJa}</p>
                <p className="text-xs text-gray-400 mt-0.5">{step.npcLineZh}</p>
              </div>
            </div>
            {screen.wrongOnce && (
              <p className="text-xs text-rose-600 mb-2">その返事だと伝わらなかったようです。もう一度選んでみましょう。</p>
            )}
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
          <div className="bg-white rounded-2xl border border-emerald-200 p-4">
            <h3 className="text-lg font-bold text-emerald-700 mb-1">Quest {q.order} 完了！</h3>
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
                <div className="w-9 shrink-0">{NPC_SPRITE[n.npcId]({})}</div>
                <div className="text-sm">
                  <p className="font-bold text-gray-800">{n.nameJa} <span className="text-[10px] text-gray-400">{n.roleJa}</span></p>
                  <p className="text-xs text-gray-600">「{n.greetingJa}」</p>
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => setScreen(chapter1QuestById(screen.questId)!.isChapterFinale ? { kind: 'chapterComplete' } : { kind: 'map' })}
              className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm mt-1">
              {chapter1QuestById(screen.questId)!.isChapterFinale ? 'Chapter 1 の記録へ' : 'マップへ（主人公が次の場所へ進みます）'}
            </button>
          </div>
        );
      })()}

      {screen.kind === 'chapterComplete' && (
        <div className="bg-white rounded-2xl border border-amber-200 p-4">
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
            学んだことばは時間がたつと霧がかかります。翌日・3日後・7日後にマップへ戻ると、復習Questとして再会できます（場所や記録は失われません）。
          </p>
          <button type="button" onClick={() => setScreen({ kind: 'map' })}
            className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">マップへ戻る</button>
        </div>
      )}
    </div>
  );
};

export default Chapter1AdventurePanel;

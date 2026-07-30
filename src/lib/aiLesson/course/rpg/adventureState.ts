// RPG Adventure状態runtime（labPreview sandbox限定）。
//
// 設計上の不変条件（adventureState.test.ts で機械固定）:
// 1. RPG層は学習エンジンをread onlyで扱う。本moduleは習得状態・復習Repository・
//    週進行・会話履歴・既存XPのどのwriterもimportしない（禁止語リストはtest側が保持）。
// 2. 保存先は sandbox 専用キーのみ。通常learner系キー（learner/progress/pending/resume/n2Recent）
//    には一切触れない。
// 3. World Unlock（訪問・完了・出会い・Story）は加算のみで失われない。
// 4. Fogは保存値ではなく学習記録から毎回導出する。Fogが濃くなっても完了・解放は取り消さない。
// 5. Adventure XPはQuest単位の台帳で冪等（reload・再実行で二重加算しない）。
// 6. XPはJapanese Masteryではない（表示・判定に使わない）。
import type { KVStorage } from '../n2Recent';
import { CHAPTER1_ID } from './chapter1Data';
import { CHAPTERS, chapterById, questById, type ChapterDef } from './chapterRegistry';

/** sandbox専用キー。learner系キーとは別namespace */
export const RPG_SANDBOX_KEY = 'kawabado.aiCourse.v1.rpgLabSandbox';

/**
 * 章ごとの保存キー（2026-07-31 多章対応）。
 * Chapter 1 は従来キーのまま＝既存learnerの進行を失わない（migration不要）。
 * 2章以降は章IDを含む別キー。学習記録・XP台帳は章ごとに独立して保持する。
 */
export const chapterStorageKey = (chapterId: string): string =>
  chapterId === CHAPTER1_ID ? RPG_SANDBOX_KEY : `${RPG_SANDBOX_KEY}.${chapterId}`;

export type FogLevel = 'clear' | 'light_fog' | 'foggy' | 'review_needed';

export interface SandboxLearningRecord {
  itemId: string;
  correctCount: number;
  lastCorrectAtMs: number | null;
  lastAnswerCorrect: boolean;
}

export interface QuestProgress {
  questId: string;
  startedAtMs: number | null;
  completedAtMs: number | null;
  /** 充足済みの教材ID（実在IDのみ・questのlearningItemIdsの部分集合） */
  fulfilledItemIds: string[];
  rewardClaimedAtMs: number | null;
}

export interface ChapterProgress {
  chapterId: string;
  discoveredAtMs: number;
  completedAtMs: number | null;
  currentQuestId: string | null;
  unlockedQuestIds: string[];
  completedQuestIds: string[];
  encounteredNpcIds: string[];
  discoveredLocationIds: string[];
  seenStoryBeatIds: string[];
}

export interface AdventureState {
  version: 1;
  chapter: ChapterProgress;
  quests: Record<string, QuestProgress>;
  learning: Record<string, SandboxLearningRecord>;
  adventureXp: number;
  /** XP冪等台帳: 付与済みsource（questId等）。二重加算防止 */
  xpLedger: Record<string, number>;
  /** labPreview検証用の時間シミュレーションoffset（sandbox限定。learner時計には影響しない） */
  simulatedOffsetMs: number;
}

const defaultStorage = (): KVStorage | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** 章定義（stateのchapterIdから引く。未登録IDはChapter 1へフォールバックしない=空章を作らない） */
const chapterOf = (chapterId: string): ChapterDef => {
  const c = chapterById(chapterId);
  if (!c) throw new Error(`unknown chapter: ${chapterId}`);
  return c;
};

export const emptyAdventureState = (nowMs: number, chapterId: string = CHAPTER1_ID): AdventureState => {
  const chapter = chapterOf(chapterId);
  return {
    version: 1,
    chapter: {
      chapterId, discoveredAtMs: nowMs, completedAtMs: null,
      currentQuestId: chapter.quests[0].questId, unlockedQuestIds: [chapter.quests[0].questId],
      completedQuestIds: [], encounteredNpcIds: [], discoveredLocationIds: [chapter.startLocationId],
      seenStoryBeatIds: [],
    },
    quests: {}, learning: {}, adventureXp: 0, xpLedger: {}, simulatedOffsetMs: 0,
  };
};

export const loadAdventureState = (nowMs: number, storage: KVStorage | null = defaultStorage(),
  chapterId: string = CHAPTER1_ID): AdventureState => {
  if (!storage) return emptyAdventureState(nowMs, chapterId);
  try {
    const raw = storage.getItem(chapterStorageKey(chapterId));
    if (!raw) return emptyAdventureState(nowMs, chapterId);
    const parsed = JSON.parse(raw) as AdventureState;
    if (parsed?.version !== 1 || parsed.chapter?.chapterId !== chapterId) return emptyAdventureState(nowMs, chapterId);
    return { ...parsed, simulatedOffsetMs: parsed.simulatedOffsetMs ?? 0 };
  } catch { return emptyAdventureState(nowMs, chapterId); }
};

const save = (state: AdventureState, storage: KVStorage | null): AdventureState => {
  try { storage?.setItem(chapterStorageKey(state.chapter.chapterId), JSON.stringify(state)); } catch { /* private mode等は無視 */ }
  return state;
};

const addUnique = (list: string[], items: string[]): string[] =>
  [...list, ...items.filter(i => !list.includes(i))];

/** Quest開始（解放済みQuestのみ）。未解放は無視して現状態を返す */
export const startQuest = (state: AdventureState, questId: string, nowMs: number,
  storage: KVStorage | null = defaultStorage()): AdventureState => {
  if (!state.chapter.unlockedQuestIds.includes(questId)) return state;
  const q = state.quests[questId] ?? { questId, startedAtMs: null, completedAtMs: null, fulfilledItemIds: [], rewardClaimedAtMs: null };
  const next: AdventureState = {
    ...state,
    chapter: { ...state.chapter, currentQuestId: questId },
    quests: { ...state.quests, [questId]: { ...q, startedAtMs: q.startedAtMs ?? nowMs } },
  };
  return save(next, storage);
};

/** Questの全要件キー（語彙ID＋文法rule:キー）。questIdは全章で一意（registry横断で解決） */
export const questRequirementKeys = (questId: string): string[] => {
  const quest = questById(questId)?.quest;
  if (!quest) return [];
  return [...quest.learningItemIds, ...(quest.grammarRequirements ?? []).map(g => `rule:${g.ruleId}`)];
};

/** sandbox学習結果を記録（正解でQuest要件を充足）。実在Quest対象キーのみ充足に数える */
export const recordLearningResult = (state: AdventureState, questId: string, itemId: string,
  correct: boolean, nowMs: number, storage: KVStorage | null = defaultStorage()): AdventureState => {
  const quest = questById(questId)?.quest;
  if (!quest) return state;
  const rec = state.learning[itemId] ?? { itemId, correctCount: 0, lastCorrectAtMs: null, lastAnswerCorrect: false };
  const learning = {
    ...state.learning,
    [itemId]: {
      ...rec,
      correctCount: rec.correctCount + (correct ? 1 : 0),
      lastCorrectAtMs: correct ? nowMs : rec.lastCorrectAtMs,
      lastAnswerCorrect: correct,
    },
  };
  const qp = state.quests[questId] ?? { questId, startedAtMs: nowMs, completedAtMs: null, fulfilledItemIds: [], rewardClaimedAtMs: null };
  const fulfilled = correct && questRequirementKeys(questId).includes(itemId)
    ? addUnique(qp.fulfilledItemIds, [itemId]) : qp.fulfilledItemIds;
  const next: AdventureState = {
    ...state, learning,
    quests: { ...state.quests, [questId]: { ...qp, fulfilledItemIds: fulfilled } },
  };
  return save(next, storage);
};

/** Quest要件がすべて充足済みか（章末Questは場面会話成立も必要 → finaleCleared引数） */
export const questRequirementsMet = (state: AdventureState, questId: string, finaleCleared = false): boolean => {
  const quest = questById(questId)?.quest;
  if (!quest) return false;
  const qp = state.quests[questId];
  if (!qp) return false;
  const itemsDone = questRequirementKeys(questId).every(id => qp.fulfilledItemIds.includes(id));
  return quest.isChapterFinale ? itemsDone && finaleCleared : itemsDone;
};

/**
 * Quest完了。学習要件未充足なら状態を変えない（演出からmasteryを作らない・スキップで完了しない）。
 * XPはxpLedgerで冪等。Unlockは加算のみ。次Questを解放。
 */
export const completeQuest = (state: AdventureState, questId: string, nowMs: number,
  finaleCleared = false, storage: KVStorage | null = defaultStorage()): AdventureState => {
  const hit = questById(questId);
  if (!hit || !questRequirementsMet(state, questId, finaleCleared)) return state;
  const quest = hit.quest;
  const qp = state.quests[questId];
  const ledgerKey = `quest:${questId}`;
  const alreadyPaid = ledgerKey in state.xpLedger;
  const nextOrder = quest.order + 1;
  const nextQuest = hit.chapter.quests.find(q => q.order === nextOrder);
  const chapter: ChapterProgress = {
    ...state.chapter,
    completedQuestIds: addUnique(state.chapter.completedQuestIds, [questId]),
    unlockedQuestIds: addUnique(state.chapter.unlockedQuestIds, nextQuest ? [nextQuest.questId] : []),
    encounteredNpcIds: addUnique(state.chapter.encounteredNpcIds, quest.unlocks.npcIds),
    discoveredLocationIds: addUnique(state.chapter.discoveredLocationIds, quest.unlocks.locationIds),
    seenStoryBeatIds: addUnique(state.chapter.seenStoryBeatIds, quest.unlocks.storyBeatIds),
    currentQuestId: nextQuest ? nextQuest.questId : null,
    completedAtMs: quest.isChapterFinale ? (state.chapter.completedAtMs ?? nowMs) : state.chapter.completedAtMs,
  };
  const next: AdventureState = {
    ...state, chapter,
    quests: { ...state.quests, [questId]: { ...qp, completedAtMs: qp.completedAtMs ?? nowMs, rewardClaimedAtMs: qp.rewardClaimedAtMs ?? nowMs } },
    adventureXp: alreadyPaid ? state.adventureXp : state.adventureXp + quest.adventureXpReward,
    xpLedger: alreadyPaid ? state.xpLedger : { ...state.xpLedger, [ledgerKey]: quest.adventureXpReward },
  };
  return save(next, storage);
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fog導出（保存しない）。学習記録の鮮度から毎回計算する。
 * 未学習=foggy。正解から2日以内=clear、5日以内=light_fog、10日以内=foggy、それ以降=review_needed。
 * ※ Unlock履歴とは独立：review_neededでも完了Quest・出会い・場所は失われない。
 */
export const deriveItemFog = (state: AdventureState, itemId: string, nowMs: number): FogLevel => {
  const rec = state.learning[itemId];
  if (!rec?.lastCorrectAtMs) return 'foggy';
  const age = nowMs - rec.lastCorrectAtMs;
  if (age < 2 * DAY_MS) return 'clear';
  if (age < 5 * DAY_MS) return 'light_fog';
  if (age < 10 * DAY_MS) return 'foggy';
  return 'review_needed';
};

/** 場所のFog: その場所を解放したQuestの教材群のうち最も濃いFog。未解放はfoggy固定 */
export const deriveLocationFog = (state: AdventureState, locationId: string, nowMs: number): FogLevel => {
  if (!state.chapter.discoveredLocationIds.includes(locationId)) return 'foggy';
  const chapter = chapterOf(state.chapter.chapterId);
  const quests = chapter.quests.filter(q =>
    q.unlocks.locationIds.includes(locationId) || (locationId === chapter.startLocationId && q.order === 1));
  const order: FogLevel[] = ['clear', 'light_fog', 'foggy', 'review_needed'];
  let worst: FogLevel = 'clear';
  for (const q of quests) {
    if (!state.chapter.completedQuestIds.includes(q.questId)) continue;
    for (const id of q.learningItemIds) {
      const f = deriveItemFog(state, id, nowMs);
      if (order.indexOf(f) > order.indexOf(worst)) worst = f;
    }
  }
  return worst;
};

/** review_needed のItem一覧（復習Quest導線用・罰ではなく再会として提示する） */
export const reviewNeededItems = (state: AdventureState, nowMs: number): string[] =>
  Object.values(state.learning)
    .filter(r => r.lastCorrectAtMs && deriveItemFog(state, r.itemId, nowMs) === 'review_needed')
    .map(r => r.itemId);

/** labPreview検証用: 時間を進める（sandboxのみ。Unlock・完了は変化しない） */
export const advanceSimulatedTime = (state: AdventureState, days: number,
  storage: KVStorage | null = defaultStorage()): AdventureState =>
  save({ ...state, simulatedOffsetMs: state.simulatedOffsetMs + days * DAY_MS }, storage);

/** 復習「再会」の1語再確認（正解でlastCorrectAtMsが更新→Clarityが晴れる） */
export const recordReviewResult = (state: AdventureState, itemId: string, correct: boolean,
  nowMs: number, storage: KVStorage | null = defaultStorage()): AdventureState => {
  const rec = state.learning[itemId];
  if (!rec) return state; // 学習履歴のない語は復習対象外
  const next: AdventureState = {
    ...state,
    learning: { ...state.learning, [itemId]: {
      ...rec, correctCount: rec.correctCount + (correct ? 1 : 0),
      lastCorrectAtMs: correct ? nowMs : rec.lastCorrectAtMs, lastAnswerCorrect: correct } },
  };
  return save(next, storage);
};

/**
 * 復習Quest完了のXP付与（1日1回・冪等）。完了済みQuest・Unlockは一切変更しない。
 * masteryではなく冒険継続の記録としてのXP。
 */
export const claimReviewReward = (state: AdventureState, rewardXp: number, nowMs: number,
  storage: KVStorage | null = defaultStorage()): AdventureState => {
  const dayBucket = Math.floor(nowMs / DAY_MS);
  const key = `review:${dayBucket}`;
  if (key in state.xpLedger) return state;
  return save({ ...state, adventureXp: state.adventureXp + rewardXp,
    xpLedger: { ...state.xpLedger, [key]: rewardXp } }, storage);
};

/** sandboxリセット（labPreview内の「最初からやり直す」用） */
export const resetAdventureState = (nowMs: number, storage: KVStorage | null = defaultStorage(),
  chapterId: string = CHAPTER1_ID): AdventureState =>
  save(emptyAdventureState(nowMs, chapterId), storage);

/** 全章の冒険XP合計（成長画面の表示用・read only） */
export const totalAdventureXp = (nowMs: number, storage: KVStorage | null = defaultStorage()): number => {
  let sum = 0;
  for (const c of CHAPTERS) sum += loadAdventureState(nowMs, storage, c.chapterId).adventureXp;
  return sum;
};

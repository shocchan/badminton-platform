// 個人復習パック（自分の書いた文章から復習する）。純関数層。
//
// 何のためにあるか（2026-08-24 CEO要望）:
//   授業で生徒が書いた作文（日記・スピーチ原稿）に出てきた表現・漢字の読みを、
//   **その人の文章のまま**復習できるようにする。市販教材の一般文ではなく、
//   本人が実際に使った文なので、覚え直しが会話にそのまま乗る。
//
// なぜ冒険（route/mastery/準備度）に混ぜないのか:
//   冒険は「全員に同じ基準で測る」ことで準備度が意味を持つ設計になっている。
//   個人ごとに違う教材でmasteryを動かすと、その基準が人によって別物になり、
//   準備度・地図の攻略が嘘になる（原則13）。
//   だから個人パックは **読み書きする場所を完全に分ける**:
//     - 書き込むのは personalPacks（先生発行）と personalPack（本人の記録）だけ
//     - route / mastery / skills / xp / streak / mockLog / 間違えた問題ノート には触れない
//   結果として、パックを何度やっても冒険の進み方は1ミリも変わらない。
//
// 運用（答案用紙・面接特訓と同じ形）:
//   先生が learner ごとに JSON を発行する（scripts/ai-course/issue-personal-pack.mjs）。
//   アプリ側に個人の文章は一切ハードコードしない＝生徒が増えてもコード変更は要らない。
//
// 誠実さの約束:
//   - 選択肢問題として出せるもの（読み・意味・空欄）だけを出題する。
//     AIが自由記述を採点する仕組みは持たない（判定材料が無いのに判定しない）
//   - 「できた」は連続正解の実測だけで決める。次の復習日はその実測から出す
import { seededFisherYates } from '../advChoiceOrder';
import type { AdventureV2Profile } from '../advTypes';

/**
 * 出題の型。
 * - reading: 漢字語の読み（例「船橋」→ ふなばし）
 * - meaning: 表現の意味（中国語の意味から日本語表現を選ぶ）
 * - cloze:   本人の文の空欄に入る表現を選ぶ
 */
export type PersonalItemKind = 'reading' | 'meaning' | 'cloze';

export const PERSONAL_ITEM_KINDS: PersonalItemKind[] = ['reading', 'meaning', 'cloze'];

/** 選択肢の数（正解1＋ダミー）。多すぎると読む負担が勝つので4択を基本にする */
export const MIN_DISTRACTORS = 2;
export const MAX_DISTRACTORS = 5;
export const MAX_ITEMS_PER_PACK = 200;

export interface PersonalItem {
  /** pack内で一意（英数字・ハイフン・アンダースコア） */
  id: string;
  kind: PersonalItemKind;
  /**
   * 問題文。本人の文章の一行をそのまま使う。
   * cloze は空欄記号 `＿＿` をちょうど1つ含む（含まないパックは発行時に弾く）
   */
  promptJa: string;
  /** 何を問うているか（reading: 漢字語 / meaning・cloze: 表現）。画面の見出しに出す */
  target: string;
  /** 正解（reading: ひらがなの読み / meaning・cloze: 表現そのもの） */
  answer: string;
  /** ダミーの選択肢。正解と混ぜてシャッフルする */
  distractors: string[];
  /** 中国語の意味（あれば出す。無ければ出さない＝機械翻訳を作らない） */
  meaningZh?: string;
  /** 先生の一言（覚え方・使い方の注意） */
  noteJa?: string;
  noteZh?: string;
}

/** 本人の文章そのもの（読み返す用）。出題とは別に、いつでも全文を読める */
export interface PersonalPassage {
  id: string;
  titleJa: string;
  titleZh?: string;
  /** 本文（改行そのまま） */
  textJa: string;
}

/** 1つの復習パック＝1回ぶんの授業／1本の作文 */
export interface PersonalPack {
  packId: string;
  titleJa: string;
  titleZh: string;
  /** いつ・何の授業の文章か（例「8/24の授業・日記」） */
  sourceLabelJa?: string;
  sourceLabelZh?: string;
  passages: PersonalPassage[];
  items: PersonalItem[];
  issuedAtISO: string;
}

/** 1問ぶんの本人の記録 */
export interface PersonalItemRecord {
  attempts: number;
  correct: number;
  /** 連続正解。間違えたら0に戻る（次の復習日はこれで決まる） */
  streak: number;
  lastAnsweredAtISO: string | null;
  /** 次にこの問題を出す日時。null＝まだ一度も答えていない＝すぐ出す */
  nextReviewISO: string | null;
}

export interface PersonalPackState {
  /** キーは `packId::itemId`（パックをまたいで衝突しない） */
  records: Record<string, PersonalItemRecord>;
  lastStudiedAtISO: string | null;
}

export const emptyPersonalPackState = (): PersonalPackState => ({ records: {}, lastStudiedAtISO: null });

const recordKey = (packId: string, itemId: string): string => `${packId}::${itemId}`;

export const emptyRecord = (): PersonalItemRecord => ({
  attempts: 0, correct: 0, streak: 0, lastAnsweredAtISO: null, nextReviewISO: null,
});

export const recordFor = (
  state: PersonalPackState, packId: string, itemId: string,
): PersonalItemRecord => state.records[recordKey(packId, itemId)] ?? emptyRecord();

/* ────────────────────────────────────────────────────────────
   可視性
   ──────────────────────────────────────────────────────────── */

/**
 * 個人パックを画面に出してよい learner か。
 * **発行された人だけ**（全員に「あなたの文章」という空の入口を見せない）。
 */
export const personalPacksVisible = (prof: AdventureV2Profile): boolean =>
  (prof.personalPacks ?? []).length > 0;

/** 届いているパック（新しい順） */
export const availablePersonalPacks = (prof: AdventureV2Profile): PersonalPack[] =>
  [...(prof.personalPacks ?? [])].sort((a, b) => b.issuedAtISO.localeCompare(a.issuedAtISO));

export const personalPackById = (prof: AdventureV2Profile, packId: string): PersonalPack | null =>
  availablePersonalPacks(prof).find((p) => p.packId === packId) ?? null;

/* ────────────────────────────────────────────────────────────
   復習の間隔（実測の連続正解だけで決める）
   ──────────────────────────────────────────────────────────── */

/** 連続正解 1,2,3,4,5回目以降 → 次に出すまでの日数 */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];

export const intervalDaysFor = (streak: number): number =>
  REVIEW_INTERVAL_DAYS[Math.min(Math.max(streak, 1), REVIEW_INTERVAL_DAYS.length) - 1]
  ?? REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1];

const addDaysISO = (nowISO: string, days: number): string => {
  const ms = new Date(nowISO).getTime();
  if (!Number.isFinite(ms)) return nowISO;
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString();
};

/**
 * 1問答えた結果を記録する。
 * 正解 → 連続正解+1・次の復習日は間隔表から。
 * 不正解 → 連続正解は0に戻し、**その日のうちにもう一度出す**（nextReviewISO=now）。
 */
export const withAnswer = (
  state: PersonalPackState, packId: string, itemId: string, isCorrect: boolean, nowISO: string,
): PersonalPackState => {
  const cur = recordFor(state, packId, itemId);
  const streak = isCorrect ? cur.streak + 1 : 0;
  const next: PersonalItemRecord = {
    attempts: cur.attempts + 1,
    correct: cur.correct + (isCorrect ? 1 : 0),
    streak,
    lastAnsweredAtISO: nowISO,
    nextReviewISO: isCorrect ? addDaysISO(nowISO, intervalDaysFor(streak)) : nowISO,
  };
  return {
    records: { ...state.records, [recordKey(packId, itemId)]: next },
    lastStudiedAtISO: nowISO,
  };
};

/** いま出すべき問題か（未着手 or 復習日が来た） */
export const isDue = (rec: PersonalItemRecord, nowISO: string): boolean => {
  if (rec.nextReviewISO === null) return true;
  const due = new Date(rec.nextReviewISO).getTime();
  const now = new Date(nowISO).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(now)) return true;
  return due <= now;
};

/**
 * 今日やるぶんの出題順。
 * 未着手 → 復習日が来たもの（古い順）の順に並べる。
 * limit を超えるぶんは出さない（1回で終わる量にして、続けられるようにする）
 */
export const dueItems = (
  pack: PersonalPack, state: PersonalPackState, nowISO: string, limit = 20,
): PersonalItem[] => {
  const due = pack.items
    .map((item) => ({ item, rec: recordFor(state, pack.packId, item.id) }))
    .filter(({ rec }) => isDue(rec, nowISO));
  const fresh = due.filter(({ rec }) => rec.attempts === 0).map(({ item }) => item);
  const again = due
    .filter(({ rec }) => rec.attempts > 0)
    .sort((a, b) => (a.rec.nextReviewISO ?? '').localeCompare(b.rec.nextReviewISO ?? ''))
    .map(({ item }) => item);
  return [...fresh, ...again].slice(0, Math.max(1, limit));
};

export interface PersonalPackSummary {
  packId: string;
  total: number;
  /** 一度でも答えた問題の数 */
  started: number;
  /** 連続正解2回以上＝「もう出てきても言える」状態の問題数（断定を避けた基準） */
  steady: number;
  dueNow: number;
  lastStudiedAtISO: string | null;
}

export const summarizePack = (
  pack: PersonalPack, state: PersonalPackState, nowISO: string,
): PersonalPackSummary => {
  const recs = pack.items.map((i) => recordFor(state, pack.packId, i.id));
  return {
    packId: pack.packId,
    total: pack.items.length,
    started: recs.filter((r) => r.attempts > 0).length,
    steady: recs.filter((r) => r.streak >= 2).length,
    dueNow: recs.filter((r) => isDue(r, nowISO)).length,
    lastStudiedAtISO: state.lastStudiedAtISO,
  };
};

/* ────────────────────────────────────────────────────────────
   出題（選択肢の並びは毎回変わるが、同じ回の再描画では変わらない）
   ──────────────────────────────────────────────────────────── */

export interface PresentedPersonalItem {
  item: PersonalItem;
  choices: string[];
  correctIndex: number;
}

/** 正解＋ダミーを混ぜて並べる。seed は「その回」で固定する（描画のたびに動かさない） */
export const presentPersonalItem = (item: PersonalItem, seed: number): PresentedPersonalItem => {
  const pool = [item.answer, ...item.distractors];
  const choices = seededFisherYates(pool, seed);
  return { item, choices, correctIndex: choices.indexOf(item.answer) };
};

/* ────────────────────────────────────────────────────────────
   壊れたデータの復元（jsonbなので何が入っているか分からない）
   ──────────────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strOr = (v: unknown, fallback: string): string =>
  (typeof v === 'string' && v !== '' ? v : fallback);

const optStr = (v: unknown): string | undefined =>
  (typeof v === 'string' && v !== '' ? v.slice(0, 500) : undefined);

const nonNegInt = (v: unknown, max: number): number =>
  (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), max) : 0);

/** 空欄記号。全角アンダースコア2つ（半角だと本文の記号と紛れる） */
export const CLOZE_BLANK = '＿＿';

const restoreItem = (v: unknown): PersonalItem | null => {
  if (!isRecord(v)) return null;
  if (typeof v.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(v.id)) return null;
  if (!PERSONAL_ITEM_KINDS.includes(v.kind as PersonalItemKind)) return null;
  if (typeof v.promptJa !== 'string' || v.promptJa === '') return null;
  if (typeof v.answer !== 'string' || v.answer === '') return null;
  const distractors = Array.isArray(v.distractors)
    ? [...new Set(v.distractors.filter((d): d is string => typeof d === 'string' && d !== '' && d !== v.answer))]
    : [];
  // 選択肢が足りない問題は**出さない**（2択未満は当てずっぽうで正解できてしまう）
  if (distractors.length < MIN_DISTRACTORS) return null;
  // cloze は空欄がちょうど1つ無いと「どこに入れるのか」が分からない
  if (v.kind === 'cloze' && v.promptJa.split(CLOZE_BLANK).length !== 2) return null;
  return {
    id: v.id,
    kind: v.kind as PersonalItemKind,
    promptJa: v.promptJa.slice(0, 400),
    target: strOr(v.target, v.answer).slice(0, 100),
    answer: v.answer.slice(0, 100),
    distractors: distractors.slice(0, MAX_DISTRACTORS).map((d) => d.slice(0, 100)),
    meaningZh: optStr(v.meaningZh),
    noteJa: optStr(v.noteJa),
    noteZh: optStr(v.noteZh),
  };
};

const restorePassage = (v: unknown, index: number): PersonalPassage | null => {
  if (!isRecord(v)) return null;
  if (typeof v.textJa !== 'string' || v.textJa === '') return null;
  return {
    id: strOr(v.id, `p${index + 1}`),
    titleJa: strOr(v.titleJa, `本文 ${index + 1}`),
    titleZh: optStr(v.titleZh),
    textJa: v.textJa.slice(0, 4000),
  };
};

export const restorePersonalPack = (v: unknown): PersonalPack | null => {
  if (!isRecord(v)) return null;
  if (typeof v.packId !== 'string' || !/^[a-z0-9-]{3,60}$/.test(v.packId)) return null;
  const items = Array.isArray(v.items)
    ? v.items.map(restoreItem).filter((i): i is PersonalItem => i !== null).slice(0, MAX_ITEMS_PER_PACK)
    : [];
  // 出題が1問も残らないパックは入口を作らない（空の部屋へ入れない）
  if (items.length === 0) return null;
  const passages = Array.isArray(v.passages)
    ? v.passages.map(restorePassage).filter((p): p is PersonalPassage => p !== null)
    : [];
  return {
    packId: v.packId,
    titleJa: strOr(v.titleJa, strOr(v.titleZh, v.packId)),
    titleZh: strOr(v.titleZh, strOr(v.titleJa, v.packId)),
    sourceLabelJa: optStr(v.sourceLabelJa),
    sourceLabelZh: optStr(v.sourceLabelZh),
    passages,
    items,
    issuedAtISO: typeof v.issuedAtISO === 'string' ? v.issuedAtISO : '1970-01-01T00:00:00.000Z',
  };
};

export const restorePersonalPacks = (v: unknown): PersonalPack[] =>
  (Array.isArray(v) ? v.map(restorePersonalPack).filter((p): p is PersonalPack => p !== null) : []);

export const restorePersonalPackState = (v: unknown): PersonalPackState => {
  if (!isRecord(v)) return emptyPersonalPackState();
  const records: Record<string, PersonalItemRecord> = {};
  if (isRecord(v.records)) {
    for (const [k, raw] of Object.entries(v.records)) {
      if (!isRecord(raw)) continue;
      const attempts = nonNegInt(raw.attempts, 99999);
      records[k] = {
        attempts,
        // 正解数が試行数を超える壊れ方は、少ない方に丸める（正答率が100%超にならない）
        correct: Math.min(nonNegInt(raw.correct, 99999), attempts),
        streak: nonNegInt(raw.streak, 9999),
        lastAnsweredAtISO: typeof raw.lastAnsweredAtISO === 'string' ? raw.lastAnsweredAtISO : null,
        nextReviewISO: typeof raw.nextReviewISO === 'string' ? raw.nextReviewISO : null,
      };
    }
  }
  return {
    records,
    lastStudiedAtISO: typeof v.lastStudiedAtISO === 'string' ? v.lastStudiedAtISO : null,
  };
};

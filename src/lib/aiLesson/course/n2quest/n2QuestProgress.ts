// N2文法攻略（ソラノ塔）の進捗と出題順序（FOREST FIRST §10）。
//
// 方針:
// - 進捗はこの端末のlocalStorageのみ（正式DB同期はProduction Hardeningで有効化）。
//   「サーバーに保存しました」とは表示しない。
// - 選択肢の並びは決定的にシャッフルする（answerIndexが常に同じ位置だと答えの位置で
//   解けてしまうため）。乱数は使わない（reload再現性・テスト容易性）。
// - reviewStatus/humanReviewed/approved はここから一切変更しない（自動昇格禁止）。
import type { N2GrammarDraft } from '../n2GrammarDrafts';
import { canonicalN2GrammarId, n2AliasSourcesOf } from '../n2GrammarAliases';

export const N2_QUEST_KEY_PREFIX = 'kawabado.aiCourse.v1.n2quest.';

export interface N2ItemProgress {
  /** 確認問題に正解した時刻（未正解はnull） */
  recognizedAtMs: number | null;
  /** 使用練習を完了（入力 or スキップ）した時刻 */
  producedAtMs: number | null;
}

type ReadableStore = Pick<Storage, 'getItem'>;
type WritableStore = Pick<Storage, 'getItem' | 'setItem'>;

const readRawProgress = (store: ReadableStore, grammarId: string): N2ItemProgress => {
  try {
    const raw = store.getItem(N2_QUEST_KEY_PREFIX + grammarId);
    if (!raw) return { recognizedAtMs: null, producedAtMs: null };
    const p: unknown = JSON.parse(raw);
    if (typeof p !== 'object' || p === null) return { recognizedAtMs: null, producedAtMs: null };
    const o = p as Record<string, unknown>;
    return {
      recognizedAtMs: typeof o.recognizedAtMs === 'number' ? o.recognizedAtMs : null,
      producedAtMs: typeof o.producedAtMs === 'number' ? o.producedAtMs : null,
    };
  } catch {
    return { recognizedAtMs: null, producedAtMs: null };
  }
};

/**
 * 進捗読み取り（CEO統合alias対応・2026-07-30）。
 * 統合前ID（n2g-024/104）で保存された既存学習記録を失わないよう、
 * canonical本体＋alias元キーをマージして返す（早い方の時刻を採用）。
 * 書き込みは常にcanonical IDのみ（remote migrationはしない）。
 */
export const readItemProgress = (store: ReadableStore, grammarId: string): N2ItemProgress => {
  const canonical = canonicalN2GrammarId(grammarId);
  const merged = readRawProgress(store, canonical);
  for (const legacy of n2AliasSourcesOf(canonical)) {
    const old = readRawProgress(store, legacy);
    if (old.recognizedAtMs !== null && (merged.recognizedAtMs === null || old.recognizedAtMs < merged.recognizedAtMs)) merged.recognizedAtMs = old.recognizedAtMs;
    if (old.producedAtMs !== null && (merged.producedAtMs === null || old.producedAtMs < merged.producedAtMs)) merged.producedAtMs = old.producedAtMs;
  }
  return merged;
};

const write = (store: WritableStore, grammarId: string, p: N2ItemProgress): void => {
  try { store.setItem(N2_QUEST_KEY_PREFIX + grammarId, JSON.stringify(p)); } catch { /* private mode */ }
};

export const markRecognized = (store: WritableStore, grammarId: string, nowMs: number): N2ItemProgress => {
  const id = canonicalN2GrammarId(grammarId);
  const cur = readItemProgress(store, id);
  const next = { ...cur, recognizedAtMs: cur.recognizedAtMs ?? nowMs };
  write(store, id, next);
  return next;
};

export const markProduced = (store: WritableStore, grammarId: string, nowMs: number): N2ItemProgress => {
  const id = canonicalN2GrammarId(grammarId);
  const cur = readItemProgress(store, id);
  const next = { ...cur, producedAtMs: cur.producedAtMs ?? nowMs };
  write(store, id, next);
  return next;
};

/** 項目の完了＝確認問題◯＋使用練習まで到達 */
export const itemDone = (store: ReadableStore, grammarId: string): boolean => {
  const p = readItemProgress(store, grammarId);
  return p.recognizedAtMs !== null && p.producedAtMs !== null;
};

export interface UnitQuestProgress { done: number; total: number; complete: boolean }

export const unitQuestProgress = (store: ReadableStore, items: { grammarId: string }[]): UnitQuestProgress => {
  const done = items.filter(i => itemDone(store, i.grammarId)).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
};

// ── 決定的シャッフル ──

/** 文字列→小さな決定的ハッシュ（表示順のためだけに使う） */
export const tinyHash = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

export interface ShuffledChoice { options: string[]; answerIndex: number }

/**
 * 選択肢を決定的に並び替える。同じgrammarIdなら常に同じ並び。
 * 正解の内容は変えず、位置だけが項目ごとに変わる。
 */
export const shuffleRecognition = (
  grammarId: string, options: string[], answerIndex: number,
): ShuffledChoice => {
  const order = options.map((_, i) => i);
  // Fisher–Yates を決定的seedで実行
  let seed = tinyHash(grammarId);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    options: order.map(i => options[i]),
    answerIndex: order.indexOf(answerIndex),
  };
};

/**
 * 使用練習の判定: expected/acceptable/matchKeys のいずれかが含まれていれば「使えた」。
 * 完全一致は要求しない（言えたことを認める）。空入力はfalse。
 */
export const productionUsesTarget = (draft: Pick<N2GrammarDraft, 'production' | 'matchKeys'>, input: string): boolean => {
  const text = input.trim();
  if (!text) return false;
  const keys = [...draft.production.expected, ...draft.production.acceptable, ...(draft.matchKeys ?? [])]
    .map(k => k.replace(/^〜/, ''))
    .filter(k => k.length > 0);
  return keys.some(k => text.includes(k));
};

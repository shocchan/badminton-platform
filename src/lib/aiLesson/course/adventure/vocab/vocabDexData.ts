// 単語図鑑の表示データ（重いバンクを読むので、画面からは dynamic import で使う）。
//
// vocabDex.ts（純関数・台帳から段階を出す）と、語彙バンク（意味・例文・解説）を突き合わせる。
// ここを分けているのは、図鑑を開かない人に語彙バンク（gzipで数百kB）を落とさないため。
import { vocabScopedActive, type VocabScopeLevel } from './vocabQuestions';
import type { VocabOriginalContent } from './vocabContent';
import type { AdvMasteryLedger } from '../advTypes';
import { collectDexEntries, dexIdOf, dexProgress, type DexEntry, type DexProgress, type DexState } from './vocabDex';

export interface DexCard {
  id: string;
  surface: string;
  reading: string;
  level: string;
  glossZh: string;
  exampleJa: string;
  exampleZh: string;
  explanationJa: string;
  explanationZh: string;
  collocationsJa: string[];
  state: DexState;
  metCount: number;
  correctCount: number;
  wrongCount: number;
  aspects: string[];
  lastMetDateKey: string | null;
}

export interface DexView {
  cards: DexCard[];
  progress: DexProgress;
  /** レベル別の「集めた/総数」。図鑑の見出しに出す */
  byLevel: { level: string; discovered: number; total: number }[];
}

const LEVEL_ORDER = ['N1', 'N2', 'N3', 'N4', 'N5'];

const toCard = (c: VocabOriginalContent, e: DexEntry | undefined): DexCard => ({
  id: dexIdOf(c.surface, c.reading),
  surface: c.surface, reading: c.reading, level: c.level,
  glossZh: c.glossZh,
  exampleJa: c.exampleJa, exampleZh: c.exampleZh,
  explanationJa: c.explanationJa ?? '', explanationZh: c.explanationZh ?? '',
  collocationsJa: c.collocationsJa ?? [],
  state: e?.state ?? 'unseen',
  metCount: e?.metCount ?? 0,
  correctCount: e?.correctCount ?? 0,
  wrongCount: e?.wrongCount ?? 0,
  aspects: e?.aspects ?? [],
  lastMetDateKey: e?.lastMetDateKey ?? null,
});

/**
 * 図鑑1画面ぶんのデータを作る。
 *
 * 並び順は「出会った語が先・その中では最近出会った順」。未発見はその後ろに
 * レベル順で並べる（何が残っているかが見えるようにする。ポケモン図鑑と同じ考え方）。
 */
export const buildDexView = (level: VocabScopeLevel, ledger: AdvMasteryLedger): DexView => {
  const bank = vocabScopedActive(level);
  const scope = new Set(bank.map((c) => dexIdOf(c.surface, c.reading)));
  const entries = collectDexEntries(ledger, scope);

  const cards = bank.map((c) => toCard(c, entries.get(dexIdOf(c.surface, c.reading))));
  cards.sort((a, b) => {
    const da = a.state === 'unseen' ? 1 : 0;
    const db = b.state === 'unseen' ? 1 : 0;
    if (da !== db) return da - db;
    if (da === 0) {
      // 出会った語: 最近出会った順
      const la = a.lastMetDateKey ?? ''; const lb = b.lastMetDateKey ?? '';
      if (la !== lb) return la < lb ? 1 : -1;
      return a.surface < b.surface ? -1 : 1;
    }
    // 未発見: レベルが上の級から（目標に近いものを先に見せる）
    const ra = LEVEL_ORDER.indexOf(a.level); const rb = LEVEL_ORDER.indexOf(b.level);
    if (ra !== rb) return ra - rb;
    return a.surface < b.surface ? -1 : 1;
  });

  const byLevelMap = new Map<string, { discovered: number; total: number }>();
  for (const c of cards) {
    const row = byLevelMap.get(c.level) ?? { discovered: 0, total: 0 };
    row.total += 1;
    if (c.state !== 'unseen') row.discovered += 1;
    byLevelMap.set(c.level, row);
  }
  const byLevel = LEVEL_ORDER.filter((l) => byLevelMap.has(l))
    .map((l) => ({ level: l, ...byLevelMap.get(l)! }));

  return { cards, progress: dexProgress(entries, bank.length), byLevel };
};

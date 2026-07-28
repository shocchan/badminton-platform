// Phase R2: N2文法draftのUnit単位lazy chunk境界（§16）。
// 学習者向けにN2 draftを公開する際、180件を一括ロードせずUnitファイル単位で動的importする。
// 注意: Unit4/5ファイルには繰越制作分（unit属性が3・4の項目）が含まれるため、
// 「Unitファイル」と「unit属性」は同一ではない。表示側は unit属性でfilterして使う。
// 現時点でlearner UIからは未使用（未公開draftを一般learnerが読み込まない状態を維持）。
import type { N2GrammarDraft } from './n2GrammarDrafts';

/** Unitファイル番号（1〜12）→dynamic import。ビルド時にファイル単位のchunkへ分割される */
const UNIT_LOADERS: Record<number, () => Promise<{ drafts: N2GrammarDraft[] }>> = {
  1: async () => ({ drafts: (await import('./n2GrammarDraftsUnit1')).N2_GRAMMAR_DRAFTS_UNIT1 }),
  2: async () => ({ drafts: (await import('./n2GrammarDraftsUnit2')).N2_GRAMMAR_DRAFTS_UNIT2 }),
  3: async () => ({ drafts: (await import('./n2GrammarDraftsUnit3')).N2_GRAMMAR_DRAFTS_UNIT3 }),
  4: async () => ({ drafts: (await import('./n2GrammarDraftsUnit4')).N2_GRAMMAR_DRAFTS_UNIT4 }),
  5: async () => ({ drafts: (await import('./n2GrammarDraftsUnit5')).N2_GRAMMAR_DRAFTS_UNIT5 }),
  6: async () => ({ drafts: (await import('./n2GrammarDraftsUnit6')).N2_GRAMMAR_DRAFTS_UNIT6 }),
  7: async () => ({ drafts: (await import('./n2GrammarDraftsUnit7')).N2_GRAMMAR_DRAFTS_UNIT7 }),
  8: async () => ({ drafts: (await import('./n2GrammarDraftsUnit8')).N2_GRAMMAR_DRAFTS_UNIT8 }),
  9: async () => ({ drafts: (await import('./n2GrammarDraftsUnit9')).N2_GRAMMAR_DRAFTS_UNIT9 }),
  10: async () => ({ drafts: (await import('./n2GrammarDraftsUnit10')).N2_GRAMMAR_DRAFTS_UNIT10 }),
  11: async () => ({ drafts: (await import('./n2GrammarDraftsUnit11')).N2_GRAMMAR_DRAFTS_UNIT11 }),
  12: async () => ({ drafts: (await import('./n2GrammarDraftsUnit12')).N2_GRAMMAR_DRAFTS_UNIT12 }),
};

export const N2_UNIT_FILE_NUMBERS = Object.keys(UNIT_LOADERS).map(Number);

/** Unitファイル1つ分のdraftをロード（存在しない番号は空配列） */
export const loadN2DraftUnitFile = async (fileNo: number): Promise<N2GrammarDraft[]> => {
  const loader = UNIT_LOADERS[fileNo];
  if (!loader) return [];
  return (await loader()).drafts;
};

/**
 * unit属性→実際に項目が入っているUnitファイル番号（繰越・穴埋めの実配置）。
 * unit1の穴埋め→Unit3ファイル、unit3/4の繰越→Unit5ファイル。
 * この対応はn2GrammarDraftChunks.test.tsが全unitで機械検証する。
 */
const FILES_BY_UNIT: Record<number, number[]> = {
  1: [1, 3], 2: [2], 3: [3, 5], 4: [4, 5], 5: [5], 6: [6],
  7: [7], 8: [8], 9: [9], 10: [10], 11: [11], 12: [12],
};

/** unit属性（1〜12）でロード。繰越・穴埋め項目も正しく回収する */
export const loadN2DraftsByUnit = async (unit: number): Promise<N2GrammarDraft[]> => {
  const fileCandidates = FILES_BY_UNIT[unit] ?? [unit];
  const all = (await Promise.all(fileCandidates.map(loadN2DraftUnitFile))).flat();
  return all.filter(d => d.unit === unit);
};

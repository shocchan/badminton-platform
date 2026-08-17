// 初級文法（N5/N4・108項目）のlazy chunk境界。2026-08-17 新設。
//
// N2文法（n2GrammarDraftChunks.ts）と同じ理由でファイル単位の動的importにする:
// 初級文法だけで約350KBあり、初期bundleへ載せるとN2目標の学習者（サマーさん）まで
// 巻き添えで重くなる。基礎帯の学習者が初めて文法stepを開いたときにだけ取りに行く。
//
// 注意: ファイル（N5a/N5b/…）と unit（n5g-unit-1〜）は1対2の関係。
// 束（unit）で攻略判定するので、参照する側は必ず unit 属性を見ること。
import type { BasicGrammarDraft } from './basicGrammarDrafts';

const FILE_LOADERS: (() => Promise<BasicGrammarDraft[]>)[] = [
  async () => (await import('./basicGrammarN5a')).BASIC_GRAMMAR_N5A,
  async () => (await import('./basicGrammarN5b')).BASIC_GRAMMAR_N5B,
  async () => (await import('./basicGrammarN5c')).BASIC_GRAMMAR_N5C,
  async () => (await import('./basicGrammarN4a')).BASIC_GRAMMAR_N4A,
  async () => (await import('./basicGrammarN4b')).BASIC_GRAMMAR_N4B,
  async () => (await import('./basicGrammarN4c')).BASIC_GRAMMAR_N4C,
  async () => (await import('./basicGrammarN4d')).BASIC_GRAMMAR_N4D,
];

/** N5の束ID（学習順）。基礎キャンプstageのtargetsに入る */
export const N5_UNIT_IDS = ['n5g-unit-1', 'n5g-unit-2', 'n5g-unit-3', 'n5g-unit-4', 'n5g-unit-5', 'n5g-unit-6'];
/** N4の束ID（学習順）。N3語彙・文法の橋stageのtargetsに入る */
export const N4_UNIT_IDS = [
  'n4g-unit-1', 'n4g-unit-2', 'n4g-unit-3', 'n4g-unit-4',
  'n4g-unit-5', 'n4g-unit-6', 'n4g-unit-7', 'n4g-unit-8',
];

let cache: BasicGrammarDraft[] | null = null;

/** 初級文法の全項目（1回だけロードして以後キャッシュ） */
export const loadAllBasicDrafts = async (): Promise<BasicGrammarDraft[]> => {
  if (cache) return cache;
  const all = (await Promise.all(FILE_LOADERS.map((f) => f()))).flat();
  cache = all;
  return all;
};

/** ロード済みのキャッシュだけを見る同期lookup（未ロードならnull。存在するふりをしない） */
export const cachedBasicDraftById = (id: string): BasicGrammarDraft | null =>
  cache?.find((d) => d.grammarId === id) ?? null;

// かな道場（2026-08-15 CEO指示）。
// 診断で超初心者（knowledgeBand が needs_assessment / pre_n5）と分かった人に、
// ひらがな・カタカナを読める状態にしてから基礎キャンプへ入れる。
//
// 鉄則:
// - 選択式のみ（かな→ローマ字の4択）・seed決定的・実行時LLMなし
// - 「もう読める」人を足止めしない: 10問チェックに合格すれば即卒業
// - かなは攻略台帳（mastery）に入れない: 前提スキルであって試験のevidenceではない（原則13）
import type { AdvKanaState } from './advTypes';

export interface KanaChar { kana: string; romaji: string }
export interface KanaRow {
  rowId: string;
  labelJa: string;
  labelZh: string;
  kind: 'hiragana' | 'katakana';
  chars: KanaChar[];
}

const H: [string, string][][] = [
  [['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o']],
  [['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko']],
  [['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so']],
  [['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to']],
  [['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no']],
  [['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho']],
  [['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo']],
  [['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo']],
  [['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro']],
  [['わ', 'wa'], ['を', 'wo'], ['ん', 'n']],
];
const K: [string, string][][] = [
  [['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o']],
  [['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko']],
  [['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so']],
  [['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to']],
  [['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no']],
  [['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho']],
  [['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo']],
  [['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo']],
  [['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro']],
  [['ワ', 'wa'], ['ヲ', 'wo'], ['ン', 'n']],
];
const ROW_NAMES = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'];
const KATA_NAMES = ['ア', 'カ', 'サ', 'タ', 'ナ', 'ハ', 'マ', 'ヤ', 'ラ', 'ワ'];

const toRow = (kind: 'hiragana' | 'katakana', i: number, pairs: [string, string][]): KanaRow => ({
  rowId: `${kind === 'hiragana' ? 'h' : 'k'}-${i + 1}`,
  labelJa: kind === 'hiragana' ? `ひらがな ${ROW_NAMES[i]}行` : `カタカナ ${KATA_NAMES[i]}行`,
  labelZh: kind === 'hiragana' ? `平假名 ${ROW_NAMES[i]}行` : `片假名 ${KATA_NAMES[i]}行`,
  kind,
  chars: pairs.map(([kana, romaji]) => ({ kana, romaji })),
});

/** 学習順: ひらがな10行 → カタカナ10行（1日2行＝約10日で卒業） */
export const KANA_ROWS: KanaRow[] = [
  ...H.map((p, i) => toRow('hiragana', i, p)),
  ...K.map((p, i) => toRow('katakana', i, p)),
];

export const kanaRowById = (rowId: string): KanaRow | null =>
  KANA_ROWS.find((r) => r.rowId === rowId) ?? null;

/** まだ終わっていない行（学習順） */
export const kanaRowsRemaining = (state: AdvKanaState | null | undefined): KanaRow[] => {
  const done = new Set(state?.doneRowIds ?? []);
  return KANA_ROWS.filter((r) => !done.has(r.rowId));
};

/** かな道場を卒業済みか（不要と判定済み or 全行修了）。state無し＝対象外 */
export const isKanaGraduated = (state: AdvKanaState | null | undefined): boolean => {
  if (!state) return true;
  if (state.needed === false) return true;
  if (state.needed === null) return false; // チェック未実施
  return kanaRowsRemaining(state).length === 0;
};

/** 今日やる行（既定2行）。チェック未実施ならチェックが先 */
export const todaysKanaRowIds = (state: AdvKanaState | null | undefined, count = 2): string[] =>
  kanaRowsRemaining(state).slice(0, count).map((r) => r.rowId);

// ── 問題生成（決定的） ──

export interface KanaQuestion {
  kana: string;
  /** ローマ字の選択肢（4択） */
  choices: string[];
  answerIndex: number;
}

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const ALL_ROMAJI = [...new Set(KANA_ROWS.flatMap((r) => r.chars.map((c) => c.romaji)))];

const questionFor = (c: KanaChar, seed: number): KanaQuestion => {
  const r = rng(seed);
  const wrong: string[] = [];
  const pool = ALL_ROMAJI.filter((x) => x !== c.romaji);
  while (wrong.length < 3) {
    const cand = pool[Math.floor(r() * pool.length)];
    if (!wrong.includes(cand)) wrong.push(cand);
  }
  const choices = [c.romaji, ...wrong];
  // 決定的シャッフル
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { kana: c.kana, choices, answerIndex: choices.indexOf(c.romaji) };
};

/** 卒業チェック: ひらがな6問＋カタカナ4問。9問以上正解で「かなは読める」と判定 */
export const KANA_CHECK_PASS = 9;
export const buildKanaCheck = (seed: number): KanaQuestion[] => {
  const r = rng(seed);
  const pick = (rows: KanaRow[], n: number): KanaChar[] => {
    const chars = rows.flatMap((x) => x.chars);
    const out: KanaChar[] = [];
    const used = new Set<number>();
    while (out.length < n) {
      const i = Math.floor(r() * chars.length);
      if (used.has(i)) continue;
      used.add(i);
      out.push(chars[i]);
    }
    return out;
  };
  const hira = pick(KANA_ROWS.filter((x) => x.kind === 'hiragana'), 6);
  const kata = pick(KANA_ROWS.filter((x) => x.kind === 'katakana'), 4);
  return [...hira, ...kata].map((c, i) => questionFor(c, seed + i * 31));
};

/** 行クイズ: その行の全文字を1問ずつ */
export const buildRowQuiz = (row: KanaRow, seed: number): KanaQuestion[] =>
  row.chars.map((c, i) => questionFor(c, seed + i * 31));

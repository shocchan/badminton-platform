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

/**
 * かなの種類（2026-08-18 拡張）。
 * 清音だけでは「がっこう」「きょう」「コーヒー」が読めず、道場を全部終えても
 * 基礎キャンプの1問目でつまずく状態だった（CEO指摘）。濁音・拗音・促音・長音まで通す。
 */
export type KanaGroup = 'seion' | 'dakuon' | 'youon' | 'sokuon' | 'chouon';

export interface KanaRow {
  rowId: string;
  labelJa: string;
  labelZh: string;
  kind: 'hiragana' | 'katakana';
  /** 旧データ互換のため任意。未指定は清音とみなす */
  group?: KanaGroup;
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

// ── 濁音・半濁音 ──
const HD: [string, [string, string][]][] = [
  ['が', [['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go']]],
  ['ざ', [['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo']]],
  ['だ', [['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do']]],
  ['ば', [['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo']]],
  ['ぱ', [['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']]],
];
const KD: [string, [string, string][]][] = [
  ['ガ', [['ガ', 'ga'], ['ギ', 'gi'], ['グ', 'gu'], ['ゲ', 'ge'], ['ゴ', 'go']]],
  ['ザ', [['ザ', 'za'], ['ジ', 'ji'], ['ズ', 'zu'], ['ゼ', 'ze'], ['ゾ', 'zo']]],
  ['ダ', [['ダ', 'da'], ['ヂ', 'ji'], ['ヅ', 'zu'], ['デ', 'de'], ['ド', 'do']]],
  ['バ', [['バ', 'ba'], ['ビ', 'bi'], ['ブ', 'bu'], ['ベ', 'be'], ['ボ', 'bo']]],
  ['パ', [['パ', 'pa'], ['ピ', 'pi'], ['プ', 'pu'], ['ペ', 'pe'], ['ポ', 'po']]],
];

// ── 拗音（小さい ゃゅょ）──
const HY: [string, [string, string][]][] = [
  ['きゃ・ぎゃ', [['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo'], ['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo']]],
  ['しゃ・じゃ', [['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho'], ['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo']]],
  ['ちゃ・にゃ', [['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho'], ['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo']]],
  ['ひゃ・びゃ・ぴゃ', [['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo'], ['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo'], ['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo']]],
  ['みゃ・りゃ', [['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo'], ['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo']]],
];
const KY: [string, [string, string][]][] = [
  ['キャ・ギャ', [['キャ', 'kya'], ['キュ', 'kyu'], ['キョ', 'kyo'], ['ギャ', 'gya'], ['ギュ', 'gyu'], ['ギョ', 'gyo']]],
  ['シャ・ジャ', [['シャ', 'sha'], ['シュ', 'shu'], ['ショ', 'sho'], ['ジャ', 'ja'], ['ジュ', 'ju'], ['ジョ', 'jo']]],
  ['チャ・ニャ', [['チャ', 'cha'], ['チュ', 'chu'], ['チョ', 'cho'], ['ニャ', 'nya'], ['ニュ', 'nyu'], ['ニョ', 'nyo']]],
  ['ヒャ・ビャ・ピャ', [['ヒャ', 'hya'], ['ヒュ', 'hyu'], ['ヒョ', 'hyo'], ['ビャ', 'bya'], ['ビュ', 'byu'], ['ビョ', 'byo'], ['ピャ', 'pya'], ['ピュ', 'pyu'], ['ピョ', 'pyo']]],
  ['ミャ・リャ', [['ミャ', 'mya'], ['ミュ', 'myu'], ['ミョ', 'myo'], ['リャ', 'rya'], ['リュ', 'ryu'], ['リョ', 'ryo']]],
];

/**
 * 促音・長音は「1文字の読み」ではなく**語の中で効く規則**なので、
 * 1文字→ローマ字ではなく**語→ローマ字**で出す（きって=kitte / きて=kite を区別できるかを見る）。
 * KanaChar.kana に語をそのまま入れる（画面は同じ部品で出せる）。
 */
const SOKUON: [string, string][] = [
  ['がっこう', 'gakkou'], ['きって', 'kitte'], ['ざっし', 'zasshi'],
  ['いっしょ', 'issho'], ['みっつ', 'mittsu'], ['きっぷ', 'kippu'],
];
const CHOUON_K: [string, string][] = [
  ['コーヒー', 'koohii'], ['ケーキ', 'keeki'], ['スーパー', 'suupaa'],
  ['ノート', 'nooto'], ['テーブル', 'teeburu'], ['カレー', 'karee'],
];
const CHOUON_H: [string, string][] = [
  ['おとうさん', 'otousan'], ['おかあさん', 'okaasan'], ['せんせい', 'sensei'],
  ['きょう', 'kyou'], ['ゆうめい', 'yuumei'], ['えいが', 'eiga'],
];

const toRow = (kind: 'hiragana' | 'katakana', i: number, pairs: [string, string][]): KanaRow => ({
  rowId: `${kind === 'hiragana' ? 'h' : 'k'}-${i + 1}`,
  labelJa: kind === 'hiragana' ? `ひらがな ${ROW_NAMES[i]}行` : `カタカナ ${KATA_NAMES[i]}行`,
  labelZh: kind === 'hiragana' ? `平假名 ${ROW_NAMES[i]}行` : `片假名 ${KATA_NAMES[i]}行`,
  kind,
  group: 'seion',
  chars: pairs.map(([kana, romaji]) => ({ kana, romaji })),
});

const extraRow = (
  rowId: string, kind: 'hiragana' | 'katakana', group: KanaGroup,
  labelJa: string, labelZh: string, pairs: [string, string][],
): KanaRow => ({ rowId, labelJa, labelZh, kind, group, chars: pairs.map(([kana, romaji]) => ({ kana, romaji })) });

const scriptJa = (k: 'hiragana' | 'katakana') => (k === 'hiragana' ? 'ひらがな' : 'カタカナ');
const scriptZh = (k: 'hiragana' | 'katakana') => (k === 'hiragana' ? '平假名' : '片假名');

const dakuonRows = (kind: 'hiragana' | 'katakana', src: [string, [string, string][]][]): KanaRow[] =>
  src.map(([name, pairs], i) => extraRow(
    `${kind === 'hiragana' ? 'h' : 'k'}d-${i + 1}`, kind, 'dakuon',
    `${scriptJa(kind)} ${name}行（濁音・半濁音）`, `${scriptZh(kind)} ${name}行（浊音・半浊音）`, pairs));

const youonRows = (kind: 'hiragana' | 'katakana', src: [string, [string, string][]][]): KanaRow[] =>
  src.map(([name, pairs], i) => extraRow(
    `${kind === 'hiragana' ? 'h' : 'k'}y-${i + 1}`, kind, 'youon',
    `${scriptJa(kind)} ${name}（拗音）`, `${scriptZh(kind)} ${name}（拗音）`, pairs));

/**
 * 学習順（2026-08-18 改訂）。
 * ひらがなを清音→濁音→拗音まで通してからカタカナへ行く（文字体系ごとに閉じる方が定着する）。
 * 最後に、語の中でしか判定できない促音・長音を置く。1日2行なら約21日で卒業。
 */
export const KANA_ROWS: KanaRow[] = [
  ...H.map((p, i) => toRow('hiragana', i, p)),
  ...dakuonRows('hiragana', HD),
  ...youonRows('hiragana', HY),
  ...K.map((p, i) => toRow('katakana', i, p)),
  ...dakuonRows('katakana', KD),
  ...youonRows('katakana', KY),
  extraRow('w-sokuon', 'hiragana', 'sokuon',
    '小さい「っ」（促音）', '小写的「っ」（促音）', SOKUON),
  extraRow('w-chouon-k', 'katakana', 'chouon',
    'カタカナの「ー」（長音）', '片假名的「ー」（长音）', CHOUON_K),
  extraRow('w-chouon-h', 'hiragana', 'chouon',
    'ひらがなの長音（おう・えい）', '平假名的长音（おう・えい）', CHOUON_H),
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

/** 1文字ぶんのローマ字（清音・濁音・拗音）。語の読みは混ぜない＝長さで正解が透けるのを防ぐ */
const CHAR_ROMAJI = [...new Set(
  KANA_ROWS.filter((r) => r.group !== 'sokuon' && r.group !== 'chouon')
    .flatMap((r) => r.chars.map((c) => c.romaji)),
)];

/**
 * 促音・長音の誤答は**最小対**で作る（gakkou に対して gakou）。
 * 無関係な語を並べると「長いのが正解」で当たってしまい、規則を確かめられない。
 */
const minimalPairs = (romaji: string): string[] => {
  const out: string[] = [];
  const noGemination = romaji.replace(/([kstpgzdbh])\1/, '$1');          // kitte → kite
  if (noGemination !== romaji) out.push(noGemination);
  // 長音の並び。「えい(ei)」「おう(ou)」も日本語の長音なので必ず含める（せんせい=sensei）
  const LONG = /(aa|ii|uu|ee|oo|ou|ei)/;
  const shortVowel = romaji.replace(LONG, (m) => m[0]);                   // koohii → kohii
  if (shortVowel !== romaji) out.push(shortVowel);
  const shortLast = romaji.replace(/(aa|ii|uu|ee|oo|ou|ei)([^aiueo]*)$/, (_, v: string, t: string) => v[0] + t);
  if (shortLast !== romaji && !out.includes(shortLast)) out.push(shortLast);
  // 書き方の取り違え（sensei ⇄ sensee / otousan ⇄ otoosan）。実際に生徒が迷う形
  const swapped = romaji.replace(/(ei|ou)/, (m) => (m === 'ei' ? 'ee' : 'oo'));
  if (swapped !== romaji && !out.includes(swapped)) out.push(swapped);
  // 促音になれるのは k/s/t/p だけ（koohhii のような日本語に無い形を作らない）
  const doubled = romaji.replace(/([aiueo])([kstp])/, '$1$2$2');
  if (doubled !== romaji && !out.includes(doubled)) out.push(doubled);
  // 同じ字が3つ続く形（gakkkou / zassshi）は日本語のローマ字として存在せず、
  // 見た瞬間に誤答と分かってしまう＝規則を確かめる問題にならないので捨てる
  return out.filter((x) => x !== romaji && !/(.)\1\1/.test(x));
};

const isWordEntry = (c: KanaChar): boolean => c.kana.length > 2;

const questionFor = (c: KanaChar, seed: number): KanaQuestion => {
  const r = rng(seed);
  const wrong: string[] = [];
  // 語（促音・長音）は最小対を優先して入れる。足りなければ他の語の読みで埋める
  if (isWordEntry(c)) {
    for (const m of minimalPairs(c.romaji)) if (wrong.length < 3 && !wrong.includes(m)) wrong.push(m);
  }
  const sameKind = KANA_ROWS.filter((row) => (isWordEntry(c) ? (row.group === 'sokuon' || row.group === 'chouon') : true));
  const pool = (isWordEntry(c)
    ? [...new Set(sameKind.flatMap((row) => row.chars.map((x) => x.romaji)))]
    : CHAR_ROMAJI).filter((x) => x !== c.romaji && !wrong.includes(x));
  while (wrong.length < 3 && pool.length > 0) {
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

/**
 * 卒業チェック: 清音7問＋濁音・拗音・促音長音3問。9問以上正解で「かなは読める」と判定。
 * 2026-08-18 改訂: 以前は清音だけを見ていたため、「あいうえおは読めるが きょう が読めない」人が
 * 道場を丸ごと飛ばして基礎キャンプへ送られていた。測る範囲を道場の範囲に合わせる。
 */
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
  const seion = KANA_ROWS.filter((x) => (x.group ?? 'seion') === 'seion');
  const hira = pick(seion.filter((x) => x.kind === 'hiragana'), 4);
  const kata = pick(seion.filter((x) => x.kind === 'katakana'), 3);
  const daku = pick(KANA_ROWS.filter((x) => x.group === 'dakuon'), 1);
  const you = pick(KANA_ROWS.filter((x) => x.group === 'youon'), 1);
  const word = pick(KANA_ROWS.filter((x) => x.group === 'sokuon' || x.group === 'chouon'), 1);
  return [...hira, ...kata, ...daku, ...you, ...word].map((c, i) => questionFor(c, seed + i * 31));
};

/** 行クイズ: その行の全文字を1問ずつ */
export const buildRowQuiz = (row: KanaRow, seed: number): KanaQuestion[] =>
  row.chars.map((c, i) => questionFor(c, seed + i * 31));

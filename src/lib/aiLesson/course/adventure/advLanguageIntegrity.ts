// 学習者表示テキストの言語整合性（JLPT ASSESSMENT INTEGRITY §1〜§4）。
//
// 方針:
// - 「キリル文字だけ禁止」ではなく、**ja/zhとして許可していないUnicode Scriptが1つでもあればFAIL**。
// - 対象は learner-visible field のみ。コード・JSON key・itemId・URL・メールは対象外（呼び出し側で選別）。
// - silent fallback 禁止: 違反は itemId/field/route/locale/substring/codePoint つきで必ず報告する。
//
// 日本語の学習対象文を中国語画面へ出すのは設計上必要（§2「日本語の学習対象文は両localeで保持可能」）。
// zh field では「」『』""（）で引用された日本語を正規の形とし、
// 引用外に地の文として仮名が出るものは **warning** として件数・IDつきで報告する
// （blocking にしないのは、既存の中国語解説が「た形」「音がする」等の引用符なし表記を
//   意図的に多用しており、機械FAIL化が教材の全面書き換えを強いるため。§13で禁止されている）。

/** 学習者に見えるテキストの言語種別 */
export type TextLocale =
  | 'ja'            // 日本語UI・日本語解説
  | 'zh'            // 中国語UI・中国語解説
  | 'targetJa'      // 学習対象の日本語（zh画面でもそのまま出す）
  | 'neutral';      // 数値・記号のみを想定（ID等はそもそも対象外）

export interface LangCheckInput {
  itemId: string;
  field: string;
  locale: TextLocale;
  text: string;
  /** 表示経路（home / battle / readiness / map / report / loading / facility …） */
  route: string;
  /** canonical（教材原本） / generated（variant生成） / fallback / ui（辞書） */
  origin: 'canonical' | 'generated' | 'fallback' | 'ui';
  sourceFile?: string;
}

export type LangViolationKind =
  | 'unauthorized_script'
  | 'replacement_char'
  | 'mojibake'
  | 'nullish_text'
  | 'empty_required'
  | 'unquoted_kana_in_zh'
  | 'zh_ui_text_in_ja_field';

/**
 * blocking = 出してはいけない（ビルド・CIを止める）。
 * warning  = 様式上の指摘。中国語解説の中に日本語の例（「た形」「音がする」等）を
 *            引用符なしで書く表記は既存教材で意図的に多用されており、
 *            これを機械的にFAILにすると教材の全面書き換えを強いる（今回禁止）。
 *            そのため件数とIDを必ず出したうえで warning とし、人間の翻訳作業へ回す。
 */
export const BLOCKING_KINDS: LangViolationKind[] = [
  'unauthorized_script', 'replacement_char', 'mojibake', 'nullish_text', 'empty_required',
];

export interface LangViolation {
  severity: 'blocking' | 'warning';
  itemId: string;
  field: string;
  route: string;
  locale: TextLocale;
  kind: LangViolationKind;
  /** 違反箇所の抜粋（前後含む短い文字列） */
  offending: string;
  /** 違反文字のUnicode code point（U+XXXX 形式） */
  codePoints: string[];
  /** 検出したScript名（unauthorized_script のときのみ） */
  script?: string;
  origin: LangCheckInput['origin'];
  sourceFile?: string;
  /** 推奨処理 */
  recommendation: 'HOLD' | 'SAFE_FALLBACK' | 'REGENERATE' | 'FIX_SOURCE';
}

/**
 * ja/zh 学習者表示テキストで許可しないUnicode Script。
 * 1文字でも含まれたら FAIL（§3）。
 */
const FORBIDDEN_SCRIPTS: { name: string; re: RegExp }[] = [
  // Unicode property escape を使う（範囲直書きは結合文字を含みlintに掛かるうえ、取りこぼす）
  { name: 'Cyrillic', re: /\p{Script=Cyrillic}/u },
  { name: 'Hangul', re: /\p{Script=Hangul}/u },
  { name: 'Arabic', re: /\p{Script=Arabic}/u },
  { name: 'Hebrew', re: /\p{Script=Hebrew}/u },
  { name: 'Devanagari', re: /\p{Script=Devanagari}/u },
  { name: 'Thai', re: /\p{Script=Thai}/u },
  // Greek: 数学記号として使われる α β 等も含め、学習者向け本文では使わない方針
  { name: 'Greek', re: /\p{Script=Greek}/u },
  { name: 'Armenian', re: /\p{Script=Armenian}/u },
  { name: 'Georgian', re: /\p{Script=Georgian}/u },
  { name: 'Mongolian', re: /\p{Script=Mongolian}/u },
  { name: 'Bengali', re: /\p{Script=Bengali}/u },
  { name: 'Tamil', re: /\p{Script=Tamil}/u },
  { name: 'Myanmar', re: /\p{Script=Myanmar}/u },
  { name: 'Khmer', re: /\p{Script=Khmer}/u },
  { name: 'Ethiopic', re: /\p{Script=Ethiopic}/u },
];

/** 学習者向け本文で許可するLatin token（§2）。これ以外の連続Latin語はUI言語として不自然 */
export const ALLOWED_LATIN_TOKENS = [
  'JLPT', 'N1', 'N2', 'N3', 'N4', 'N5', 'AI', 'XP', 'OK', 'NG', 'URL', 'PDF',
  'WeChat', 'https', 'http', 'www', 'kawabado', 'com',
];

const kanaRe = /[\u3041-\u309F\u30A1-\u30FA\u31F0-\u31FF]/;

/**
 * 中国語の解説の中に**そのまま出してよい文法用語**（2026-08-22）。
 *
 * 「た形」「ます形」「い形容詞」は日本語教育の用語で、生徒も授業でこの形のまま覚える。
 * これを「引用外の日本語」として毎回警告すると、本当に直すべきもの
 * （中国語の文に日本語の例文が地の文で混ざっている箇所）が埋もれる。
 * **用語だけ**を許可し、例文・単語は今までどおり引用を求める。
 * 追加するときは「授業で日本語のまま教える用語か」で判断すること。
 */
export const ZH_ALLOWED_JA_TERMS = [
  // 活用形
  'ます形', 'ません形', 'た形', 'て形', 'で形', 'ない形', 'なかった形', '辞書形', '普通形', '丁寧形',
  'ば形', 'たら形', 'よう形', '意志形', '可能形', '受身形', '使役形', '使役受身形', '命令形', '禁止形',
  '連用形', '連体形', '仮定形', '未然形', '終止形', '已然形',
  // 品詞
  'い形容詞', 'な形容詞', 'イ形容詞', 'ナ形容詞', 'い形容词', 'な形容词', 'する動詞', 'ます形の語幹', '語幹',
  // 待遇表現
  '尊敬語', '謙譲語', '丁寧語', 'です・ます体', 'だ体', 'である体',
  // よく使う説明語
  '五段動詞', '一段動詞', '不規則動詞', '音便', 'イ音便', '促音便', '撥音便', '長音',
] as const;

/**
 * 世界の固有名詞（2026-08-22）。地名・相棒の名前は**日本語のまま出すのが正しい**。
 * 中国語画面でも「ソラノ塔」「ナツ」と出す設計なので、これを「訳し漏れ」として
 * 警告し続けると、本当に訳すべき解説文が埋もれる。名前を増やしたらここへ追記する。
 */
export const ZH_ALLOWED_JA_NAMES = [
  'ミナモ列島', 'ソラノ塔', 'カタリ港', 'オモイデ庭園', '記憶の書庫', '文法の工房', '会話の広場',
  '冒険の記録', 'ミナト', 'ヒノデ台', 'トオリミチ', 'イチバ通り', 'ユカリの森', 'ハタラキ街',
  'カタチの遺跡', 'ナツ', 'ハル', 'アキ', '翔子', '悠斗',
] as const;

/** 用語を伏せた「地の文」。用語は許可済みなので検出対象から外す */
const stripAllowedTerms = (text: string): string => {
  let out = text;
  // 長いものから消す（「ます形の語幹」を「ます形」で先に消さない）
  for (const t of [...ZH_ALLOWED_JA_TERMS, ...ZH_ALLOWED_JA_NAMES].sort((a, b) => b.length - a.length)) {
    out = out.split(t).join('');
  }
  return out;
};

/** 「」『』""''（）() 内を除去した「地の文」を返す（zhフィールドの引用外仮名検出用） */
export const stripQuoted = (text: string): string =>
  text
    .replace(/「[^」]*」/g, '')
    .replace(/『[^』]*』/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/“[^”]*”/g, '')
    .replace(/‘[^’]*’/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '');

const codePointsOf = (s: string): string[] =>
  [...s].map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`);

const excerpt = (text: string, index: number, len = 1): string => {
  const start = Math.max(0, index - 12);
  const end = Math.min(text.length, index + len + 12);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
};

/**
 * 1テキストを検査して違反リストを返す（違反が無ければ空配列）。
 * neutral locale は script 検査のみ（数値・記号想定）。
 */
export const checkText = (input: LangCheckInput): LangViolation[] => {
  const { itemId, field, locale, text, route, origin, sourceFile } = input;
  const out: LangViolation[] = [];
  const base = { itemId, field, route, locale, origin, sourceFile };
  const sev = (kind: LangViolationKind): 'blocking' | 'warning' =>
    (BLOCKING_KINDS.includes(kind) ? 'blocking' : 'warning');

  // null/undefined が文字列化して表示されるのを防ぐ
  if (text === undefined || text === null) {
    out.push({ ...base, severity: sev('nullish_text'), kind: 'nullish_text', offending: String(text), codePoints: [], recommendation: 'FIX_SOURCE' });
    return out;
  }
  if (/\b(undefined|null|NaN|\[object Object\])\b/.test(text)) {
    out.push({ ...base, severity: sev('nullish_text'), kind: 'nullish_text', offending: text.slice(0, 60), codePoints: [], recommendation: 'FIX_SOURCE' });
  }
  if (text.includes('�')) {
    const i = text.indexOf('�');
    out.push({ ...base, severity: sev('replacement_char'), kind: 'replacement_char', offending: excerpt(text, i), codePoints: ['U+FFFD'], recommendation: 'FIX_SOURCE' });
  }
  // 典型的なmojibake（UTF-8をLatin-1で読んだ痕跡）
  if (/[ãâä][-¿]{1,2}/.test(text) || text.includes('ï¿½')) {
    out.push({ ...base, severity: sev('mojibake'), kind: 'mojibake', offending: text.slice(0, 60), codePoints: [], recommendation: 'FIX_SOURCE' });
  }

  for (const { name, re } of FORBIDDEN_SCRIPTS) {
    const m = re.exec(text);
    if (!m) continue;
    // 連続する同Script文字をまとめて報告
    const wide = new RegExp(`${re.source}+`, 'gu');
    const hit = wide.exec(text);
    const bad = hit ? hit[0] : m[0];
    out.push({
      ...base,
      severity: 'blocking',
      kind: 'unauthorized_script',
      script: name,
      offending: excerpt(text, m.index, bad.length),
      codePoints: codePointsOf(bad),
      recommendation: origin === 'generated' ? 'REGENERATE' : 'FIX_SOURCE',
    });
  }

  // zh フィールドの地の文に仮名が出てはいけない（対象日本語は引用内 or targetJapanese へ）
  if (locale === 'zh') {
    const plain = stripAllowedTerms(stripQuoted(text));
    const m = kanaRe.exec(plain);
    if (m) {
      out.push({
        ...base,
        severity: 'warning',
        kind: 'unquoted_kana_in_zh',
        offending: excerpt(plain, m.index),
        codePoints: codePointsOf(m[0]),
        recommendation: 'FIX_SOURCE',
      });
    }
  }

  return out;
};

/** 必須テキストが空でないこと（欠損解説の検出） */
export const checkRequired = (input: LangCheckInput): LangViolation[] => {
  if (input.text && input.text.trim().length > 0) return checkText(input);
  return [{
    severity: 'blocking',
    itemId: input.itemId, field: input.field, route: input.route, locale: input.locale,
    kind: 'empty_required', offending: '', codePoints: [], origin: input.origin,
    sourceFile: input.sourceFile, recommendation: 'HOLD',
  }];
};

export interface LangReport {
  checked: number;
  /** ビルドを止める違反 */
  violations: LangViolation[];
  /** 様式上の指摘（件数とIDは必ず出す） */
  warnings: LangViolation[];
  byKind: Record<string, number>;
  byScript: Record<string, number>;
  pass: boolean;
}

/** 複数テキストをまとめて検査 */
export const runLanguageCheck = (inputs: LangCheckInput[], requiredFields: string[] = []): LangReport => {
  const all: LangViolation[] = [];
  for (const input of inputs) {
    all.push(...(requiredFields.includes(input.field) ? checkRequired(input) : checkText(input)));
  }
  const byKind: Record<string, number> = {};
  const byScript: Record<string, number> = {};
  for (const v of all) {
    byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
    if (v.script) byScript[v.script] = (byScript[v.script] ?? 0) + 1;
  }
  const violations = all.filter((v) => v.severity === 'blocking');
  const warnings = all.filter((v) => v.severity === 'warning');
  return { checked: inputs.length, violations, warnings, byKind, byScript, pass: violations.length === 0 };
};

/** 違反1件の1行表示（scriptログ・監査docs用） */
export const formatViolation = (v: LangViolation): string =>
  [
    v.severity, v.itemId, v.field, v.route, v.locale, v.kind, v.script ?? '-',
    JSON.stringify(v.offending), v.codePoints.join(' '), v.origin,
    v.sourceFile ?? '-', v.recommendation,
  ].join('\t');

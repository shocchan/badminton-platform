// ログインIDと6文字パスワードの仕様（PAID STUDENT PILOT §2）。
//
// 方針の要点:
//   - 生徒が覚えるのは「ログインID」と「6文字の英数字」の2つだけ
//   - 初回も2回目以降も**同じ方式**。4桁PIN・初回専用コードは作らない
//   - 手入力の揺れ（全角・大文字小文字・空白・ハイフン）はこちらで吸収する
//
// この層は純関数。DBにもネットワークにも触れないので、境界の判断は呼び出し側が持つ。

/** 生成時に使う文字集合。読み間違えやすい 0 O 1 I L を除く（§2） */
const SAFE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // I, L, O を除外
const SAFE_DIGITS = '23456789';                    // 0, 1 を除外

export const PASSWORD_LENGTH = 6;

/**
 * 区切りとして打たれうる文字。
 * 半角ハイフンだけを見ていると、日本語IMEの全角ハイフン `－`(U+FF0D) や
 * 長音記号 `ー`(U+30FC)、中国語入力の全角ダッシュで照合が落ちる（実測で発見）。
 */
const DASHES = /[-‐-―−ー－ｰ]/g;
// 全角スペース(U+3000)はエスケープで書く。生で書くと不可視で読み手が判別できない
const SPACES = /[\s\u3000]/g;

/** 全角英数字 → 半角。ここだけ0xfee0オフセットで変換できる */
const toHalfWidthAlnum = (s: string): string =>
  s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 入力の正規化。**照合の前に必ず通す。**
 * - 全角英数字 → 半角（学習者はスマホの日本語入力から打つことがある）
 * - 空白・各種ハイフン → 除去（「K7M3-Q8」「K7M3 Q8」と書き写す人がいる）
 * - 英字は大文字へ寄せる（大小を区別しない＝§2）
 */
export const normalizePassword = (raw: string): string =>
  toHalfWidthAlnum(raw).replace(SPACES, '').replace(DASHES, '').toUpperCase();

/** ログインIDも同じ揺れを吸収する（`mn-4k7q`・`ＭＮ－４Ｋ７Ｑ` と打っても通す） */
export const normalizeLoginId = (raw: string): string =>
  toHalfWidthAlnum(raw).replace(SPACES, '').replace(DASHES, '-').toUpperCase();

export type PasswordProblem =
  | 'wrong_length'
  | 'not_alphanumeric'
  | 'needs_letter'
  | 'needs_digit';

export interface PasswordCheck {
  ok: boolean;
  /** 正規化後の値。保存・照合にはこちらを使う */
  normalized: string;
  problems: PasswordProblem[];
}

/**
 * 6文字英数字パスワードの検査（§2）。
 * 数字だけ・英字だけは許可しない。総当たりに弱くなるため。
 */
export const checkPassword = (raw: string): PasswordCheck => {
  const normalized = normalizePassword(raw);
  const problems: PasswordProblem[] = [];

  if (normalized.length !== PASSWORD_LENGTH) problems.push('wrong_length');
  if (!/^[A-Z0-9]*$/.test(normalized)) problems.push('not_alphanumeric');
  if (!/[A-Z]/.test(normalized)) problems.push('needs_letter');
  if (!/[0-9]/.test(normalized)) problems.push('needs_digit');

  return { ok: problems.length === 0, normalized, problems };
};

/** 学習者へ出す文言。何が足りないかは言うが、正解は言わない */
export const passwordProblemText = (p: PasswordProblem, lang: 'ja' | 'zh'): string => {
  const t = {
    wrong_length: ['半角の英数字6文字で入力してください。', '请输入6位半角英文和数字。'],
    not_alphanumeric: ['英字と数字だけが使えます（記号は使いません）。', '只能使用英文字母和数字（不使用符号）。'],
    needs_letter: ['英字を1文字以上入れてください。', '请至少包含1个英文字母。'],
    needs_digit: ['数字を1文字以上入れてください。', '请至少包含1个数字。'],
  }[p];
  return lang === 'zh' ? t[1] : t[0];
};

/**
 * 配布用パスワードの生成。
 * 誤読しやすい文字を使わず、英字と数字を必ず混ぜる。
 * 乱数は呼び出し側から渡す（テストで固定でき、本番は crypto を渡す）。
 */
export const generatePassword = (randomInt: (maxExclusive: number) => number): string => {
  const pool = SAFE_LETTERS + SAFE_DIGITS;
  const chars: string[] = [
    SAFE_LETTERS[randomInt(SAFE_LETTERS.length)],
    SAFE_DIGITS[randomInt(SAFE_DIGITS.length)],
  ];
  while (chars.length < PASSWORD_LENGTH) chars.push(pool[randomInt(pool.length)]);
  // 英字・数字が先頭に固定されないよう混ぜる
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** ブラウザ・Workerの安全な乱数を使う版 */
export const generatePasswordSecure = (): string =>
  generatePassword((max) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    // 剰余の偏りを避ける（max が 2^32 を割り切らないため）
    const limit = Math.floor(0xffffffff / max) * max;
    let v = buf[0];
    while (v >= limit) {
      crypto.getRandomValues(buf);
      v = buf[0];
    }
    return v % max;
  });

/**
 * ログインIDの生成。`MN-4K7Q` の形（読み上げ・書き写しやすさ優先）。
 * 誤読文字を除いた集合から作るので、電話や紙で伝えても取り違えにくい。
 */
export const generateLoginId = (randomInt: (maxExclusive: number) => number): string => {
  const pool = SAFE_LETTERS + SAFE_DIGITS;
  const head = [SAFE_LETTERS[randomInt(SAFE_LETTERS.length)], SAFE_LETTERS[randomInt(SAFE_LETTERS.length)]].join('');
  const tail = Array.from({ length: 4 }, () => pool[randomInt(pool.length)]).join('');
  return `${head}-${tail}`;
};

/** ログインIDの形式検査（入力欄の即時フィードバック用。存在確認はしない） */
export const isLoginIdShape = (raw: string): boolean =>
  /^[A-Z]{2}-?[A-Z0-9]{4}$/.test(normalizeLoginId(raw));

/** 保存・照合に使う正規形（ハイフンを必ず1つ入れた形へ揃える） */
export const canonicalLoginId = (raw: string): string => {
  const n = normalizeLoginId(raw).replace(/-/g, '');
  return n.length === 6 ? `${n.slice(0, 2)}-${n.slice(2)}` : normalizeLoginId(raw);
};

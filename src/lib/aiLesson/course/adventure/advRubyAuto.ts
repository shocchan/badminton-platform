// 設問・選択肢・聴解スクリプトへふりがなを付ける（2026-08-22）。
//
// 読解の本文には手書きの rubyJa があるが、設問・選択肢・聴解には無かった。
// ここは辞書引きで機械的に付ける。方針は3つだけ:
//
//  1. **漢字の連なりを分割しない。** 「三日」を「三」＋「日」と引くと "さんにち" になる。
//     連なり全体をキーにして、無ければ引かない。
//  2. **分からなければ出さない。** 辞書に無い連なりが1つでもあれば、その文字列全体で
//     null を返す。誤ったふりがなは、ふりがなが無いことよりずっと悪い（生徒はそれを覚える）。
//  3. **読みは辞書に集める。** 同じ語が場所によって違う読みになる事故を防ぐ。
//
// 表示は AdvRuby.tsx。`show` が false の級（N3/N2）では素の文字列を出す。
import { stripRuby } from '../../../../components/ai-course/adventure/advRubySegment';
import {
  RUBY_RUNS_FROM_PASSAGE, RUBY_RUNS_EXTRA, RUBY_CONTEXT_RULES, RUBY_RUNS_DEFAULT,
  RUBY_TEXT_OVERRIDES,
} from './advRubyDict';

/** まわりの字で読みが変わる連なりの規則 */
export interface RubyContextRule {
  /** 漢字の連なり（完全一致） */
  run: string;
  /** 直後がこのどれかで始まるときに使う */
  next?: string[];
  /** 直前がこのどれかで終わるときに使う（「空き箱」のような連濁） */
  prev?: string[];
  /** ルビ注釈済みの文字列。剥がすと run に一致すること */
  annotation: string;
}

/** 規則の細かさ。細かいものから先に見る */
const specificity = (r: RubyContextRule): number => {
  const n = r.next ? Math.max(...r.next.map((x) => x.length)) : 0;
  const p = r.prev ? Math.max(...r.prev.map((x) => x.length)) : 0;
  return (r.next && r.prev ? 100 : 0) + n * 10 + p;
};

const KANJI_RUN_RE = /[一-鿿々]+/g;

/** 文脈規則を run ごとに引けるようにまとめる（next は長い順に見る） */
const contextByRun = ((): Map<string, RubyContextRule[]> => {
  const m = new Map<string, RubyContextRule[]>();
  for (const r of RUBY_CONTEXT_RULES) {
    if (!m.has(r.run)) m.set(r.run, []);
    m.get(r.run)!.push(r);
  }
  for (const [, rules] of m) rules.sort((a, b) => specificity(b) - specificity(a));
  return m;
})();

/** 1つの連なりの注釈を引く。引けなければ null */
export const lookupRun = (run: string, next: string, prev = ''): string | null => {
  const rules = contextByRun.get(run);
  if (rules) {
    for (const r of rules) {
      if (r.next && !r.next.some((n) => next.startsWith(n))) continue;
      if (r.prev && !r.prev.some((x) => prev.endsWith(x))) continue;
      return r.annotation;
    }
  }
  return RUBY_RUNS_DEFAULT[run] ?? RUBY_RUNS_FROM_PASSAGE[run] ?? RUBY_RUNS_EXTRA[run] ?? null;
};

/**
 * 同じ文字列を何度も注釈しないためのキャッシュ。
 * 教材の設問・選択肢は画面を開くたびに同じ文字列を通るので、
 * 引き直す意味がない（辞書は静的で、実行中に変わらない）。
 */
const cache = new Map<string, string | null>();

/**
 * 文字列にふりがな注釈を付ける。
 * 漢字の連なりが1つでも辞書に無ければ **null**（部分的なふりがなは出さない）。
 */
export const annotateRuby = (text: string): string | null => {
  if (!text) return null;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const result = annotateUncached(text);
  cache.set(text, result);
  return result;
};

const annotateUncached = (text: string): string | null => {
  const override = RUBY_TEXT_OVERRIDES[text];
  if (override) return stripRuby(override) === text ? override : null;
  let out = '';
  let last = 0;
  let sawKanji = false;
  KANJI_RUN_RE.lastIndex = 0;
  for (let m = KANJI_RUN_RE.exec(text); m; m = KANJI_RUN_RE.exec(text)) {
    sawKanji = true;
    const next = text.slice(m.index + m[0].length, m.index + m[0].length + 3);
    const annotation = lookupRun(m[0], next, text.slice(Math.max(0, m.index - 3), m.index));
    if (annotation === null) return null;
    out += text.slice(last, m.index) + annotation;
    last = m.index + m[0].length;
  }
  if (!sawKanji) return null;
  out += text.slice(last);
  // 保険: 剥がして元に戻らない注釈は出さない（辞書の書き間違いを画面に出さない）
  return stripRuby(out) === text ? out : null;
};

/** 辞書に無い連なりを列挙する（テストと点検スクリプト用） */
export const missingRuns = (text: string): string[] => {
  const out: string[] = [];
  if (!text || RUBY_TEXT_OVERRIDES[text]) return out;
  KANJI_RUN_RE.lastIndex = 0;
  for (let m = KANJI_RUN_RE.exec(text); m; m = KANJI_RUN_RE.exec(text)) {
    const next = text.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (lookupRun(m[0], next, text.slice(Math.max(0, m.index - 3), m.index)) === null) out.push(m[0]);
  }
  return out;
};

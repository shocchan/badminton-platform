// 文法問題のvariant決定的生成（§18・D-007/D-008）。
// 狙い: 1項目1問（authored recognition）の暗記で80%攻略できてしまう構造を壊す。
// 原則:
// - 実行時LLM生成はしない。既存draft本文からの決定的変換のみ（seed固定・テストで全件検査可能）
// - distractorは「同義・類似」を両方向に除外（複数正解の主因＝G2教訓）
// - 生成できない項目は生成しない（存在するふりをしない・§18）
// - 機械検査（漏洩0・重複0・解説必須・出典必須）を通った問題だけ emit ＝ validated_beta
import { seededShuffle } from './advDiagnosis';

/** N2GrammarDraft / N3GrammarDraft 共通の構造（structural typing・両方に適合） */
export interface GrammarDraftLike {
  grammarId: string;
  pattern: string;
  meaningJa: string;
  explanationZh: string;
  formation: string;
  examplesJa: string[];
  examplesZh: string[];
  similarPatterns: string[];
  recognition: { promptZh: string; options: string[]; answerIndex: number; explanationZh: string };
  matchKeys?: string[];
}

export type AdvQuestionType = 'rec' | 'cloze' | 'meaning' | 'form';

export interface AdvBattleQuestion {
  /** `${type}:${grammarId}` or `${type}:${grammarId}:${i}`（未出判定・台帳共有キー） */
  key: string;
  /** 文法variantは AdvQuestionType。単元問題は `u-${dimension}`（タイプ多様性判定に使う） */
  type: string;
  level: 'foundation' | 'n3' | 'n2';
  skill: 'grammar' | 'vocabulary';
  promptJa: string | null;
  promptZh: string;
  choices: string[];
  answerIndex: number;
  explanationZh: string;
  sourceId: string;
  status: 'authored' | 'validated_beta';
}

/** patternの照合キー（〜・（）・／を除いた実表記の候補） */
export const matchKeysOf = (d: GrammarDraftLike): string[] => {
  if (d.matchKeys && d.matchKeys.length > 0) return d.matchKeys;
  const base = d.pattern.replace(/[〜～]/g, '');
  const parts = base.split(/[／/]/).map((p) => p.replace(/（[^）]*）/g, '').trim()).filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [base];
};

const normalizePattern = (p: string): string => p.replace(/[〜～（）()／/\s]/g, '');

/**
 * 同義・類似の除外集合（両方向）。
 * - 自分の similarPatterns
 * - 相手の similarPatterns に自分が入っている項目
 * - 正規化patternが2文字以上の連続部分を共有する項目（一方だ/一方で・上は/上で 等の同族）
 */
export const buildExclusionSet = (self: GrammarDraftLike, all: GrammarDraftLike[]): Set<string> => {
  const ex = new Set<string>([self.grammarId]);
  const selfNorm = normalizePattern(self.pattern);
  const selfSims = new Set(self.similarPatterns.map(normalizePattern));
  for (const o of all) {
    if (o.grammarId === self.grammarId) continue;
    const oNorm = normalizePattern(o.pattern);
    if (selfSims.has(oNorm)) { ex.add(o.grammarId); continue; }
    if (o.similarPatterns.some((sp) => normalizePattern(sp) === selfNorm)) { ex.add(o.grammarId); continue; }
    if (sharesStem(selfNorm, oNorm)) { ex.add(o.grammarId); continue; }
  }
  return ex;
};

/**
 * 同族文型の保守的検出:
 * ① 2文字以上の連続部分文字列を共有（一方だ/一方で 等）
 * ② 漢字を1文字でも共有（上では/上は/以上は の「上」族 等。かな機能語は対象外）
 * 除外しすぎてもdistractor候補は十分残る（N2 178/N3 76）ため保守側に倒す。
 */
const sharesStem = (a: string, b: string): boolean => {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  for (let len = Math.min(s.length, 4); len >= 2; len--) {
    for (let i = 0; i + len <= s.length; i++) {
      if (l.includes(s.slice(i, i + len))) return true;
    }
  }
  const kanji = (t: string) => new Set(t.match(/[一-鿿]/g) ?? []);
  const ka = kanji(a);
  for (const c of kanji(b)) if (ka.has(c)) return true;
  return false;
};

/** 機械検査（§18/§30）。1つでも失敗した問題はemitしない */
export const validateQuestion = (q: AdvBattleQuestion): string[] => {
  const issues: string[] = [];
  if (q.choices.length < 3) issues.push('choices<3');
  if (new Set(q.choices.map((c) => c.trim())).size !== q.choices.length) issues.push('duplicate_choice');
  if (q.answerIndex < 0 || q.answerIndex >= q.choices.length) issues.push('answer_index_range');
  const correct = q.choices[q.answerIndex]?.trim() ?? '';
  if (correct.length === 0) issues.push('empty_correct');
  if (correct.length > 0 && q.promptZh.includes(correct)) issues.push('answer_leakage_zh');
  if (correct.length > 0 && q.promptJa !== null && q.promptJa.includes(correct)) issues.push('answer_leakage_ja');
  if (q.explanationZh.trim().length === 0) issues.push('missing_explanation');
  if (q.sourceId.trim().length === 0) issues.push('missing_source');
  return issues;
};

const shuffleChoices = (choices: string[], correctIdx: number, seed: number): { choices: string[]; answerIndex: number } => {
  const idx = choices.map((_, i) => i);
  const shuffled = seededShuffle(idx, seed);
  return {
    choices: shuffled.map((i) => choices[i]),
    answerIndex: shuffled.indexOf(correctIdx),
  };
};

/** 文字列seed（キーから決定的に） */
const hashSeed = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
};

/** 説明文の先頭節（distractor・meaning選択肢用）。pattern自体が含まれる説明は使わない（漏洩） */
const meaningClause = (d: GrammarDraftLike): string | null => {
  const first = d.explanationZh.split('。')[0]?.trim() ?? '';
  if (first.length < 2 || first.length > 40) return null;
  for (const k of matchKeysOf(d)) if (first.includes(k)) return null;
  return first;
};

interface GenContext {
  self: GrammarDraftLike;
  level: 'n3' | 'n2';
  /** distractor候補（除外集合適用済み・決定的順） */
  distractorPool: GrammarDraftLike[];
}

/** 1) authored recognition（既存問題の取り込み。G2監査済＝authored） */
const genRecognition = (ctx: GenContext): AdvBattleQuestion => ({
  key: `rec:${ctx.self.grammarId}`,
  type: 'rec', level: ctx.level, skill: 'grammar',
  promptJa: null,
  promptZh: ctx.self.recognition.promptZh,
  choices: ctx.self.recognition.options,
  answerIndex: ctx.self.recognition.answerIndex,
  explanationZh: ctx.self.recognition.explanationZh,
  sourceId: ctx.self.grammarId,
  status: 'authored',
});

/**
 * 2) cloze（例文の文型部分を＿＿に）。original_authored例文（index≥1）を優先し、
 *    どの例文にも照合キーが現れない場合は生成しない。
 */
const genCloze = (ctx: GenContext): AdvBattleQuestion[] => {
  const { self } = ctx;
  const keys = matchKeysOf(self);
  const out: AdvBattleQuestion[] = [];
  const order = self.examplesJa.map((_, i) => i).sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
  for (const exIdx of order) {
    const ex = self.examplesJa[exIdx];
    const hit = keys.find((k) => k.length >= 2 && ex.includes(k));
    if (!hit) continue;
    const blanked = ex.replace(hit, '＿＿');
    if (blanked === ex) continue;
    const distractors = ctx.distractorPool
      .map((d) => matchKeysOf(d).find((k) => k.length >= 2 && !ex.includes(k)))
      .filter((k): k is string => !!k && k !== hit)
      .filter((k, i, arr) => arr.indexOf(k) === i)
      .slice(0, 3);
    if (distractors.length < 3) continue;
    const seed = hashSeed(`cloze:${self.grammarId}:${exIdx}`);
    const { choices, answerIndex } = shuffleChoices([hit, ...distractors], 0, seed);
    out.push({
      key: `cloze:${self.grammarId}:${exIdx}`,
      type: 'cloze', level: ctx.level, skill: 'grammar',
      promptJa: blanked,
      promptZh: '＿＿に入る言葉はどれ？／填入＿＿的是哪个？',
      choices, answerIndex,
      explanationZh: `${self.pattern}：${self.explanationZh.split('。')[0]}。${self.examplesZh[exIdx] ?? ''}`,
      sourceId: self.grammarId,
      status: 'validated_beta',
    });
    if (out.length >= 2) break; // 1項目のclozeは最大2問（例文の使い切り防止）
  }
  return out;
};

/** 3) meaning（意味の選択）。説明文先頭節が漏洩なしで採れる項目のみ */
const genMeaning = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  const correct = meaningClause(self);
  if (!correct) return null;
  const distractors: string[] = [];
  for (const d of ctx.distractorPool) {
    const m = meaningClause(d);
    if (m && m !== correct && !distractors.includes(m)) distractors.push(m);
    if (distractors.length >= 3) break;
  }
  if (distractors.length < 3) return null;
  const seed = hashSeed(`meaning:${self.grammarId}`);
  const { choices, answerIndex } = shuffleChoices([correct, ...distractors], 0, seed);
  return {
    key: `meaning:${self.grammarId}`,
    type: 'meaning', level: ctx.level, skill: 'grammar',
    promptJa: null,
    promptZh: `「${self.pattern}」的意思最接近哪个？`,
    choices, answerIndex,
    explanationZh: self.explanationZh,
    sourceId: self.grammarId,
    status: 'validated_beta',
  };
};

/** 4) formation（接続の選択）。formation文字列が十分異なる項目のみ */
const genFormation = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  const correct = self.formation.trim();
  if (correct.length < 4) return null;
  // 接続文字列に文型そのものが含まれるのは通常（「＋あげく」等）＝漏洩ではなく成立条件。
  // ただし選択肢同士の識別性を保つため、末尾の「＋文型」部分を取り除いた形で比較する
  const stripTail = (f: string): string => f.split('＋')[0].trim();
  const correctBody = stripTail(correct);
  if (correctBody.length < 3) return null;
  const distractors: string[] = [];
  for (const d of ctx.distractorPool) {
    const body = stripTail(d.formation.trim());
    if (body.length >= 3 && body !== correctBody && !distractors.includes(body)) distractors.push(body);
    if (distractors.length >= 3) break;
  }
  if (distractors.length < 3) return null;
  const seed = hashSeed(`form:${self.grammarId}`);
  const { choices, answerIndex } = shuffleChoices([correctBody, ...distractors], 0, seed);
  return {
    key: `form:${self.grammarId}`,
    type: 'form', level: ctx.level, skill: 'grammar',
    promptJa: null,
    promptZh: `「${self.pattern}」的接续是哪个？`,
    choices, answerIndex,
    explanationZh: `接续：${self.formation}`,
    sourceId: self.grammarId,
    status: 'validated_beta',
  };
};

export interface VariantPoolResult {
  /** grammarId → 検査PASSした問題（recognition含む） */
  byItem: Map<string, AdvBattleQuestion[]>;
  /** 生成できなかった/検査で落ちた集計（存在するふりをしないための可視化） */
  rejected: { key: string; issues: string[] }[];
  stats: { items: number; questions: number; byType: Record<AdvQuestionType, number>; multiVariantItems: number };
}

/**
 * 項目群からvariantプールを構築（決定的）。
 * aliasIds は出題対象から除外（canonicalのみ）。
 */
export const buildVariantPool = (
  drafts: GrammarDraftLike[], level: 'n3' | 'n2', aliasIds: Set<string> = new Set(),
): VariantPoolResult => {
  const canonical = drafts.filter((d) => !aliasIds.has(d.grammarId));
  const byItem = new Map<string, AdvBattleQuestion[]>();
  const rejected: { key: string; issues: string[] }[] = [];
  const byType: Record<AdvQuestionType, number> = { rec: 0, cloze: 0, meaning: 0, form: 0 };

  for (const self of canonical) {
    const exclusion = buildExclusionSet(self, canonical);
    // distractor候補は決定的順（grammarId昇順を項目ごとにseed回転）
    const pool = canonical.filter((d) => !exclusion.has(d.grammarId));
    const rotated = seededShuffle(pool, hashSeed(self.grammarId));
    const ctx: GenContext = { self, level, distractorPool: rotated };

    const candidates: AdvBattleQuestion[] = [
      genRecognition(ctx),
      ...genCloze(ctx),
      ...[genMeaning(ctx)].filter((q): q is AdvBattleQuestion => q !== null),
      ...[genFormation(ctx)].filter((q): q is AdvBattleQuestion => q !== null),
    ];
    const ok: AdvBattleQuestion[] = [];
    for (const q of candidates) {
      const issues = validateQuestion(q);
      if (issues.length === 0) ok.push(q);
      else rejected.push({ key: q.key, issues });
    }
    byItem.set(self.grammarId, ok);
    for (const q of ok) byType[q.type as AdvQuestionType] += 1; // 生成器は4タイプのみemitする
  }

  const questions = [...byItem.values()].reduce((n, qs) => n + qs.length, 0);
  const multiVariantItems = [...byItem.values()].filter((qs) => new Set(qs.map((q) => q.type)).size >= 2).length;
  return { byItem, rejected, stats: { items: canonical.length, questions, byType, multiVariantItems } };
};

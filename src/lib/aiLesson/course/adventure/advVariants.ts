// 文法問題のvariant決定的生成（§18・D-007/D-008 ＋ ASSESSMENT INTEGRITY §10〜§15）。
//
// 原則:
// - 実行時LLM生成はしない。既存draft本文からの決定的変換のみ（seed固定・テストで全件検査可能）
// - distractorは「同義・類似」を両方向に除外し、接続互換・文末互換を満たすものだけ採る
// - **正解はindexではなくchoiceIdで保持**（表示順はattempt時にシャッフルする＝位置バイアス排除）
// - 生成できない項目は生成しない（存在するふりをしない）
// - 機械検査（漏洩0・重複0・複数正解0・解説必須・出典必須・妥当性）を通った問題だけ emit
import { seededShuffle } from './advDiagnosis';
import {
  checkQuestionValidity, connectionHead, isConnectionCompatible, endingCategory,
  type ValidityIssue,
} from './advQuestionValidity';
import { skillOfQuestionType, SECTION_OF_SKILL, type ExamSection, type ExamSkill } from './advExamSkills';

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
  recognition: {
    promptZh: string; options: string[]; answerIndex: number; explanationZh: string;
    distractorReason?: string;
  };
  contrast?: string;
  matchKeys?: string[];
}

export type AdvQuestionType = 'rec' | 'cloze' | 'meaning' | 'form';

/** 選択肢。正解は **isCorrect** が持ち、表示位置では判定しない（§11） */
export interface AdvChoice {
  /** 安定ID。表示順が変わっても不変（採点キー） */
  choiceId: string;
  textJa: string;
  /** 中国語gloss（あれば）。無い場合はtextJaをそのまま表示 */
  textZh?: string;
  isCorrect: boolean;
  /** なぜ違うか（§4「他の選択肢が違う理由」） */
  whyWrongJa?: string;
  whyWrongZh?: string;
}

/** 正解後に表示する説明（§4の必須項目） */
export interface AdvExplanation {
  meaningJa: string;
  meaningZh: string;
  whyCorrectJa: string;
  whyCorrectZh: string;
  exampleJa: string | null;
  exampleZh: string | null;
  sourceItemId: string;
  /** 出典の文法項目の表記（〜以上は 等） */
  sourceLabel: string;
}

export interface AdvBattleQuestion {
  /** `${type}:${grammarId}` or `${type}:${grammarId}:${i}`（未出判定・台帳共有キー） */
  key: string;
  /** 文法variantは AdvQuestionType。単元問題は `u-${dimension}` */
  type: string;
  level: 'foundation' | 'n3' | 'n2';
  /** 鍛えている試験科目（§10） */
  skill: ExamSkill;
  examSection: ExamSection;
  /** 学習対象の日本語（zh画面でもそのまま表示する・§2） */
  targetJapanese: string | null;
  /** 設問文（ja / zh を分離。片方しか無い場合はnull） */
  questionJa: string | null;
  questionZh: string;
  choices: AdvChoice[];
  explanation: AdvExplanation;
  sourceItemId: string;
  difficulty: 1 | 2 | 3;
  timed: boolean;
  variantId: string;
  reviewState: 'generated_draft' | 'validated_beta' | 'authored';
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
 * 同族文型の保守的検出:
 * ① 2文字以上の連続部分文字列を共有（一方だ/一方で 等）
 * ② 漢字を1文字でも共有（上では/上は/以上は の「上」族 等）
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

/** 同義・類似の除外集合（両方向） */
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

/** 機械検査（§18/§30）。1つでも失敗した問題はemitしない */
export const validateQuestion = (q: AdvBattleQuestion): string[] => {
  const issues: string[] = [];
  if (q.choices.length < 3) issues.push('choices<3');
  const texts = q.choices.map((c) => c.textJa.trim());
  if (new Set(texts).size !== texts.length) issues.push('duplicate_choice');
  const correctList = q.choices.filter((c) => c.isCorrect);
  if (correctList.length !== 1) issues.push(correctList.length === 0 ? 'no_correct' : 'multiple_correct');
  const ids = q.choices.map((c) => c.choiceId);
  if (new Set(ids).size !== ids.length) issues.push('duplicate_choice_id');
  const correct = correctList[0]?.textJa.trim() ?? '';
  if (correct.length === 0) issues.push('empty_correct');
  if (correct.length > 0 && q.questionZh.includes(correct)) issues.push('answer_leakage_zh');
  if (correct.length > 0 && q.questionJa !== null && q.questionJa.includes(correct)) issues.push('answer_leakage_ja');
  if (q.explanation.whyCorrectZh.trim().length === 0) issues.push('missing_explanation_zh');
  if (q.explanation.whyCorrectJa.trim().length === 0) issues.push('missing_explanation_ja');
  if (q.explanation.sourceItemId.trim().length === 0) issues.push('missing_source');
  return issues;
};

/** 文字列seed（キーから決定的に） */
export const hashSeed = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
};

const CHOICE_IDS = ['choice-a', 'choice-b', 'choice-c', 'choice-d', 'choice-e'];

/** 選択肢配列を作る。**correctは常に配列先頭に置かず、choiceIdは元の並びで固定**（採点はisCorrect） */
const mkChoices = (
  correct: { ja: string; zh?: string },
  wrongs: { ja: string; zh?: string; whyJa?: string; whyZh?: string }[],
): AdvChoice[] => {
  const all = [
    { ...correct, isCorrect: true, whyJa: undefined as string | undefined, whyZh: undefined as string | undefined },
    ...wrongs.map((w) => ({ ...w, isCorrect: false })),
  ];
  return all.map((c, i) => ({
    choiceId: CHOICE_IDS[i] ?? `choice-${i}`,
    textJa: c.ja,
    textZh: c.zh,
    isCorrect: c.isCorrect,
    whyWrongJa: c.isCorrect ? undefined : c.whyJa,
    whyWrongZh: c.isCorrect ? undefined : c.whyZh,
  }));
};

/**
 * 選択肢の長さ均質性（§3「文体・時制・registerが揃う」の機械的近似）。
 * 長さが極端に違うと、内容を読まずに正解を推測できてしまう。
 * 検査（lengthSpread 3.2）より厳しめの 2.2 倍以内で採る。
 */
const lengthCompatible = (correct: string, cand: string): boolean => {
  const a = correct.length; const b = cand.length;
  if (a === 0 || b === 0) return false;
  const ratio = a >= b ? a / b : b / a;
  return ratio <= 2.2;
};

const meaningClause = (d: GrammarDraftLike): string | null => {
  const first = d.explanationZh.split('。')[0]?.trim() ?? '';
  if (first.length < 2 || first.length > 40) return null;
  for (const k of matchKeysOf(d)) if (first.includes(k)) return null;
  return first;
};

const mkExplanation = (d: GrammarDraftLike, whyJa: string, whyZh: string, exIdx = 0): AdvExplanation => ({
  meaningJa: d.meaningJa,
  meaningZh: d.explanationZh,
  whyCorrectJa: whyJa,
  whyCorrectZh: whyZh,
  exampleJa: d.examplesJa[exIdx] ?? d.examplesJa[0] ?? null,
  exampleZh: d.examplesZh[exIdx] ?? d.examplesZh[0] ?? null,
  sourceItemId: d.grammarId,
  sourceLabel: d.pattern,
});

interface GenContext {
  self: GrammarDraftLike;
  level: 'n3' | 'n2';
  /** distractor候補（除外集合適用済み・決定的順） */
  distractorPool: GrammarDraftLike[];
}

const baseFields = (type: AdvQuestionType, level: 'n3' | 'n2', d: GrammarDraftLike) => {
  const skill = skillOfQuestionType(type);
  return {
    type, level, skill, examSection: SECTION_OF_SKILL[skill],
    sourceItemId: d.grammarId,
    timed: false,
    reviewState: (type === 'rec' ? 'authored' : 'validated_beta') as AdvBattleQuestion['reviewState'],
    status: (type === 'rec' ? 'authored' : 'validated_beta') as AdvBattleQuestion['status'],
  };
};

/** 1) authored recognition（既存問題の取り込み）。妥当性検査を通ったものだけ採用 */
const genRecognition = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  const rec = self.recognition;
  const validity = checkQuestionValidity({
    promptJa: null, promptZh: rec.promptZh, choices: rec.options, answerIndex: rec.answerIndex,
    synonymGroups: [self.similarPatterns],
  });
  if (!validity.ok) return null; // 不適切なauthored問題はHOLD（呼び出し側で記録）

  const correctText = rec.options[rec.answerIndex];
  const wrongs = rec.options
    .map((o, i) => ({ o, i }))
    .filter(({ i }) => i !== rec.answerIndex)
    .map(({ o }) => ({
      ja: o,
      whyJa: rec.distractorReason ?? `「${self.pattern}」の使い方に合いません。`,
      whyZh: rec.distractorReason ?? `不符合「${self.pattern}」的用法。`,
    }));
  // 見出し（pattern）が正解選択肢を割ってしまう場合は見出しを出さない
  // （2026-08-17 監査P1: pattern⊂正解 かつ 誤答には含まれない構図だと、
  // 見出しと選択肢の文字照合だけで正解できてしまう）
  const patternRevealsAnswer = correctText.includes(self.pattern)
    && !wrongs.some((w) => w.ja.includes(self.pattern));
  return {
    ...baseFields('rec', ctx.level, self),
    key: `rec:${self.grammarId}`,
    targetJapanese: patternRevealsAnswer ? null : self.pattern,
    questionJa: null,
    questionZh: rec.promptZh,
    choices: mkChoices({ ja: correctText }, wrongs),
    explanation: mkExplanation(self, `「${self.pattern}」は${self.meaningJa}という意味です。`, rec.explanationZh),
    difficulty: 2,
    variantId: `rec-${self.grammarId}`,
  };
};

/** 2) cloze（例文の文型部分を＿＿に）。distractorは接続互換のある別文型のみ */
const genCloze = (ctx: GenContext): AdvBattleQuestion[] => {
  const { self } = ctx;
  const keys = matchKeysOf(self);
  const selfHead = connectionHead(self.formation);
  const out: AdvBattleQuestion[] = [];
  const order = self.examplesJa.map((_, i) => i).sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
  for (const exIdx of order) {
    const ex = self.examplesJa[exIdx];
    const hit = keys.find((k) => k.length >= 2 && ex.includes(k));
    if (!hit) continue;
    const blanked = ex.replace(hit, '＿＿');
    if (blanked === ex) continue;
    // 文型が例文に2回以上出る場合、1回だけの置換では答えが同じ文中に残る
    // （2026-08-17 監査P1）。残存があればこの例文は使わない
    if (keys.some((k) => k.length >= 2 && blanked.includes(k))) continue;
    // §3: 文法的に接続できる（接続互換）distractorのみ
    const cands = ctx.distractorPool
      .filter((d) => isConnectionCompatible(selfHead, connectionHead(d.formation)))
      .map((d) => ({ d, k: matchKeysOf(d).find((k) => k.length >= 2 && !ex.includes(k)) }))
      .filter((x): x is { d: GrammarDraftLike; k: string } => !!x.k && x.k !== hit);
    const picked: { d: GrammarDraftLike; k: string }[] = [];
    for (const c of cands) {
      if (!lengthCompatible(hit, c.k)) continue;
      if (picked.some((p) => p.k === c.k || sharesStem(normalizePattern(p.k), normalizePattern(c.k)))) continue;
      picked.push(c);
      if (picked.length >= 3) break;
    }
    if (picked.length < 3) continue;
    out.push({
      ...baseFields('cloze', ctx.level, self),
      key: `cloze:${self.grammarId}:${exIdx}`,
      targetJapanese: blanked,
      questionJa: '＿＿に入る言葉はどれですか。',
      questionZh: '填入＿＿的是哪一个？',
      choices: mkChoices(
        { ja: hit },
        picked.map(({ d, k }) => ({
          ja: k,
          whyJa: `「${d.pattern}」は${d.meaningJa}の意味で、この文には合いません。`,
          whyZh: `「${d.pattern}」的意思不同，与此句不符。`,
        })),
      ),
      explanation: mkExplanation(
        self,
        `この文は${self.meaningJa}を表すので「${self.pattern}」が入ります。接続は${self.formation}です。`,
        `${self.explanationZh}・接续：「${self.formation}」`,
        exIdx,
      ),
      difficulty: 2,
      variantId: `cloze-${self.grammarId}-${exIdx}`,
    });
    if (out.length >= 2) break;
  }
  return out;
};

/** 3) meaning（意味の選択）。選択肢は全て中国語gloss＝構造均質 */
const genMeaning = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  const correct = meaningClause(self);
  if (!correct) return null;
  const wrongs: { ja: string; whyJa?: string; whyZh?: string }[] = [];
  for (const d of ctx.distractorPool) {
    const m = meaningClause(d);
    if (!m || m === correct || wrongs.some((w) => w.ja === m)) continue;
    if (!lengthCompatible(correct, m)) continue;
    wrongs.push({
      ja: m,
      whyJa: `これは「${d.pattern}」の意味です。`,
      whyZh: `这是「${d.pattern}」的意思。`,
    });
    if (wrongs.length >= 3) break;
  }
  if (wrongs.length < 3) return null;
  return {
    ...baseFields('meaning', ctx.level, self),
    key: `meaning:${self.grammarId}`,
    targetJapanese: self.pattern,
    questionJa: `「${self.pattern}」の意味に最も近いものはどれですか。`,
    questionZh: `「${self.pattern}」的意思最接近哪一个？`,
    choices: mkChoices({ ja: correct }, wrongs),
    explanation: mkExplanation(
      self,
      `「${self.pattern}」は${self.meaningJa}という意味です。`,
      self.explanationZh,
    ),
    difficulty: 1,
    variantId: `meaning-${self.grammarId}`,
  };
};

/** 4) formation（接続の選択） */
const genFormation = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  const stripTail = (f: string): string => f.split('＋')[0].trim();
  const correctBody = stripTail(self.formation.trim());
  if (correctBody.length < 3) return null;
  const wrongs: { ja: string; whyJa?: string; whyZh?: string }[] = [];
  for (const d of ctx.distractorPool) {
    const body = stripTail(d.formation.trim());
    if (body.length < 3 || body === correctBody || wrongs.some((w) => w.ja === body)) continue;
    if (!lengthCompatible(correctBody, body)) continue;
    wrongs.push({
      ja: body,
      whyJa: `これは「${d.pattern}」の接続です。`,
      whyZh: `这是「${d.pattern}」的接续。`,
    });
    if (wrongs.length >= 3) break;
  }
  if (wrongs.length < 3) return null;
  return {
    ...baseFields('form', ctx.level, self),
    key: `form:${self.grammarId}`,
    targetJapanese: self.pattern,
    questionJa: `「${self.pattern}」の接続はどれですか。`,
    questionZh: `「${self.pattern}」的接续是哪一个？`,
    choices: mkChoices({ ja: correctBody }, wrongs),
    explanation: mkExplanation(
      self,
      `「${self.pattern}」の接続は「${self.formation}」です。`,
      `接续：「${self.formation}」`,
    ),
    difficulty: 3,
    variantId: `form-${self.grammarId}`,
  };
};

export interface HeldQuestion {
  key: string;
  sourceItemId: string;
  issues: ValidityIssue[];
  disposition: 'HOLD' | 'SAFE_FALLBACK';
  /** 参考: 正解の文末カテゴリ */
  correctCategory: string;
}

export interface VariantPoolResult {
  byItem: Map<string, AdvBattleQuestion[]>;
  rejected: { key: string; issues: string[] }[];
  /** 妥当性で保留した authored 問題（監査対象・§3のHOLD分類） */
  held: HeldQuestion[];
  stats: {
    items: number; questions: number;
    byType: Record<AdvQuestionType, number>;
    multiVariantItems: number;
    itemsWithZeroQuestions: string[];
  };
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
  const held: HeldQuestion[] = [];
  const byType: Record<AdvQuestionType, number> = { rec: 0, cloze: 0, meaning: 0, form: 0 };

  for (const self of canonical) {
    const exclusion = buildExclusionSet(self, canonical);
    const pool = canonical.filter((d) => !exclusion.has(d.grammarId));
    const rotated = seededShuffle(pool, hashSeed(self.grammarId));
    const ctx: GenContext = { self, level, distractorPool: rotated };

    const rec = genRecognition(ctx);
    if (!rec) {
      const v = checkQuestionValidity({
        promptJa: null, promptZh: self.recognition.promptZh,
        choices: self.recognition.options, answerIndex: self.recognition.answerIndex,
        synonymGroups: [self.similarPatterns],
      });
      held.push({
        key: `rec:${self.grammarId}`, sourceItemId: self.grammarId,
        issues: v.issues, disposition: 'HOLD',
        correctCategory: v.detail.correctCategory,
      });
    }

    const candidates: AdvBattleQuestion[] = [
      ...(rec ? [rec] : []),
      ...genCloze(ctx),
      ...[genMeaning(ctx)].filter((q): q is AdvBattleQuestion => q !== null),
      ...[genFormation(ctx)].filter((q): q is AdvBattleQuestion => q !== null),
    ];
    const ok: AdvBattleQuestion[] = [];
    for (const q of candidates) {
      const issues = validateQuestion(q);
      // 生成問題にも同じ妥当性基準を課す（選択肢の不均質・意味的断絶を出さない）
      const validity = checkQuestionValidity({
        promptJa: q.questionJa, promptZh: q.questionZh,
        choices: q.choices.map((c) => c.textJa),
        answerIndex: q.choices.findIndex((c) => c.isCorrect),
      });
      const all = [...issues, ...validity.blocking];
      if (all.length === 0) ok.push(q);
      else rejected.push({ key: q.key, issues: all });
    }
    byItem.set(self.grammarId, ok);
    for (const q of ok) byType[q.type as AdvQuestionType] += 1;
    // HOLDで0問になった項目は SAFE_FALLBACK として記録（存在するふりをしない）
    if (ok.length === 0) {
      const h = held.find((x) => x.sourceItemId === self.grammarId);
      if (h) h.disposition = 'SAFE_FALLBACK';
    }
  }

  const questions = [...byItem.values()].reduce((n, qs) => n + qs.length, 0);
  const multiVariantItems = [...byItem.values()].filter((qs) => new Set(qs.map((q) => q.type)).size >= 2).length;
  const itemsWithZeroQuestions = [...byItem.entries()].filter(([, qs]) => qs.length === 0).map(([id]) => id);
  return {
    byItem, rejected, held,
    stats: { items: canonical.length, questions, byType, multiVariantItems, itemsWithZeroQuestions },
  };
};

/** 監査用: endingCategory を再エクスポート（scriptから使う） */
export { endingCategory };

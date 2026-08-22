// 教育品質のrelease blockerガード（§11-§13・§23）。
// answer leakage P1が0であること、同形語に無意味な意味当てを出さないことを機械固定する。
import { describe, it, expect } from 'vitest';
import { auditPresentedQuestion, auditFoundationQuestion, meaningTokens } from './answerLeakage';
import { buildAssessQuestions, canAssess } from './assessQuestionEngine';
import { allowsCoreMeaningQuestion, highRiskCognateIds, COGNATE_PROFILES } from './cognateProfile';
import { COGNATE_CONTRAST_BANK, contrastQuestionsFor } from './cognateContrastBank';
import { allVocabularyItems } from '../foundationVocabBank';
import { BUNDLE as U1 } from '../foundationUnit1';
import { UNIT2_QUESTIONS } from '../foundationUnit2';
import { UNIT3_QUESTIONS } from '../foundationUnit3';
import { UNIT4_QUESTIONS } from '../foundationUnit4';
import { UNIT5_QUESTIONS } from '../foundationUnit5';
import { UNIT6_QUESTIONS } from '../foundationUnit6';
import { CHAPTER1_QUESTS } from '../rpg/chapter1Data';

const pool = allVocabularyItems();
const itemById = new Map(pool.map(i => [i.id, i]));
const foundationQuestions = [...U1.questions, ...UNIT2_QUESTIONS, ...UNIT3_QUESTIONS,
  ...UNIT4_QUESTIONS, ...UNIT5_QUESTIONS, ...UNIT6_QUESTIONS];

describe('Answer leakage 検出器', () => {
  it('中国語訳を同一画面に出すと assess で P1 として検出される（回帰防止）', () => {
    const f = auditPresentedQuestion({
      questionId: 'x', phase: 'assess',
      teachTexts: ['和朋友见面。'], promptTexts: ['「会う」の意味は？'],
      choices: ['见面', '喝', '写'], correctAnswer: '见面',
    });
    expect(f.some(x => x.kind === 'answer_in_teach_text' && x.releaseBlocker)).toBe(true);
  });
  it('teachフェーズでは答えの露出を検出しない（設計どおり）', () => {
    const f = auditPresentedQuestion({
      questionId: 'x', phase: 'teach',
      teachTexts: ['和朋友见面。'], promptTexts: ['「会う」の意味は？'],
      choices: ['见面', '喝', '写'], correctAnswer: '见面',
    });
    expect(f.filter(x => x.releaseBlocker)).toEqual([]);
  });
  it('意味文字列から核となる語を取り出す', () => {
    expect(meaningTokens('（自）变化；改变')).toEqual(['变化', '改变']);
    expect(meaningTokens('老师')).toEqual(['老师']);
  });
  it('選択肢重複・正解不在・長さ偏りを検出する', () => {
    const dup = auditPresentedQuestion({ questionId: 'd', phase: 'assess', teachTexts: [],
      promptTexts: ['?'], choices: ['a', 'a', 'b'], correctAnswer: 'a' });
    expect(dup.some(x => x.kind === 'duplicate_choice')).toBe(true);
    const missing = auditPresentedQuestion({ questionId: 'm', phase: 'assess', teachTexts: [],
      promptTexts: ['?'], choices: ['a', 'b'], correctAnswer: 'z' });
    expect(missing.some(x => x.kind === 'answer_not_in_choices')).toBe(true);
  });
});

describe('生成されるassess問題は答えを漏らさない（P1=0）', () => {
  it('全140語のassess問題に release blocker が 0 件', () => {
    const blockers: string[] = [];
    for (const item of pool) {
      for (const q of buildAssessQuestions(item, pool, { introduced: false })) {
        const f = auditPresentedQuestion({
          questionId: q.questionId, phase: 'assess', kind: q.kind, teachTexts: [],
          promptTexts: [q.promptJa, q.promptZh], choices: q.choices,
          correctAnswer: q.choices[q.answerIndex],
        });
        for (const x of f.filter(y => y.releaseBlocker)) blockers.push(`${q.questionId}: ${x.kind}`);
      }
    }
    expect(blockers).toEqual([]);
  });
  it('Chapter 1の全学習語がassess可能（untested 0）', () => {
    for (const q of CHAPTER1_QUESTS) {
      for (const id of q.learningItemIds) {
        expect(canAssess(itemById.get(id)!, pool), `${id} にassess問題が作れない`).toBe(true);
      }
    }
  });
  it('正解の位置が偏らない（先頭固定でない）', () => {
    const counts: Record<number, number> = {};
    for (const item of pool) {
      for (const q of buildAssessQuestions(item, pool, { introduced: false })) {
        counts[q.answerIndex] = (counts[q.answerIndex] ?? 0) + 1;
      }
    }
    const values = Object.values(counts);
    expect(values.length).toBeGreaterThanOrEqual(3);
    const max = Math.max(...values), min = Math.min(...values);
    expect(max / min).toBeLessThan(2); // どの位置にも均等に現れる
  });
  it('既存Foundation問題のrelease blockerが0件', () => {
    const blockers = foundationQuestions.flatMap(q => auditFoundationQuestion(q))
      .filter(x => x.releaseBlocker).map(x => `${x.questionId}:${x.kind}`);
    expect(blockers).toEqual([]);
  });
});

describe('Cognate-aware 出題方針（§12）', () => {
  it('中国語と同形・同義の語には意味当てを出さない', () => {
    const mostlySame = COGNATE_PROFILES.filter(c => c.cognateClass === 'mostly_same');
    expect(mostlySame.length).toBeGreaterThan(20);
    for (const prof of mostlySame) {
      expect(allowsCoreMeaningQuestion(prof, false), `${prof.itemId}`).toBe(false);
      const item = itemById.get(prof.itemId);
      if (!item) continue;
      const qs = buildAssessQuestions(item, pool, { introduced: false });
      expect(qs.some(q => q.dimension === 'core_meaning'), `${prof.itemId} に意味当てが出ている`).toBe(false);
    }
  });
  it('導入済みの語には意味当てを出さない（推測で解ける）', () => {
    for (const prof of COGNATE_PROFILES) expect(allowsCoreMeaningQuestion(prof, true)).toBe(false);
  });
  it('高リスク同形語には転移誤用／範囲対比の問題が必ずある', () => {
    const highRisk = highRiskCognateIds();
    expect(highRisk.length).toBeGreaterThanOrEqual(10);
    for (const id of highRisk) {
      const qs = contrastQuestionsFor(id);
      expect(qs.length, `${id} にcontrast問題がない`).toBeGreaterThanOrEqual(1);
      const item = itemById.get(id);
      if (!item) continue;
      const built = buildAssessQuestions(item, pool, { introduced: false });
      expect(built.some(q => q.dimension === 'transfer_error' || q.dimension === 'scope_contrast'),
        `${id} の出題にcontrastが含まれない`).toBe(true);
    }
  });
  it('contrast問題は実在itemを参照し、答えが選択肢に一意に存在する', () => {
    for (const c of COGNATE_CONTRAST_BANK) {
      expect(itemById.has(c.itemId), `${c.itemId} が実在しない`).toBe(true);
      expect(c.choices.length).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      expect(c.answerIndex).toBeGreaterThanOrEqual(0);
      expect(c.answerIndex).toBeLessThan(c.choices.length);
      expect(c.reviewStatus).toBe('human_review_candidate'); // 自動承認しない
    }
  });
  it('false_friend語は誤用対策が最優先で出る（意味当てを出さない）', () => {
    for (const prof of COGNATE_PROFILES.filter(c => c.cognateClass === 'false_friend')) {
      expect(prof.transferRiskZh, `${prof.itemId} に転移リスクの説明がない`).toBeTruthy();
      expect(prof.zhCognate).toBeTruthy();
      const item = itemById.get(prof.itemId);
      if (!item) continue;
      const qs = buildAssessQuestions(item, pool, { introduced: false });
      // 1問目は必ず誤用対策（転移誤用 or 意味範囲の対比）。意味当ては出さない
      expect(['transfer_error', 'scope_contrast'], `${prof.itemId}の1問目`).toContain(qs[0].dimension);
      expect(qs.some(q => q.dimension === 'core_meaning')).toBe(false);
    }
  });
  it('プロファイルは全件human_review_candidate（自動承認なし）', () => {
    for (const c of COGNATE_PROFILES) expect(c.reviewStatus).toBe('human_review_candidate');
  });
});

describe('誤答の質（QP-1/QP-2・夜間ブラッシュアップ2026-07-30）', () => {
  const pool = allVocabularyItems();
  it('QP-1: core_meaning誤答がpool先頭に固定されない（全体で十分な多様性）', () => {
    const used = new Set<string>();
    for (const item of pool) {
      const qs = buildAssessQuestions(item, pool, { introduced: false });
      for (const q of qs) {
        if (q.dimension !== 'core_meaning') continue;
        for (let i = 0; i < q.choices.length; i++) if (i !== q.answerIndex) used.add(q.choices[i]);
      }
    }
    // 修正前は先頭の数語（姓名・出身地…）に偏っていた。回転後は誤答語彙が広く使われる
    expect(used.size).toBeGreaterThanOrEqual(30);
  });
  it('QP-1: 生成は依然として決定的（同じ入力→同じ問題）', () => {
    for (const item of pool.slice(0, 20)) {
      const a = buildAssessQuestions(item, pool, { introduced: false });
      const b = buildAssessQuestions(item, pool, { introduced: false });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
  it('QP-2: 語幹フレームの穴埋めは同じ活用クラスの誤答だけ（形だけで解けない）', () => {
    // 「日本に住んでいます」→「＿＿んでいます」型。誤答も んで に自然に接続する動詞（む/ぶ/ぬ）のみ
    const sumu = pool.find(i => i.id === 'fi-sumu')!;
    const q = buildAssessQuestions(sumu, pool, { introduced: false }).find(x => x.dimension === 'context');
    expect(q).toBeTruthy();
    if (!q) return;
    const ndeVerbs = new Set(pool.filter(i => i.partOfSpeech === 'verb' && /[むぶぬ]$/.test(i.lemma))
      .map(i => (i.lemma.length > 2 ? i.lemma.slice(0, -1) : i.lemma.slice(0, 1))));
    for (let i = 0; i < q.choices.length; i++) {
      if (i === q.answerIndex) continue;
      expect(ndeVerbs.has(q.choices[i]), `誤答「${q.choices[i]}」が んで フレームに接続できない`).toBe(true);
    }
  });
  it('QP-2: 単一正解は維持（誤答は正解と同一表層にならない）', () => {
    for (const item of pool) {
      for (const q of buildAssessQuestions(item, pool, { introduced: false })) {
        if (q.kind !== 'choice') continue;
        const correct = q.choices[q.answerIndex];
        expect(q.choices.filter(c => c === correct).length, q.questionId).toBe(1);
      }
    }
  });
});

describe('選択肢の長さで当てられないか（2026-08-22 問題設計監査）', () => {
  // 「一番長いのを選ぶ」「一番短いのを選ぶ」だけで、偶然（3択=33.3%）を超えて当たらないこと。
  // 監査実測（修正前）: 中心意味は最長を選ぶだけで54.2%、活用は最短を選ぶだけで50%だった。
  const pool = allVocabularyItems();
  const questions = pool.flatMap((item) => buildAssessQuestions(item, pool, { introduced: false }))
    .filter((q) => q.kind === 'choice' && q.choices.length >= 3);

  const strategyPct = (pick: 'long' | 'short', dim?: string): { n: number; pct: number; chance: number } => {
    const qs = dim ? questions.filter((q) => q.dimension === dim) : questions;
    let score = 0;
    let chance = 0;
    for (const q of qs) {
      const lens = q.choices.map((c) => [...c].length);
      const target = pick === 'long' ? Math.max(...lens) : Math.min(...lens);
      const hits = q.choices.filter((_, i) => lens[i] === target);
      const correct = q.choices[q.answerIndex];
      if (hits.includes(correct)) score += 1 / hits.length;
      chance += 1 / q.choices.length;
    }
    const n = qs.length;
    return { n, pct: n ? (score / n) * 100 : 0, chance: n ? (chance / n) * 100 : 0 };
  };

  it('全体で、長さの戦略が偶然を大きく超えない', () => {
    for (const pick of ['long', 'short'] as const) {
      const r = strategyPct(pick);
      expect(r.n).toBeGreaterThan(100);
      // 偶然 + 8ポイント（n が数百のときの許容幅）
      expect(r.pct, `${pick}: ${r.pct.toFixed(1)}% / 偶然 ${r.chance.toFixed(1)}%`)
        .toBeLessThan(r.chance + 8);
    }
  });

  it('中心意味・活用・読みの各観点でも偶然を大きく超えない', () => {
    for (const dim of ['core_meaning', 'conjugation', 'reading'] as const) {
      for (const pick of ['long', 'short'] as const) {
        const r = strategyPct(pick, dim);
        if (r.n < 20) continue;
        expect(r.pct, `${dim}/${pick}: ${r.pct.toFixed(1)}% / 偶然 ${r.chance.toFixed(1)}%（n=${r.n}）`)
          .toBeLessThan(r.chance + 13);
      }
    }
  });
});

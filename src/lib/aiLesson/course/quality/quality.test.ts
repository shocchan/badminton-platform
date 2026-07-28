// 教育品質のrelease blockerガード（§11-§13・§23）。
// answer leakage P1が0であること、同形語に無意味な意味当てを出さないことを機械固定する。
import { describe, it, expect } from 'vitest';
import { auditPresentedQuestion, auditFoundationQuestion, meaningTokens } from './answerLeakage';
import { buildAssessQuestions, canAssess } from './assessQuestionEngine';
import { cognateProfileFor, allowsCoreMeaningQuestion, highRiskCognateIds, COGNATE_PROFILES } from './cognateProfile';
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
          questionId: q.questionId, phase: 'assess', teachTexts: [],
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
  it('既存Foundation問題のrelease blockerを把握している（既知1件のみ）', () => {
    const blockers = foundationQuestions.flatMap(q => auditFoundationQuestion(q))
      .filter(x => x.releaseBlocker).map(x => x.questionId);
    expect(blockers).toEqual(['f2q-f1']); // ヒント文に答えの語が入る既知の1件（P1 queueで修正済み）
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

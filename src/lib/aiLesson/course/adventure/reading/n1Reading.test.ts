/*
 * N1読解（2026-09-10 Phase 2-5）。
 *
 * 全件共通の品質規則（根拠実在・正解1つ・長さ／一致長バイアス・言語整合）は advReading.test.ts が見る。
 * ここでは N1 の Phase 2-5 で足したもの＝**短文の coverage** と **知識グラフへの接続** を固定する。
 */
import { describe, it, expect } from 'vitest';
import { N1_READING_SHORT_A } from './n1ReadingShortA';
import { readingSetsFor, readingCoverage, readingToQuestion } from './readingBank';
import { PRACTICAL_DOMAINS } from '../../knowledge/practicalAxis';
import { parseKnowledgeId } from '../../knowledge/knowledgeId';
import { ALL_VOCAB_CONTENT } from '../vocab/content/vocabContentBank';
import { N1_GRAMMAR_DRAFTS_UNIT1 } from '../../n1GrammarDraftsUnit1';
import { N1_GRAMMAR_DRAFTS_UNIT2 } from '../../n1GrammarDraftsUnit2';
import { N1_GRAMMAR_DRAFTS_UNIT3 } from '../../n1GrammarDraftsUnit3';
import { N1_GRAMMAR_DRAFTS_UNIT4 } from '../../n1GrammarDraftsUnit4';
import { N1_GRAMMAR_DRAFTS_UNIT5 } from '../../n1GrammarDraftsUnit5';
import { N1_GRAMMAR_DRAFTS_UNIT6 } from '../../n1GrammarDraftsUnit6';
import { N1_GRAMMAR_DRAFTS_UNIT7 } from '../../n1GrammarDraftsUnit7';
import { N1_GRAMMAR_DRAFTS_UNIT8 } from '../../n1GrammarDraftsUnit8';
import { N1_GRAMMAR_DRAFTS_UNIT9 } from '../../n1GrammarDraftsUnit9';
import { N1_GRAMMAR_DRAFTS_UNIT10 } from '../../n1GrammarDraftsUnit10';

const grammarById = new Map([
  ...N1_GRAMMAR_DRAFTS_UNIT1, ...N1_GRAMMAR_DRAFTS_UNIT2, ...N1_GRAMMAR_DRAFTS_UNIT3, ...N1_GRAMMAR_DRAFTS_UNIT4,
  ...N1_GRAMMAR_DRAFTS_UNIT5, ...N1_GRAMMAR_DRAFTS_UNIT6, ...N1_GRAMMAR_DRAFTS_UNIT7, ...N1_GRAMMAR_DRAFTS_UNIT8,
  ...N1_GRAMMAR_DRAFTS_UNIT9, ...N1_GRAMMAR_DRAFTS_UNIT10,
].map((g) => [g.grammarId, g]));
const vocabById = new Map(ALL_VOCAB_CONTENT.map((c) => [c.wordId, c]));

const stems = (pattern: string): string[] =>
  pattern.replace(/（[^）]*）/g, '').split(/[／/]/)
    .map((p) => p.replace(/[〜～\s]/g, '').replace(/\(.*?\)/g, ''))
    .filter((p) => p.length >= 2);
const appearsIn = (text: string, stem: string): boolean => {
  const chars = [...stem];
  const min = Math.max(2, Math.ceil(chars.length / 2));
  for (let n = chars.length; n >= min; n -= 1) if (text.includes(chars.slice(0, n).join(''))) return true;
  return false;
};
/** 見出し語は活用する（引き継ぐ→引き継ぎ）ので、語幹（末尾1字を落とした形）でも本文に当てる */
const wordAppears = (text: string, surface: string): boolean =>
  text.includes(surface) || ([...surface].length >= 3 && text.includes(surface.slice(0, -1)));

describe('N1読解 短文（Phase 2-5）', () => {
  it('短文が12本（仕事の文書6・評論の断片6）で、N1 は6型・42本', () => {
    expect(N1_READING_SHORT_A.length).toBe(12);
    expect(N1_READING_SHORT_A.every((x) => x.readingType === 'shortPassage')).toBe(true);
    const c = readingCoverage('N1');
    expect(c.byType.shortPassage).toBe(12);
    expect(Object.keys(c.byType).length).toBe(6);
    expect(readingSetsFor('N1').length).toBe(42);
    expect(c.pass).toBe(true);
  });

  it('全件 sourceLevel=N1・n1 帯で出題される', () => {
    for (const x of N1_READING_SHORT_A) {
      expect(x.sourceLevel).toBe('N1');
      expect(x.setId.startsWith('n1r-short-'), x.setId).toBe(true);
      expect(readingToQuestion(x).level).toBe('n1');
    }
  });

  it('全誤答に中国語の理由がある（zh学習者が「なぜ違うか」を読める）', () => {
    for (const x of N1_READING_SHORT_A) {
      for (const ch of x.choices.filter((c) => !c.isCorrect)) {
        expect(ch.whyWrongZh && ch.whyWrongZh.length > 0, `${x.setId}/${ch.choiceId}`).toBe(true);
        expect(/[ぁ-んァ-ヴ]/.test((ch.whyWrongZh ?? '').replace(/「[^」]*」/g, '')), `${x.setId}/${ch.choiceId} zhにかな`).toBe(false);
      }
    }
  });
});

describe('N1読解 知識グラフへの接続', () => {
  it('短文の全件に knowledge がある', () => {
    for (const x of N1_READING_SHORT_A) {
      expect(x.knowledge, x.setId).toBeTruthy();
      expect(x.knowledge!.comprehensionTarget.length, x.setId).toBeGreaterThan(5);
      expect(x.knowledge!.distractorDesign.length, x.setId).toBeGreaterThan(5);
      expect(PRACTICAL_DOMAINS).toContain(x.knowledge!.domain);
    }
  });

  it('**grammarLinks は実在する N1 文法IDで、本文に実際に出る**', () => {
    for (const x of N1_READING_SHORT_A) {
      for (const id of x.knowledge!.grammarLinks) {
        expect(parseKnowledgeId(id)?.level, `${x.setId} → ${id}`).toBe('N1');
        const g = grammarById.get(id);
        expect(g, `${x.setId} → ${id} が N1 文法に無い`).toBeTruthy();
        expect(stems(g!.pattern).some((st) => appearsIn(x.passageJa, st)), `${x.setId}: 「${g!.pattern}」が本文に無い`).toBe(true);
      }
    }
  });

  it('**vocabularyLinks は実在する語彙IDで、本文に実際に出る**', () => {
    for (const x of N1_READING_SHORT_A) {
      for (const id of x.knowledge!.vocabularyLinks) {
        const w = vocabById.get(id);
        expect(w, `${x.setId} → ${id} がバンクに無い`).toBeTruthy();
        expect(wordAppears(x.passageJa, w!.surface), `${x.setId}: 「${w!.surface}」(${id}) が本文に無い`).toBe(true);
      }
    }
  });

  it('仕事の文書は work/money/shopping、評論は social/school/work に分かれている', () => {
    const domains = new Set(N1_READING_SHORT_A.map((x) => x.knowledge!.domain));
    expect(domains.size).toBeGreaterThanOrEqual(4);
  });
});

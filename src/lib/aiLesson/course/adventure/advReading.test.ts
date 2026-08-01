// 読解bankの全件品質検査（COMPLETION §6・§18）。
// 「本文を読まないと解けない」「根拠が本文にある」「複数正解0」を機械で保証する。
import { describe, it, expect } from 'vitest';
import {
  ALL_READING_SETS, readingSetsFor, readingCoverage, readingToQuestion, readingPool, readingTargetIds,
} from './reading/readingBank';
import { validateQuestion } from './advVariants';
import { checkText } from './advLanguageIntegrity';
import { presentBattle, analyzeDistribution } from './advChoiceOrder';

describe('読解bank coverage（§6）', () => {
  it('N2・N3ともに合計30セット以上・各typeが6セット以上', () => {
    for (const level of ['N2', 'N3'] as const) {
      const c = readingCoverage(level);
      expect(c.total).toBeGreaterThanOrEqual(30);
      expect(c.typesBelowMinimum).toEqual([]);
      expect(c.pass).toBe(true);
    }
  });

  it('setIdが一意', () => {
    const ids = ALL_READING_SETS.map((s) => s.setId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('読解セットの品質（全件）', () => {
  it('必須フィールドが揃っている', () => {
    for (const s of ALL_READING_SETS) {
      expect(s.passageJa.length).toBeGreaterThan(40);
      expect(s.contextZh.length).toBeGreaterThan(0);
      expect(s.questionJa.length).toBeGreaterThan(0);
      expect(s.questionZh.length).toBeGreaterThan(0);
      expect(s.explanationJa.length).toBeGreaterThan(0);
      expect(s.explanationZh.length).toBeGreaterThan(0);
      expect(s.estimatedSeconds).toBeGreaterThan(0);
      expect(s.variantId).toBeTruthy();
      expect(['generated_draft', 'validated_beta', 'authored']).toContain(s.reviewState);
    }
  });

  it('正解はちょうど1つ・choiceIdが一意・選択肢は4つ', () => {
    for (const s of ALL_READING_SETS) {
      expect(s.choices).toHaveLength(4);
      expect(s.choices.filter((c) => c.isCorrect)).toHaveLength(1);
      const ids = s.choices.map((c) => c.choiceId);
      expect(new Set(ids).size).toBe(4);
      const texts = s.choices.map((c) => c.textJa.trim());
      expect(new Set(texts).size).toBe(4);
    }
  });

  it('**根拠が本文中に実在する**（rationaleSpanがpassageの部分文字列）', () => {
    for (const s of ALL_READING_SETS) {
      const normalized = s.passageJa.replace(/\n/g, '');
      const span = s.rationaleSpan.replace(/\n/g, '');
      expect(normalized.includes(span), `${s.setId}: rationaleSpan not found in passage`).toBe(true);
    }
  });

  it('answer leakage 0（正解文が設問文に含まれない）', () => {
    for (const s of ALL_READING_SETS) {
      const correct = s.choices.find((c) => c.isCorrect)!.textJa;
      expect(s.questionJa.includes(correct)).toBe(false);
      expect(s.questionZh.includes(correct)).toBe(false);
    }
  });

  it('誤答すべてに理由がある（ja）', () => {
    for (const s of ALL_READING_SETS) {
      for (const c of s.choices.filter((x) => !x.isCorrect)) {
        expect(c.whyWrongJa && c.whyWrongJa.length > 0, `${s.setId}/${c.choiceId}`).toBe(true);
      }
    }
  });

  it('選択肢の長さが極端に不揃いでない（語尾・長さで当てられない）', () => {
    for (const s of ALL_READING_SETS) {
      const lens = s.choices.map((c) => c.textJa.length);
      expect(Math.max(...lens) / Math.min(...lens), `${s.setId}`).toBeLessThanOrEqual(3.2);
    }
  });

  it('言語整合性: 未許可Script 0・zh設問に地の文の日本語なし', () => {
    for (const s of ALL_READING_SETS) {
      const base = { itemId: s.setId, route: 'reading', origin: 'authored' as never };
      for (const [field, locale, text] of [
        ['passageJa', 'targetJa', s.passageJa],
        ['questionJa', 'ja', s.questionJa],
        ['questionZh', 'zh', s.questionZh],
        ['contextZh', 'zh', s.contextZh],
        ['explanationJa', 'ja', s.explanationJa],
        ['explanationZh', 'zh', s.explanationZh],
      ] as const) {
        const v = checkText({ ...base, field, locale, text });
        const blocking = v.filter((x) => x.severity === 'blocking');
        expect(blocking, `${s.setId}.${field}: ${blocking.map((b) => b.kind).join(',')}`).toEqual([]);
      }
      for (const c of s.choices) {
        const v = checkText({ ...base, field: 'choice', locale: 'targetJa', text: c.textJa });
        expect(v.filter((x) => x.severity === 'blocking')).toEqual([]);
      }
    }
  });

  it('本文に英単語（ラテン文字の語）が紛れていない', () => {
    for (const s of ALL_READING_SETS) {
      // JLPT・N2等の許可トークンを除いて、3文字以上のラテン語が本文に無いこと
      const stripped = s.passageJa.replace(/\b(JLPT|N[1-5]|AI|XP|OK|URL|PDF)\b/g, '');
      expect(/[A-Za-z]{3,}/.test(stripped), `${s.setId}: ${stripped.match(/[A-Za-z]{3,}/)?.[0]}`).toBe(false);
    }
  });
});

describe('読解 → バトル問題への正規化', () => {
  it('AdvBattleQuestionの機械検査を全件PASS・skillはreading', () => {
    for (const s of ALL_READING_SETS) {
      const q = readingToQuestion(s);
      expect(validateQuestion(q)).toEqual([]);
      expect(q.skill).toBe('reading');
      expect(q.examSection).toBe('reading');
      expect(q.key.startsWith('read:')).toBe(true);
      expect(q.targetJapanese).toBe(s.passageJa);
    }
  });

  it('プールがtype別に作られ、出題対象IDが取れる', () => {
    for (const level of ['N2', 'N3'] as const) {
      const pool = readingPool(level);
      expect(pool.size).toBeGreaterThanOrEqual(5);
      const ids = readingTargetIds(level);
      expect(ids.length).toBe(pool.size);
      for (const id of ids) expect((pool.get(id) ?? []).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('読解でも正解位置が偏らない（1,000 battle）', () => {
    const qs = readingSetsFor('N2').map(readingToQuestion);
    const battles = [];
    for (let b = 0; b < 1000; b++) {
      battles.push(presentBattle(qs.slice(b % 20, (b % 20) + 8), b * 31 + 5));
    }
    const stats = analyzeDistribution(battles, 4);
    for (const p of stats.positionPct) {
      expect(p).toBeGreaterThanOrEqual(20);
      expect(p).toBeLessThanOrEqual(30);
    }
    expect(stats.maxStreak).toBeLessThanOrEqual(2);
  });
});

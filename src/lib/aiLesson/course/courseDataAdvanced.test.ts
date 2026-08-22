// 上級会話ミッション（第13〜18週・30本）の機械検査（2026-08-23）。
//
// 【なぜ要るか】
// このパートは「N1合格者に出しても薄くない会話」であることが存在理由。
// 基礎60本と同じ作りになっているか、日本語に英語が紛れていないか、
// 前提が週をまたいでいないか（＝飛ばして入った人が詰まらないか）を機械で見る。
import { describe, it, expect } from 'vitest';
import { COURSE_MISSIONS, COURSE_WEEKS } from './courseData';
import { ADVANCED_INPUTS, ADVANCED_WEEKS } from './courseDataAdvanced';

const advanced = COURSE_MISSIONS.filter((m) => m.week >= 13);
/** 日本語の文に混ざった半角英単語（固有名詞やJLPT表記は除く） */
const LATIN_WORD = /(?<![A-Za-z])[A-Za-z]{2,}(?![A-Za-z])/g;
const ALLOWED_LATIN = new Set(['JLPT', 'AI', 'N1', 'N2', 'N3', 'N4', 'N5']);

describe('上級パートの構成', () => {
  it('第13〜18週が6週ぶんある', () => {
    expect(ADVANCED_WEEKS.map((w) => w.week)).toEqual([13, 14, 15, 16, 17, 18]);
    expect(COURSE_WEEKS.length).toBeGreaterThanOrEqual(18);
  });

  it('各週5本・合計30本', () => {
    expect(ADVANCED_INPUTS.length).toBe(30);
    for (const w of ADVANCED_WEEKS) {
      const list = advanced.filter((m) => m.week === w.week);
      expect(list.length, `第${w.week}週が5本ではない`).toBe(5);
      expect(list.map((m) => m.order).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('IDが基礎60本と衝突しない', () => {
    const ids = COURSE_MISSIONS.map((m) => m.id);
    expect(new Set(ids).size, '重複したミッションIDがある').toBe(ids.length);
  });

  it('基礎60本には手を入れていない', () => {
    expect(COURSE_MISSIONS.filter((m) => m.week <= 12).length).toBe(60);
  });
});

describe('飛ばして入った人が詰まらない', () => {
  it('前提は同じ週の中だけを指す（前の週を要求しない）', () => {
    const bad: string[] = [];
    for (const m of advanced) {
      for (const req of m.requiredPreviousItems) {
        const reqWeek = Number(req.slice(1, 3));
        if (reqWeek !== m.week) bad.push(`${m.id} が ${req}（第${reqWeek}週）を要求している`);
      }
    }
    expect(bad, `週をまたぐ前提があると、飛ばして入った人が永久に出せない:\n${bad.join('\n')}`).toEqual([]);
  });

  it('各週の1本目は前提を持たない（入口になれる）', () => {
    for (const w of ADVANCED_WEEKS) {
      const first = advanced.find((m) => m.week === w.week && m.order === 1)!;
      expect(first.requiredPreviousItems, `第${w.week}週の入口に前提がある`).toEqual([]);
    }
  });
});

describe('中身の質', () => {
  it('上級なので難易度は4以上', () => {
    for (const m of advanced) {
      expect(m.difficulty, `${m.id} の難易度が低い`).toBeGreaterThanOrEqual(4);
    }
  });

  it('必須フィールドが埋まっている', () => {
    for (const m of advanced) {
      for (const [k, v] of Object.entries({
        titleJa: m.titleJa, titleZh: m.titleZh, targetExpression: m.targetExpression,
        meaningJa: m.meaningJa, meaningZh: m.meaningZh, naturalExample: m.naturalExample,
        simpleExample: m.simpleExample, openingQuestion: m.openingQuestion,
      })) {
        expect(String(v).trim().length, `${m.id} の ${k} が空`).toBeGreaterThan(0);
      }
      expect(m.commonMistakes.length, `${m.id} に間違えやすい点が無い`).toBeGreaterThanOrEqual(2);
      expect(m.hintLevels.length, `${m.id} のヒントが6段階ない`).toBe(6);
      expect(m.followUpQuestions.length).toBeGreaterThanOrEqual(2);
      expect(m.alternateScenes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('日本語の文に英単語が紛れていない', () => {
    const bad: string[] = [];
    for (const m of advanced) {
      const jaTexts = [
        m.titleJa, m.meaningJa, m.usageNotesJa, m.naturalExample, m.simpleExample,
        m.openingQuestion, ...m.commonMistakes, ...m.hintLevels, ...m.followUpQuestions, ...m.alternateScenes,
      ];
      for (const t of jaTexts) {
        for (const w of String(t).match(LATIN_WORD) ?? []) {
          if (!ALLOWED_LATIN.has(w)) bad.push(`${m.id}: 「${w}」 in 「${t}」`);
        }
      }
    }
    expect(bad, `日本語に英単語が混ざっている:\n${bad.join('\n')}`).toEqual([]);
  });

  it('中国語の説明に日本語のかなが紛れていない（引用の「」内はのぞく）', () => {
    const bad: string[] = [];
    const strip = (s: string) => s.replace(/「[^」]*」/g, '');
    for (const m of advanced) {
      for (const t of [m.titleZh, m.meaningZh, m.usageNotesZh]) {
        if (/[ぁ-んァ-ヶ]/.test(strip(String(t)))) bad.push(`${m.id}: ${t}`);
      }
    }
    expect(bad, `中国語の説明にかなが出ている:\n${bad.join('\n')}`).toEqual([]);
  });

  it('目標表現が detect の正規表現で拾える', () => {
    for (const m of advanced) {
      const re = new RegExp(m.detect);
      expect(re.test(m.naturalExample) || re.test(m.simpleExample),
        `${m.id}: detect「${m.detect}」が例文に当たらない`).toBe(true);
    }
  });
});

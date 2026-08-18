// かな道場（2026-08-15）の受入テスト。
//
// いちばん守りたいこと:
// - 超初心者（needs_assessment / pre_n5）だけに出る。読める人はチェック合格で即卒業
// - かな卒業まで今日の冒険はかな道場1本（読めないままバトルさせない）
// - 問題は決定的生成・正解が必ず選択肢にある
import { describe, it, expect } from 'vitest';
import {
  KANA_ROWS, buildKanaCheck, buildRowQuiz, isKanaGraduated, todaysKanaRowIds, KANA_CHECK_PASS,
} from './advKana';
import { generateTodayQuest } from './advQuest';
import { defaultAdvProfile } from './advProfile';
import type { AdvKanaState, AdvRoute, AdvRouteStage } from './advTypes';

const NOW = '2026-08-15T12:00:00.000Z';

describe('かなデータ', () => {
  // 2026-08-18: 清音92字だけでは「がっこう」「きょう」「コーヒー」が読めないため、
  // 濁音・拗音・促音・長音まで範囲を広げた。清音の内訳はここで引き続き固定する。
  it('清音は ひらがな10行＋カタカナ10行＝92文字のまま', () => {
    const seion = KANA_ROWS.filter((r) => (r.group ?? 'seion') === 'seion');
    expect(seion.length).toBe(20);
    const all = seion.flatMap((r) => r.chars);
    expect(all.length).toBe(92); // 46 + 46
    expect(new Set(all.map((c) => c.kana)).size).toBe(92);
  });

  it('全行に重複が無く、全項目にローマ字がある', () => {
    const all = KANA_ROWS.flatMap((r) => r.chars);
    expect(new Set(all.map((c) => c.kana)).size).toBe(all.length);
    for (const c of all) expect(c.romaji.length).toBeGreaterThan(0);
  });

  it('チェック10問・行クイズは行の全文字。正解が必ず選択肢にあり、同seedで再現する', () => {
    const a = buildKanaCheck(42);
    const b = buildKanaCheck(42);
    expect(a.length).toBe(10);
    expect(a.map((q) => q.kana)).toEqual(b.map((q) => q.kana));
    for (const q of a) {
      expect(q.choices.length).toBe(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.answerIndex).toBeGreaterThanOrEqual(0);
    }
    const quiz = buildRowQuiz(KANA_ROWS[0], 7);
    expect(quiz.length).toBe(KANA_ROWS[0].chars.length);
  });

  it('卒業判定: 対象外(null)/チェック合格/全行修了は卒業、チェック未実施・進行中は未卒業', () => {
    expect(isKanaGraduated(null)).toBe(true);
    expect(isKanaGraduated({ needed: false, doneRowIds: [], checkedAt: NOW })).toBe(true);
    expect(isKanaGraduated({ needed: null, doneRowIds: [], checkedAt: null })).toBe(false);
    expect(isKanaGraduated({ needed: true, doneRowIds: ['h-1'], checkedAt: NOW })).toBe(false);
    expect(isKanaGraduated({ needed: true, doneRowIds: KANA_ROWS.map((r) => r.rowId), checkedAt: NOW })).toBe(true);
    expect(KANA_CHECK_PASS).toBe(9);
  });
});

describe('今日の冒険への注入', () => {
  const stage: AdvRouteStage = {
    stageId: 'stg-a', kind: 'foundation_camp', areaId: 'area',
    titleJa: 'a', titleZh: 'a', purposeJa: '', purposeZh: '',
    targets: { n3UnitIds: ['u1'] }, clearConditionJa: '', clearConditionZh: '',
  };
  const route: AdvRoute = {
    generatedAt: NOW, destinationJlpt: 'N3', destinationAreaId: 'dest',
    destinationLabelJa: 'N3', destinationLabelZh: 'N3', explanationJa: '', explanationZh: '',
    stages: [stage],
  };
  const questWithKana = (kana: AdvKanaState | null) => generateTodayQuest({
    profile: { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N3', dailyMinutes: 15, kana },
    route, reviewQuestionCount: 3, weakGrammarIds: [], dateKey: '2026-08-15', nowISO: NOW,
    availability: { nextGrammarIds: [], nextUnitIds: ['u1'], conversationTargets: [] },
    daysToExam: null, masteredStageIds: new Set(),
  });

  it('チェック未実施: 今日の冒険は「かなチェック」1本', () => {
    const q = questWithKana({ needed: null, doneRowIds: [], checkedAt: null });
    expect(q.steps.length).toBe(1);
    expect(q.steps[0].kind).toBe('kana_dojo');
    expect(q.steps[0].refIds).toEqual(['check']);
    expect(q.steps[0].titleJa).toContain('かなチェック');
  });

  it('道場進行中: 今日の2行のかな道場1本（読めないままバトルを出さない）', () => {
    const q = questWithKana({ needed: true, doneRowIds: ['h-1', 'h-2'], checkedAt: NOW });
    expect(q.steps.length).toBe(1);
    expect(q.steps[0].kind).toBe('kana_dojo');
    expect(q.steps[0].refIds).toEqual(['h-3', 'h-4']);
    expect(q.steps.some((s) => s.kind === 'battle')).toBe(false);
  });

  it('卒業済み・対象外: 通常のクエスト（かな道場は出ない）', () => {
    for (const kana of [null, { needed: false as const, doneRowIds: [], checkedAt: NOW }]) {
      const q = questWithKana(kana);
      expect(q.steps.some((s) => s.kind === 'kana_dojo')).toBe(false);
      expect(q.steps.some((s) => s.kind === 'battle')).toBe(true);
    }
  });

  it('todaysKanaRowIds は学習順に2行ずつ', () => {
    expect(todaysKanaRowIds({ needed: true, doneRowIds: [], checkedAt: NOW })).toEqual(['h-1', 'h-2']);
    // 残り1行なら1行だけ返す（末尾の行IDは拡張で変わるのでKANA_ROWSから取る）
    const last = KANA_ROWS[KANA_ROWS.length - 1].rowId;
    const doneAllButLast = KANA_ROWS.slice(0, KANA_ROWS.length - 1).map((r) => r.rowId);
    expect(todaysKanaRowIds({ needed: true, doneRowIds: doneAllButLast, checkedAt: NOW })).toEqual([last]);
  });
});

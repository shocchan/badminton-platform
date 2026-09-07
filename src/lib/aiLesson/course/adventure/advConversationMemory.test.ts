// AI先生の記憶（advLearnerMemo）と、会話の直しの再登場（advRestateReview）。
//
// どちらも**セッションのレポートを読むだけ**の純関数で、新しい保存先を持たない。
// ここで固定したいのは「実在する文しか使わない」「無いものを埋めない」の2点。
import { describe, it, expect } from 'vitest';
import { buildLearnerNotes, MEMO_MAX_LINES, MEMO_MAX_CHARS } from './advLearnerMemo';
import {
  dueRestates, markRestate, restoreRestateLog, restateSaidCount,
  RESTATE_INTERVALS, RESTATE_DAILY_MAX,
} from './advRestateReview';
import type { CourseSessionRecord, LessonReport } from '../types';

const report = (over: Partial<LessonReport> = {}): LessonReport => ({
  todaySummaryJa: 'コンビニで店員に聞く練習をしました。',
  todaySummaryZh: '',
  achievements: ['「温めてください」が自分から言えた'],
  corrections: [{ original: 'これ温めるください', improved: 'これ、温めてください', noteZh: '「〜てください」是请求的形式。' }],
  naturalPhrases: [],
  targetUsage: 'self',
  encouragementJa: '',
  ...over,
});

const session = (id: string, startedAt: string, r: LessonReport | null): CourseSessionRecord => ({
  id,
  missionId: 'm1',
  mode: 'text',
  lessonKind: 'new',
  difficulty: 3,
  startedAt,
  endedAt: null,
  durationSeconds: 200,
  completionStatus: 'completed',
  endReason: null,
  targetExpression: '〜てください',
  targetUsed: true,
  targetUsedIndependently: true,
  hintsUsed: 0,
  chineseSupportUsed: false,
  errorCode: null,
  estimatedCostUsd: 0.5,
  report: r,
} as CourseSessionRecord);

const NOW = '2026-09-07T10:00:00.000Z';

describe('AI先生の記憶', () => {
  it('会話をしたことがない人には何も渡さない（埋めるために一般論を足さない）', () => {
    expect(buildLearnerNotes([], NOW)).toEqual([]);
    expect(buildLearnerNotes([session('s1', '2026-09-06T10:00:00Z', null)], NOW)).toEqual([]);
  });

  it('前回の話題とできたことを、レポートの文そのままで渡す', () => {
    const notes = buildLearnerNotes([session('s1', '2026-09-06T10:00:00Z', report())], NOW);
    expect(notes.some((n) => n.includes('コンビニで店員に聞く練習'))).toBe(true);
    expect(notes.some((n) => n.includes('「温めてください」が自分から言えた'))).toBe(true);
  });

  it('1回しか出ていない直しを「くり返し」と書かない', () => {
    const notes = buildLearnerNotes([session('s1', '2026-09-06T10:00:00Z', report())], NOW);
    expect(notes.some((n) => n.startsWith('くり返し出ている直し'))).toBe(false);
  });

  it('別のセッションで2回以上出た直しだけ「くり返し」と書く', () => {
    const notes = buildLearnerNotes([
      session('s1', '2026-09-06T10:00:00Z', report()),
      session('s2', '2026-09-04T10:00:00Z', report()),
    ], NOW);
    expect(notes.some((n) => n.includes('くり返し出ている直し: これ、温めてください'))).toBe(true);
  });

  it('30日より古い会話は材料にしない', () => {
    expect(buildLearnerNotes([session('s1', '2026-06-01T10:00:00Z', report())], NOW)).toEqual([]);
  });

  it('行数と長さの上限を守る（毎ターンの入力を太らせない）', () => {
    const long = 'あ'.repeat(300);
    const notes = buildLearnerNotes([
      session('s1', '2026-09-06T10:00:00Z', report({ todaySummaryJa: long })),
      session('s2', '2026-09-05T10:00:00Z', report()),
      session('s3', '2026-09-04T10:00:00Z', report()),
    ], NOW);
    expect(notes.length).toBeLessThanOrEqual(MEMO_MAX_LINES);
    for (const n of notes) expect(n.length).toBeLessThanOrEqual(MEMO_MAX_CHARS);
  });

  it('壊れた日時でも落ちない', () => {
    expect(buildLearnerNotes([session('s1', 'こわれた', report())], NOW)).toEqual([]);
    expect(buildLearnerNotes([session('s1', '2026-09-06T10:00:00Z', report())], 'こわれた')).toEqual([]);
  });
});

describe('会話の直しの再登場', () => {
  const s1 = session('s1', '2026-09-01T10:00:00Z', report());

  it(`直された当日は出さない（最短でも${RESTATE_INTERVALS[0]}日後）`, () => {
    expect(dueRestates([s1], [], '2026-09-01')).toHaveLength(0);
  });

  it('翌日に出る', () => {
    const due = dueRestates([s1], [], '2026-09-02');
    expect(due).toHaveLength(1);
    expect(due[0].improved).toBe('これ、温めてください');
    expect(due[0].round).toBe(1);
    expect(due[0].daysSince).toBe(1);
  });

  it('毎日開かない人でも取りこぼさない（「ちょうどその日」に限定しない）', () => {
    const due = dueRestates([s1], [], '2026-09-06');
    expect(due).toHaveLength(1);
    expect(due[0].round).toBe(1);
  });

  it('今日もう出したものは同じ日に二度出さない', () => {
    const log = markRestate([], 's1:0', '2026-09-02', true);
    expect(dueRestates([s1], log, '2026-09-02')).toHaveLength(0);
  });

  it('1回目のあとは3日後、そのあとは7日後', () => {
    const after1 = markRestate([], 's1:0', '2026-09-02', true);
    expect(dueRestates([s1], after1, '2026-09-03')).toHaveLength(0);   // まだ3日たっていない
    expect(dueRestates([s1], after1, '2026-09-04')[0].round).toBe(2);  // 直された日から3日
    const after2 = markRestate(after1, 's1:0', '2026-09-04', true);
    expect(dueRestates([s1], after2, '2026-09-05')).toHaveLength(0);
    expect(dueRestates([s1], after2, '2026-09-08')[0].round).toBe(3);  // 7日
  });

  it(`${RESTATE_INTERVALS.length}回ぶん終わったら、もう出さない`, () => {
    let log = markRestate([], 's1:0', '2026-09-02', true);
    log = markRestate(log, 's1:0', '2026-09-04', true);
    log = markRestate(log, 's1:0', '2026-09-08', true);
    expect(dueRestates([s1], log, '2026-09-30')).toHaveLength(0);
  });

  it('答えなければ翌日もう一度出る（黙って消えない）', () => {
    expect(dueRestates([s1], [], '2026-09-02')).toHaveLength(1);
    expect(dueRestates([s1], [], '2026-09-03')).toHaveLength(1);
  });

  it(`1日に出すのは最大${RESTATE_DAILY_MAX}件`, () => {
    const many = report({
      corrections: Array.from({ length: 2 }, (_, i) => ({
        original: `もと${i}`, improved: `なおし${i}`, noteZh: '' })),
    });
    const sessions = [
      session('a', '2026-09-01T10:00:00Z', many),
      session('b', '2026-09-02T10:00:00Z', many),
    ];
    expect(dueRestates(sessions, [], '2026-09-05').length).toBe(RESTATE_DAILY_MAX);
  });

  it('同じ言い方は1つだけ出す（同じ文が2枚並ばない）', () => {
    const sessions = [
      session('a', '2026-09-01T10:00:00Z', report()),
      session('b', '2026-09-02T10:00:00Z', report()),
    ];
    const due = dueRestates(sessions, [], '2026-09-05');
    expect(new Set(due.map((d) => d.improved)).size).toBe(due.length);
  });

  it('レポートの無いセッション・空の直しは無視する', () => {
    expect(dueRestates([session('x', '2026-09-01T10:00:00Z', null)], [], '2026-09-05')).toHaveLength(0);
    const blank = report({ corrections: [{ original: '', improved: '', noteZh: '' }] });
    expect(dueRestates([session('y', '2026-09-01T10:00:00Z', blank)], [], '2026-09-05')).toHaveLength(0);
  });

  it('記録の復元は壊れた形を落とし、件数を切る', () => {
    expect(restoreRestateLog('x')).toEqual([]);
    expect(restoreRestateLog([{ key: 'a', dateKey: 'ダメ' }, { key: 'b', dateKey: '2026-09-02', said: true }]))
      .toEqual([{ key: 'b', dateKey: '2026-09-02', said: true }]);
  });

  it('「言えた」の数は自己申告の記録からだけ数える', () => {
    let log = markRestate([], 'a:0', '2026-09-02', true);
    log = markRestate(log, 'b:0', '2026-09-02', false);
    expect(restateSaidCount(log)).toBe(1);
  });
});

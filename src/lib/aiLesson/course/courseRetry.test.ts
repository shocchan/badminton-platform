import { describe, it, expect } from 'vitest';
import { pickRetryTarget, normalizeJa, judgeRetry } from './courseRetry';
import type { LessonReport } from './types';

const report = (corrections: LessonReport['corrections']): LessonReport => ({
  todaySummaryJa: '', todaySummaryZh: '', achievements: [],
  corrections, naturalPhrases: [], targetUsage: 'hint', encouragementJa: '',
});

describe('言い直し対象の選定', () => {
  it('目標表現に関する訂正を最優先で選ぶ', () => {
    const r = report([
      { original: '昨日行きました会社', improved: '昨日、会社に行きました', noteZh: '' },
      { original: '雨だったから、行きません', improved: '雨が降ったので、行きませんでした', noteZh: '' },
    ]);
    const t = pickRetryTarget(r, '〜ので');
    expect(t?.improved).toContain('ので');
    expect(t?.reason).toBe('target');
  });

  it('目標表現に関する訂正が無ければ先頭（重要度順）を選ぶ', () => {
    const r = report([
      { original: 'A', improved: 'Aの改善', noteZh: '' },
      { original: 'B', improved: 'Bの改善', noteZh: '' },
    ]);
    expect(pickRetryTarget(r, '〜わけだ')?.original).toBe('A');
  });

  it('訂正ゼロなら null（カード自体を出さない）', () => {
    expect(pickRetryTarget(report([]), '〜ので')).toBeNull();
    expect(pickRetryTarget(report([{ original: ' ', improved: 'x', noteZh: '' }]), '')).toBeNull();
  });
});

describe('正規化', () => {
  it('句読点・空白・全半角を吸収する', () => {
    expect(normalizeJa('昨日、上司に 説明しました。')).toBe(normalizeJa('昨日上司に説明しました'));
    expect(normalizeJa('ＯＫです！')).toBe(normalizeJa('OKです'));
  });
});

describe('言い直し判定（完全一致を要求しない）', () => {
  const improved = '昨日、上司に説明しました';

  it('good: 句読点・空白差は一致扱い', () => {
    expect(judgeRetry('昨日上司に説明しました。', improved)).toBe('good');
    expect(judgeRetry('昨日、上司に　説明しました', improved)).toBe('good');
  });

  it('good: 敬体の軽微な語尾差を許容', () => {
    expect(judgeRetry('昨日、上司に説明した', improved)).toBe('good'); // 語幹一致（包含）
  });

  it('good: 少し語順・付加があっても主要部分を含めばよい', () => {
    expect(judgeRetry('実は昨日、上司に説明しました', improved)).toBe('good');
  });

  it('close: 7割未満だが近い', () => {
    const j = judgeRetry('昨日、上司に説明するでした', improved);
    expect(['good', 'close']).toContain(j); // 惜しい入力を「もう少し」以内に収める
    expect(j).not.toBe('tryAgain');
  });

  it('tryAgain: 別の文・空入力', () => {
    expect(judgeRetry('今日は良い天気です', improved)).toBe('tryAgain');
    expect(judgeRetry('', improved)).toBe('tryAgain');
    expect(judgeRetry('   ', improved)).toBe('tryAgain');
  });
});

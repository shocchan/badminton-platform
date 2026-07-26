import { describe, it, expect } from 'vitest';
import { parseLabUrl, buildLabSearch } from './labUrlState';

describe('ラボURL状態（§7/§8）', () => {
  it('lab=1・各sectionを解析（vocabulary→words対応）', () => {
    expect(parseLabUrl('?app=1&lab=1&section=today')).toMatchObject({ lab: true, section: 'today' });
    expect(parseLabUrl('?lab=1&section=vocabulary')).toMatchObject({ lab: true, section: 'words' });
    expect(parseLabUrl('?lab=1&section=rules').section).toBe('rules');
    expect(parseLabUrl('?lab=1&section=review').section).toBe('review');
    expect(parseLabUrl('?lab=1&section=history').section).toBe('history');
    expect(parseLabUrl('?app=1').lab).toBe(false);
  });
  it('unit・stepを解析し、不正section/stepは安全な既定値へ（無限リダイレクトなし）', () => {
    const u = parseLabUrl('?lab=1&unit=fu-verbs-masu-nai&step=quiz');
    expect(u.unit).toBe('fu-verbs-masu-nai');
    expect(u.step).toBe('quiz');
    expect(parseLabUrl('?lab=1&section=bogus').section).toBe('today');
    expect(parseLabUrl('?lab=1&unit=fu-x&step=bogus').step).toBeNull();
  });
  it('buildLabSearch: app=1等の既存paramsを維持・nullでラボparams全削除', () => {
    const s = buildLabSearch('?app=1', { section: 'review', unit: null, step: null });
    expect(s).toContain('app=1');
    expect(s).toContain('lab=1');
    expect(s).toContain('section=review');
    expect(s).not.toContain('unit=');
    const s2 = buildLabSearch(s, { section: 'today', unit: 'fu-te-form', step: 'quiz' });
    expect(s2).toContain('unit=fu-te-form');
    expect(s2).toContain('step=quiz');
    expect(s2).toContain('app=1');
    const s3 = buildLabSearch(s2, null);
    expect(s3).toBe('?app=1');
  });
  it('URLへ回答・learner情報を入れない（生成keysはlab/section/unit/stepのみ）', () => {
    const s = buildLabSearch('?app=1', { section: 'today', unit: 'fu-selfintro-1', step: 'intro' });
    const keys = [...new URLSearchParams(s).keys()].sort();
    expect(keys).toEqual(['app', 'lab', 'section', 'step', 'unit']);
  });
  it('stepはunitがある時だけ付与（unitなしstep=quizを作らない）', () => {
    const s = buildLabSearch('', { section: 'today', unit: null, step: 'quiz' });
    expect(s).not.toContain('step=');
  });
});

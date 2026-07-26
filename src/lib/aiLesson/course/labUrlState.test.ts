import { describe, it, expect } from 'vitest';
import { parseLabUrl, buildLabSearch, hasLabPreview } from './labUrlState';

describe('ラボURL状態（3領域・§19）', () => {
  it('lab=1・新3セクション（today/units/history）を解析', () => {
    expect(parseLabUrl('?app=1&lab=1&section=today')).toMatchObject({ lab: true, section: 'today' });
    expect(parseLabUrl('?lab=1&section=units').section).toBe('units');
    expect(parseLabUrl('?lab=1&section=history').section).toBe('records');
    expect(parseLabUrl('?app=1').lab).toBe(false);
  });
  it('旧5領域URLを新構造へ正規化（vocabulary/rules→units・review→history/records）', () => {
    expect(parseLabUrl('?lab=1&section=vocabulary').section).toBe('units');
    expect(parseLabUrl('?lab=1&section=rules').section).toBe('units');
    expect(parseLabUrl('?lab=1&section=review').section).toBe('records');
  });
  it('unit・stepを解析し、不正section/stepは安全な既定値へ（無限リダイレクトなし）', () => {
    const u = parseLabUrl('?lab=1&unit=fu-verbs-masu-nai&step=quiz');
    expect(u.unit).toBe('fu-verbs-masu-nai');
    expect(u.step).toBe('quiz');
    expect(parseLabUrl('?lab=1&section=bogus').section).toBe('today');
    expect(parseLabUrl('?lab=1&unit=fu-x&step=bogus').step).toBeNull();
  });
  it('buildLabSearch: app=1等の既存paramsを維持・recordsはhistory表記・nullで全削除', () => {
    const s = buildLabSearch('?app=1', { section: 'records', unit: null, step: null });
    expect(s).toContain('app=1');
    expect(s).toContain('lab=1');
    expect(s).toContain('section=history');
    const s2 = buildLabSearch(s, { section: 'today', unit: 'fu-te-form', step: 'quiz' });
    expect(s2).toContain('unit=fu-te-form');
    expect(s2).toContain('step=quiz');
    expect(buildLabSearch(s2, null)).toBe('?app=1');
  });
  it('URLへ回答・learner情報を入れない（生成keysはlab/section/unit/stepのみ）', () => {
    const s = buildLabSearch('?app=1', { section: 'today', unit: 'fu-selfintro-1', step: 'intro' });
    expect([...new URLSearchParams(s).keys()].sort()).toEqual(['app', 'lab', 'section', 'step', 'unit']);
  });
  it('stepはunitがある時だけ付与', () => {
    expect(buildLabSearch('', { section: 'today', unit: null, step: 'quiz' })).not.toContain('step=');
  });
});

describe('hasLabPreview（§25）', () => {
  it('boolean trueのみ許可', () => {
    expect(hasLabPreview({ labPreview: true })).toBe(true);
    expect(hasLabPreview({ labPreview: 'true' })).toBe(false);
    expect(hasLabPreview({})).toBe(false);
    expect(hasLabPreview(null)).toBe(false);
  });
});

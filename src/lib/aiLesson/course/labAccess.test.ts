import { describe, it, expect } from 'vitest';
import { hasLabPreview } from './labUrlState';
import { rowToLearner } from './courseRepository';
import type { LearnerRow } from './courseRepository';

const baseRow: LearnerRow = {
  id: 'x', user_id: 'u', display_name: 'sho', preferred_language: 'zh',
  estimated_level: 'N3', difficulty_level: 2, current_week: 3, is_active: true,
  hearing: {}, settings: {} as LearnerRow['settings'], admin_overrides: {} as LearnerRow['admin_overrides'],
};

describe('admin_overrides→adminOverrides変換とlabPreview判定（§2/§13）', () => {
  it('snake_case行がadminOverridesへ変換され、labPreview=trueが評価される', () => {
    const l = rowToLearner({ ...baseRow, admin_overrides: { labPreview: true } as LearnerRow['admin_overrides'] });
    expect(l.adminOverrides).toEqual({ labPreview: true });
    expect(hasLabPreview(l.adminOverrides)).toBe(true);
  });
  it('NULL・キーなし・falseはすべて非許可', () => {
    expect(hasLabPreview(rowToLearner({ ...baseRow, admin_overrides: null as unknown as LearnerRow['admin_overrides'] }).adminOverrides)).toBe(false);
    expect(hasLabPreview({})).toBe(false);
    expect(hasLabPreview({ labPreview: false })).toBe(false);
    expect(hasLabPreview(undefined)).toBe(false);
    expect(hasLabPreview(null)).toBe(false);
  });
  it('string "true"や別名キーをtrueと誤認しない', () => {
    expect(hasLabPreview({ labPreview: 'true' })).toBe(false);
    expect(hasLabPreview({ labPreview: 1 })).toBe(false);
    expect(hasLabPreview({ lab_preview: true })).toBe(false);
  });
  it('他のadmin_overridesキーは変換で維持される', () => {
    const l = rowToLearner({ ...baseRow, admin_overrides: { labPreview: true, nextMissionId: 'w01m2', note: 'x' } as unknown as LearnerRow['admin_overrides'] });
    expect(l.adminOverrides).toMatchObject({ labPreview: true, nextMissionId: 'w01m2', note: 'x' });
  });
  it('is_test=falseでもlabPreview=trueなら許可（is_testは条件に含まない）', () => {
    const l = rowToLearner({ ...baseRow, admin_overrides: { labPreview: true } as LearnerRow['admin_overrides'] });
    expect(hasLabPreview(l.adminOverrides)).toBe(true); // rowにis_testが無くても判定に影響しない
  });
});

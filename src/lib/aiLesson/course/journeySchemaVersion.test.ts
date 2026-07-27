// Phase 2E-1.15 §7・§9: schema分類と再読込ループ防止。
import { describe, it, expect } from 'vitest';
import {
  classifySchema, canAutoReload, noteRecoveryAttempt, emptyRecoveryState,
  MAX_AUTO_RECOVERY_ATTEMPTS,
} from './journeySchemaVersion';

const base = {
  currentVersion: 2,
  migratableVersions: [1],
  requiredFields: ['journeyId', 'activeTaskId'],
};
const valid = (v: number) => JSON.stringify({ schemaVersion: v, journeyId: 'j', activeTaskId: 't' });

describe('classifySchema', () => {
  it('保存データが無いのは異常ではない（新規の学習者）', () => {
    const r = classifySchema({ ...base, raw: null });
    expect(r.classification).toBe('same_schema');
    expect(r.needsLearnerRecovery).toBe(false);
  });

  it('同じversionはそのまま読む', () => {
    expect(classifySchema({ ...base, raw: valid(2) }).classification).toBe('same_schema');
  });

  it('変換規則がある古いversionは自動移行できる扱いにする', () => {
    const r = classifySchema({ ...base, raw: valid(1) });
    expect(r.classification).toBe('safely_migratable');
    expect(r.needsLearnerRecovery).toBe(false);
  });

  it('変換規則が無い古いversionは自動で直さない', () => {
    const r = classifySchema({ ...base, raw: valid(0) });
    expect(r.classification).toBe('incompatible_schema');
    expect(r.needsLearnerRecovery).toBe(true);
    expect(r.suggestsReload).toBe(false);   // 読み直しても直らない
  });

  it('保存データの方が新しいときは上書きせず再読込を促す', () => {
    const r = classifySchema({ ...base, raw: valid(5) });
    expect(r.classification).toBe('newer_than_client');
    expect(r.suggestsReload).toBe(true);
    expect(r.foundVersion).toBe(5);
  });

  it('JSONとして壊れていれば corrupted', () => {
    expect(classifySchema({ ...base, raw: '{壊れ' }).classification).toBe('corrupted_state');
  });

  it('配列や文字列など、想定と違う形も corrupted', () => {
    expect(classifySchema({ ...base, raw: '[1,2]' }).classification).toBe('corrupted_state');
    expect(classifySchema({ ...base, raw: '"文字列"' }).classification).toBe('corrupted_state');
  });

  it('versionが数値でなければ corrupted', () => {
    expect(classifySchema({ ...base, raw: '{"schemaVersion":"2"}' }).classification).toBe('corrupted_state');
  });

  it('必須項目が欠けていれば corrupted（自動完了させない）', () => {
    const r = classifySchema({ ...base, raw: JSON.stringify({ schemaVersion: 2, journeyId: 'j' }) });
    expect(r.classification).toBe('corrupted_state');
    expect(r.needsLearnerRecovery).toBe(true);
  });

  it('同じ入力なら必ず同じ結果になる（決定的）', () => {
    const i = { ...base, raw: valid(1) };
    expect(classifySchema(i)).toEqual(classifySchema(i));
  });
});

describe('再読込ループの防止', () => {
  const newer = classifySchema({ ...base, raw: valid(5) });

  it('再読込を促さない分類では自動再読込しない', () => {
    const incompatible = classifySchema({ ...base, raw: valid(0) });
    expect(canAutoReload(emptyRecoveryState(), incompatible)).toBe(false);
  });

  it('初回は自動再読込してよい', () => {
    expect(canAutoReload(emptyRecoveryState(), newer)).toBe(true);
  });

  it('同じ理由・同じversionで2回目は自動再読込しない（無限ループを作らない）', () => {
    const after = noteRecoveryAttempt(emptyRecoveryState(), newer, '2026-07-28T00:00:00.000Z');
    expect(after.recoveryAttemptCount).toBe(1);
    expect(canAutoReload(after, newer)).toBe(false);
  });

  it('上限を超えたらどんな場合でも自動再読込しない', () => {
    let s = emptyRecoveryState();
    for (let i = 0; i <= MAX_AUTO_RECOVERY_ATTEMPTS; i += 1) s = noteRecoveryAttempt(s, newer, 'x');
    expect(canAutoReload(s, newer)).toBe(false);
  });

  it('試行の記録には理由とversionが残る（次の判断に使う）', () => {
    const s = noteRecoveryAttempt(emptyRecoveryState(), newer, '2026-07-28T01:00:00.000Z');
    expect(s.lastRecoveryReason).toBe('newer_than_client');
    expect(s.lastSeenSchemaVersion).toBe(5);
    expect(s.lastRecoveryAt).toBe('2026-07-28T01:00:00.000Z');
  });
});

// データ耐久性（2026-08-15 監査P0/P1）の受入テスト。
//
// いちばん守りたいこと:
// - 旧バージョンのクライアント（新フィールドを知らないJS）が保存しても、そのフィールドが消えない
// - 「読めないデータ」を enabled 切替のついでに default で全置換しない
import { describe, it, expect } from 'vitest';
import {
  readAdvProfile, writeAdvProfile, defaultAdvProfile, setAdvEnabled, hasRawAdvData,
} from './advProfile';
import type { LearnerSettings } from '../types';

const NOW = '2026-08-15T10:00:00.000Z';

describe('writeAdvProfile: 未知キーの温存（旧クライアント対策）', () => {
  it('プロファイル型に無いキーがjsonbにあっても、保存で消えない', () => {
    const settings = {
      adventureV2: {
        schemaVersion: 1,
        enabled: true,
        // 将来のデプロイで追加された（今のクライアントが知らない）フィールドを模擬
        futureFeatureX: { issuedAt: '2026-09-01', items: [1, 2, 3] },
        anotherNewFlag: true,
      },
    } as unknown as LearnerSettings;
    const prof = readAdvProfile(settings)!;
    const next = writeAdvProfile(settings, prof, NOW);
    const raw = next.adventureV2 as Record<string, unknown>;
    expect(raw.futureFeatureX).toEqual({ issuedAt: '2026-09-01', items: [1, 2, 3] });
    expect(raw.anotherNewFlag).toBe(true);
    expect(raw.enabled).toBe(true);
  });

  it('既知フィールドはprofile側が勝つ（通常の保存は今までどおり）', () => {
    const settings = {
      adventureV2: { schemaVersion: 1, enabled: true, companionId: 'natsu' },
    } as unknown as LearnerSettings;
    const prof = readAdvProfile(settings)!;
    const next = writeAdvProfile(settings, { ...prof, companionId: 'haru' }, NOW);
    expect((next.adventureV2 as Record<string, unknown>).companionId).toBe('haru');
  });
});

describe('todaySteps: 安定キー（doneKeys）の往復', () => {
  it('doneKeysが読み書きで保持され、旧形式（done添字のみ）も読める', () => {
    const settings = {
      adventureV2: {
        schemaVersion: 1, enabled: true,
        todaySteps: { dateKey: '2026-08-17', done: [0], doneKeys: ['battle:n3g-unit-1'] },
      },
    } as unknown as LearnerSettings;
    const prof = readAdvProfile(settings)!;
    expect(prof.todaySteps?.doneKeys).toEqual(['battle:n3g-unit-1']);
    expect(prof.todaySteps?.done).toEqual([0]);
    const next = writeAdvProfile(settings, prof, NOW);
    expect(readAdvProfile(next)!.todaySteps?.doneKeys).toEqual(['battle:n3g-unit-1']);
    // 旧形式（doneKeys無し）も壊れず読める
    const legacy = {
      adventureV2: { schemaVersion: 1, enabled: true, todaySteps: { dateKey: '2026-08-17', done: [1, 2] } },
    } as unknown as LearnerSettings;
    expect(readAdvProfile(legacy)!.todaySteps?.done).toEqual([1, 2]);
  });
});

describe('setAdvEnabled: 破損・将来スキーマでも全消ししない', () => {
  it('読めるデータ: enabledだけ切り替わり他は保持', () => {
    const settings = writeAdvProfile(
      {} as LearnerSettings, { ...defaultAdvProfile(NOW), enabled: true, weeklyDays: 5 }, NOW);
    const next = setAdvEnabled(settings, false, NOW);
    const prof = readAdvProfile(next)!;
    expect(prof.enabled).toBe(false);
    expect(prof.weeklyDays).toBe(5);
  });

  it('**読めないデータ（将来のschemaVersion）: defaultで置換せず、生のキーを温存してenabledだけ切替**', () => {
    const settings = {
      adventureV2: {
        schemaVersion: 99, // 将来バージョン → readAdvProfile は null
        enabled: false,
        mastery: { 'u-1': [{ dateKey: '2026-08-01', scorePct: 90 }] },
        preciousData: 'must-survive',
      },
    } as unknown as LearnerSettings;
    expect(readAdvProfile(settings)).toBeNull();
    expect(hasRawAdvData(settings)).toBe(true);
    const next = setAdvEnabled(settings, true, NOW);
    const raw = next.adventureV2 as Record<string, unknown>;
    expect(raw.enabled).toBe(true);
    expect(raw.schemaVersion).toBe(99);           // バージョンを勝手に巻き戻さない
    expect(raw.preciousData).toBe('must-survive'); // 実データが残る
    expect(raw.mastery).toEqual({ 'u-1': [{ dateKey: '2026-08-01', scorePct: 90 }] });
  });

  it('データが無い（新規）: defaultにenabledを立てて開始', () => {
    const next = setAdvEnabled({} as LearnerSettings, true, NOW);
    expect(readAdvProfile(next)?.enabled).toBe(true);
  });
});

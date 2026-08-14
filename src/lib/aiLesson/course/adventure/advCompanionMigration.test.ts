// 旧相棒ID→正式キャラ（ナツ/ハル/アキ）移行の受入テスト。
// いちばん守りたいこと: 既存learnerの保存値（旧ID）が消えず、役割の近い新キャラへ引き継がれる
import { describe, it, expect } from 'vitest';
import { migrateCompanionId, companionById, COMPANIONS } from './advCompanion';
import { readAdvProfile, writeAdvProfile, defaultAdvProfile } from './advProfile';

const NOW = '2026-08-14T10:00:00.000Z';

describe('相棒IDの移行', () => {
  it('旧ID→役割の近い正式キャラへ（nami→ハル/fukuro→ナツ/kaji→アキ）', () => {
    expect(migrateCompanionId('nami')).toBe('haru');
    expect(migrateCompanionId('fukuro')).toBe('natsu');
    expect(migrateCompanionId('kaji')).toBe('aki');
    expect(migrateCompanionId('unknown')).toBeNull();
  });

  it('**保存済みプロファイルの旧IDが読み込み時に新IDへ移行される**（消えない）', () => {
    const settings = writeAdvProfile({}, { ...defaultAdvProfile(NOW), enabled: true }, NOW);
    // 旧IDを直接仕込んだjsonbを模擬
    const legacy = { ...settings, adventureV2: { ...(settings.adventureV2 as Record<string, unknown>), companionId: 'fukuro' } };
    const prof = readAdvProfile(legacy as never);
    expect(prof?.companionId).toBe('natsu');
  });

  it('3体全員が ja/zh の名前・説明・声掛け・労いを持つ', () => {
    for (const c of COMPANIONS) {
      for (const f of [c.nameJa, c.nameZh, c.roleJa, c.roleZh, c.greetJa, c.greetZh, c.doneJa, c.doneZh]) {
        expect(f.length).toBeGreaterThan(0);
      }
    }
    expect(companionById(null).id).toBe('natsu');
  });
});

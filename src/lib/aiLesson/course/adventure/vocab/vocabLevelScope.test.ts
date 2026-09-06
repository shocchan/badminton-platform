// 級を丸めない（2026-09-06 CEO指摘）。
//
// 目標N5のジャンさんの「新しいことば」に **申込書・委任状・受理・交付** が出ていた。
// 原因は2つ重なっていた:
//   ① 画面が N5/N4 の学習者を 'N3' スコープへ丸めていた
//   ② N3 の出す順が ['N3','N4','N5'] で、N3の語から出していた
// 日本語がほとんど無い人に役所の語を出すのは、つらいだけで学習にならない。
import { describe, it, expect } from 'vitest';
import { pickLearnSession } from './vocabLearnData';
import { buildDexView } from './vocabDexData';
import { effectiveContentLevel } from '../advProfile';

const profileFor = (targetJlpt: 'N5' | 'N4' | 'N3' | 'N2' | 'N1') => ({
  targetJlpt, declaredJlpt: null, goalType: 'jlpt' as const,
});

describe('学習者の級に合った語が出る', () => {
  it('目標N5には**N5の語**が出る（N3の語を出さない）', () => {
    const lv = effectiveContentLevel(profileFor('N5'));
    expect(lv).toBe('N5');
    const { session } = pickLearnSession(lv, {}, 20260906);
    expect(session.words.length).toBeGreaterThan(0);
    for (const w of session.words) {
      expect(['N5', 'N4'], `${w.surface} が ${w.level}`).toContain(w.level);
    }
  });

  it('目標N4にはN4から出る', () => {
    const lv = effectiveContentLevel(profileFor('N4'));
    expect(lv).toBe('N4');
    const { session } = pickLearnSession(lv, {}, 20260906);
    expect(session.words[0].level).toBe('N4');
  });

  it('目標N1・N2は自分の級から出る（下の級で埋めない）', () => {
    for (const target of ['N1', 'N2'] as const) {
      const lv = effectiveContentLevel(profileFor(target));
      const { session } = pickLearnSession(lv, {}, 20260906);
      expect(session.words[0].level, `${target} の1語目`).toBe(target);
    }
  });

  it('図鑑の総数も級ごとに違う（N5の人に上の級の語を数えさせない）', () => {
    const n5 = buildDexView('N5', {}).byLevel.map((r) => r.level);
    expect(n5).not.toContain('N3');
    expect(n5).not.toContain('N2');
    const n2 = buildDexView('N2', {}).byLevel.map((r) => r.level);
    expect(n2).toContain('N2');
  });
});

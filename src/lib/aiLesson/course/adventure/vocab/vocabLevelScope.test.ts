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
import { effectiveContentLevel, vocabStartLevel } from '../advProfile';

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

// 2026-09-06 CEO確認で発覚。目標と実力が離れている人（李さん: 目標N3 / 診断n5）に、
// ジャンさんで直したのと同じ役所の語がそのまま出ていた。
describe('実力が目標より低い人は、実力から積み上げる', () => {
  const li = { targetJlpt: 'N3' as const, declaredJlpt: null, goalType: 'jlpt' as const,
    diagnosis: { knowledgeBand: 'n5' } as never };
  const lin = { targetJlpt: 'N1' as const, declaredJlpt: 'N1' as const, goalType: 'jlpt' as const,
    diagnosis: { knowledgeBand: 'n2' } as never };

  it('**2級以上離れていたら実力側から**（李さん: 目標N3・実力n5 → N5から）', () => {
    expect(vocabStartLevel(li)).toBe('N5');
    const { session } = pickLearnSession('N3', {}, 20260906, 5, vocabStartLevel(li));
    for (const w of session.words) {
      expect(['N5', 'N4'], `${w.surface} が ${w.level}`).toContain(w.level);
    }
    // 実測で出ていた語が消えていること
    const surfaces = session.words.map((w) => w.surface);
    for (const bad of ['申込書', '委任状', '受理', '交付', '届け出']) {
      expect(surfaces).not.toContain(bad);
    }
  });

  it('1級差は目標のまま（リンさん: 目標N1・実力n2 → N1の語を出す）', () => {
    expect(vocabStartLevel(lin)).toBe('N1');
    const { session } = pickLearnSession('N1', {}, 20260906, 5, vocabStartLevel(lin));
    expect(session.words[0].level).toBe('N1');
  });

  it('診断が無い人（ジャンさん）は目標のまま', () => {
    expect(vocabStartLevel({ targetJlpt: 'N5', declaredJlpt: null, goalType: 'jlpt',
      diagnosis: { knowledgeBand: 'needs_assessment' } as never })).toBe('N5');
  });
});

/*
 * 級を「持っている」人には、その級だけを出す（2026-09-09 CEO指示）。
 * N1保持者に「新しいことば」としてN2以下を出しても、本人は既に知っている。
 */
describe('strictLevel', () => {
  it('N1保持者にはN1の語だけを出す', () => {
    const { session } = pickLearnSession('N1', {}, 1, 8, null, true);
    expect(session.words.length).toBeGreaterThan(0);
    for (const w of session.words) expect(w.level, w.surface).toBe('N1');
  });

  it('N2保持者にはN2の語だけを出す', () => {
    const { session } = pickLearnSession('N2', {}, 3, 8, null, true);
    expect(session.words.length).toBeGreaterThan(0);
    for (const w of session.words) expect(w.level, w.surface).toBe('N2');
  });

  it('**実力が下の人には効かせない**（絞りは申告レベルの人だけの話）', () => {
    // 起点を下げている人（積み上げ）は strict にしない＝下の級から出る
    const { session } = pickLearnSession('N2', {}, 3, 8, 'N4', false);
    expect(session.words.some((w) => w.level !== 'N2')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { buildLightSession, buildMeaningChoices, judgeRecall } from './courseLightPractice';
import { missionById } from './courseEngine';
// 例文（本文）は目次に無い（P0）。テストだけ教材本体から引く（テストはbundleに入らない）
import { COURSE_MISSIONS as FULL_MISSIONS } from './courseData';
import type { ItemProgress } from './types';

const prog = (itemId: string, over: Partial<ItemProgress> = {}): ItemProgress => ({
  itemId, masteryState: 'used_with_hint', reviewStage: 'day1',
  nextReviewAt: null, lastPracticedAt: '2026-07-20T00:00:00Z',
  successCount: 1, failedReviews: 0,
  ...over,
} as ItemProgress);

describe('軽め学習セッション（決定的・API不使用）', () => {
  it('期日復習2＋もう一度1の順で最大3問・重複なし', () => {
    const items = buildLightSession([
      prog('w01m1', { nextReviewAt: '2026-07-25' }),
      prog('w01m2', { nextReviewAt: '2026-07-26' }),
      prog('w01m3', { nextReviewAt: '2026-07-24' }),
      prog('w02m1'),
    ], ['w01m1', 'w02m1'], '2026-07-26');
    expect(items.length).toBe(3);
    expect(items[0]).toMatchObject({ missionId: 'w01m3', kind: 'recall', source: 'review' }); // 最も古い期日
    expect(new Set(items.map((i) => i.missionId)).size).toBe(3); // 重複なし（againのw01m1はスキップ）
  });

  it('同じ入力なら同じ出題（決定的）', () => {
    const p = [prog('w01m1', { nextReviewAt: '2026-07-25' }), prog('w01m2')];
    expect(buildLightSession(p, [], '2026-07-26')).toEqual(buildLightSession(p, [], '2026-07-26'));
  });

  it('材料ゼロなら空（ホームに導線を出さない判定に使う）', () => {
    expect(buildLightSession([], [], '2026-07-26')).toEqual([]);
  });

  it('意味3択: 正解を含み・決定的・3択', () => {
    const m = missionById('w01m1')!;
    const a = buildMeaningChoices(m);
    const b = buildMeaningChoices(m);
    expect(a.choices.length).toBe(3);
    expect(a.choices[a.correctIndex]).toBe(m.meaningZh);
    expect(a).toEqual(b);
    expect(new Set(a.choices).size).toBe(3); // 選択肢が重複しない
  });

  it('一文想起: detect正規表現で判定（含めば正解・空は不正解）', () => {
    const m = missionById('w01m1')!;
    const full = FULL_MISSIONS.find((x) => x.id === 'w01m1')!;
    expect(judgeRecall('', m)).toBe(false);
    // 例文（本文）は目次に無いため教材本体から。判定regex（detect）は目次側にある
    expect(judgeRecall(full.simpleExample, m)).toBe(true);
  });
});

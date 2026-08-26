// 体験終了画面の「あなたの現在地」（2026-08-26 ファネル監査 P1）。
//
// 守るもの: 実データだけを数え、0件は成果として見せない。
// 体験終了画面は買うかどうかを決める場所なので、ここで盛ると
// 「言われたほどではなかった」に直結する。
import { describe, it, expect } from 'vitest';
import { buildTrialSummary, spokenMinutesLabel } from './trialSummary';
import type { CourseSessionRecord, ItemProgress } from '../types';

const sess = (o: Partial<CourseSessionRecord>): CourseSessionRecord => ({
  id: 's', missionId: 'w01m1', mode: 'voice', lessonKind: 'new', difficulty: 3,
  startedAt: '', endedAt: null, durationSeconds: 0, completionStatus: 'completed',
  endReason: null, targetExpression: '〜といいます', targetUsed: true,
  targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false,
  errorCode: null, estimatedCostUsd: 0, report: null, ...o,
});
const prog = (o: Partial<ItemProgress>): ItemProgress => ({
  itemId: 'w01m1', masteryState: 'learning', masteryScore: 0,
  firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: null,
  reviewStage: 'day1', successfulReviews: 0, failedReviews: 0, ...o,
} as ItemProgress);

describe('体験のまとめ', () => {
  it('何もしていなければ何も見せない', () => {
    const s = buildTrialSummary([], []);
    expect(s.hasAnything).toBe(false);
    expect(s.conversations).toBe(0);
  });

  it('完了した会話だけを回数に数える', () => {
    const s = buildTrialSummary([
      sess({ id: 'a', completionStatus: 'completed' }),
      sess({ id: 'b', completionStatus: 'interrupted' }),
      sess({ id: 'c', completionStatus: 'error' }),
    ], []);
    expect(s.conversations).toBe(1);
  });

  it('途中で切れた会話も「話した時間」には数える（口を動かした事実は残る）', () => {
    const s = buildTrialSummary([
      sess({ id: 'a', durationSeconds: 200, completionStatus: 'completed' }),
      sess({ id: 'b', durationSeconds: 100, completionStatus: 'interrupted' }),
    ], []);
    expect(s.spokenSeconds).toBe(300);
    expect(spokenMinutesLabel(s.spokenSeconds)).toBe(5);
  });

  it('30秒でも0分にはしない（やったことを0にしない）', () => {
    expect(spokenMinutesLabel(30)).toBe(1);
    expect(spokenMinutesLabel(0)).toBe(0);
  });

  it('自分から言えた回数はヒント無しの回だけ', () => {
    const s = buildTrialSummary([
      sess({ id: 'a', targetUsedIndependently: true }),
      sess({ id: 'b', targetUsedIndependently: false }),
    ], []);
    expect(s.saidIndependently).toBe(1);
  });

  it('練習した表現は重複を除く', () => {
    const s = buildTrialSummary([
      sess({ id: 'a', targetExpression: '〜といいます' }),
      sess({ id: 'b', targetExpression: '〜といいます' }),
      sess({ id: 'c', targetExpression: '〜に住んでいます' }),
    ], []);
    expect(s.expressions).toEqual(['〜といいます', '〜に住んでいます']);
  });

  it('次に再会する表現は、予定日がいちばん早いもの', () => {
    const s = buildTrialSummary(
      [
        sess({ id: 'a', missionId: 'w01m1', targetExpression: '〜といいます' }),
        sess({ id: 'b', missionId: 'w01m2', targetExpression: '〜に住んでいます' }),
      ],
      [
        prog({ itemId: 'w01m1', nextReviewAt: '2026-08-30' }),
        prog({ itemId: 'w01m2', nextReviewAt: '2026-08-27' }),
      ],
    );
    expect(s.scheduledForReview).toBe(2);
    expect(s.nextExpression).toBe('〜に住んでいます');
  });

  it('復習予定が無ければ次の表現も出さない', () => {
    const s = buildTrialSummary([sess({})], [prog({ nextReviewAt: null })]);
    expect(s.scheduledForReview).toBe(0);
    expect(s.nextExpression).toBeNull();
  });

  it('表現名が取れないときは null（IDを表現名として見せない）', () => {
    const s = buildTrialSummary([], [prog({ itemId: 'w09m3', nextReviewAt: '2026-08-27' })]);
    expect(s.nextExpression).toBeNull();
  });
});

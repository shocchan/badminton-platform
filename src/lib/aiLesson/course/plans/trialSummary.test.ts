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

/* ── 体験終了画面に足した項目（2026-08-26 Phase S6） ─────────────
   仕様が求めたのは「話した時間 / 会話数 / 学習した表現 / 訂正された表現 /
   復習した表現 / 次に復習すると効く表現」。
   全部が実データ由来で、無いときは出さないことを固定する。 */
describe('訂正・復習・弱点', () => {
  const withReport = (o: Partial<CourseSessionRecord>, corrections: { original: string; improved: string; noteZh: string }[]) =>
    sess({ ...o, report: {
      todaySummaryJa: '', todaySummaryZh: '', achievements: [], corrections,
      naturalPhrases: [], targetUsage: 'self', encouragementJa: '',
    } as CourseSessionRecord['report'] });

  it('直された言い方は improved だけを取る（本人の失敗文は出さない）', () => {
    const s = buildTrialSummary([
      withReport({ id: 'a' }, [{ original: '田中です', improved: '田中と申します', noteZh: '' }]),
    ], []);
    expect(s.correctedPhrases).toEqual(['田中と申します']);
    expect(s.correctedPhrases.join('')).not.toContain('田中です');
  });

  it('同じ言い方は1回だけ数える', () => {
    const s = buildTrialSummary([
      withReport({ id: 'a' }, [{ original: 'x', improved: '田中と申します', noteZh: '' }]),
      withReport({ id: 'b' }, [{ original: 'y', improved: '田中と申します', noteZh: '' }]),
    ], []);
    expect(s.correctedPhrases).toHaveLength(1);
  });

  it('レポートが無いセッションでも落ちない', () => {
    const s = buildTrialSummary([sess({ report: null })], []);
    expect(s.correctedPhrases).toEqual([]);
  });

  it('復習は「予定に入った数」ではなく「実際に終えた回数」', () => {
    const s = buildTrialSummary([
      sess({ id: 'a', lessonKind: 'review_day1', completionStatus: 'completed' }),
      sess({ id: 'b', lessonKind: 'review_day1', completionStatus: 'interrupted' }),
      sess({ id: 'c', lessonKind: 'new', completionStatus: 'completed' }),
    ], [prog({ nextReviewAt: '2026-08-28' })]);
    expect(s.reviewsDone).toBe(1);
    expect(s.scheduledForReview).toBe(1);
  });

  it('弱いところは復習に失敗した回数が多いものを先に取る', () => {
    const s = buildTrialSummary(
      [
        sess({ id: 'a', missionId: 'w01m1', targetExpression: '〜といいます' }),
        sess({ id: 'b', missionId: 'w01m2', targetExpression: '〜に住んでいます' }),
      ],
      [
        prog({ itemId: 'w01m1', failedReviews: 0, masteryScore: 80 }),
        prog({ itemId: 'w01m2', failedReviews: 2, masteryScore: 90 }),
      ],
    );
    expect(s.weakestExpression).toBe('〜に住んでいます');
  });

  it('失敗が無ければ定着スコアの低いほうを取る', () => {
    const s = buildTrialSummary(
      [
        sess({ id: 'a', missionId: 'w01m1', targetExpression: '〜といいます' }),
        sess({ id: 'b', missionId: 'w01m2', targetExpression: '〜に住んでいます' }),
      ],
      [
        prog({ itemId: 'w01m1', failedReviews: 0, masteryScore: 30 }),
        prog({ itemId: 'w01m2', failedReviews: 0, masteryScore: 90 }),
      ],
    );
    expect(s.weakestExpression).toBe('〜といいます');
  });

  it('材料が1つしか無ければ「いちばん弱い」と言わない', () => {
    // 比べる相手がいないのに「ここが弱い」は測っていないことを言うことになる
    const s = buildTrialSummary(
      [sess({ id: 'a', missionId: 'w01m1', targetExpression: '〜といいます' })],
      [prog({ itemId: 'w01m1', failedReviews: 0, masteryScore: 50 })],
    );
    expect(s.weakestExpression).toBeNull();
  });

  it('学習が何も無ければ全部ゼロ', () => {
    const s = buildTrialSummary([], []);
    expect(s.correctedPhrases).toEqual([]);
    expect(s.reviewsDone).toBe(0);
    expect(s.weakestExpression).toBeNull();
  });
});

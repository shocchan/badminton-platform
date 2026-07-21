// 成長計算・Can-do・Before/After・旅マップの受入テスト（§28）

import { describe, it, expect } from 'vitest';
import {
  computeSpeechMetrics, calculateSpeakingGrowth, calculateIndependentSpeakingRate,
  calculateExpressionReuseRate, buildGrowthSnapshot, dueSnapshotTrigger, MIN_SESSIONS_FOR_GROWTH,
} from './courseGrowth';
import { currentCanDos, canDosThisWeek, nextAbility, stageOfMastery, isAchieved } from './courseCanDo';
import { buildBeforeAfter } from './courseBeforeAfter';
import type { SpeechSample } from './courseBeforeAfter';
import { buildJourney, currentPlace, nextPlace } from './courseJourney';
import type { CourseSessionRecord, CourseUtterance, ItemProgress, SpeechMetrics } from './types';

const utt = (speaker: CourseUtterance['speaker'], transcript: string, isFinal = true): CourseUtterance =>
  ({ speaker, transcript, atMs: 0, isFinal, relatedTarget: false });

const session = (over: Partial<CourseSessionRecord>): CourseSessionRecord => ({
  id: Math.random().toString(36).slice(2), missionId: 'w01m1', mode: 'voice', lessonKind: 'new',
  difficulty: 2, startedAt: '2026-09-01T09:00:00Z', endedAt: null, durationSeconds: 180,
  completionStatus: 'completed', endReason: null, targetExpression: '', targetUsed: false,
  targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false, errorCode: null,
  estimatedCostUsd: 0, report: null, ...over,
});

const prog = (over: Partial<ItemProgress> & { itemId: string }): ItemProgress => ({
  masteryState: 'initial', masteryScore: 0, firstLearnedAt: '', lastPracticedAt: '',
  nextReviewAt: null, reviewStage: 'none', successfulReviews: 0, failedReviews: 0, ...over,
});

// ── 発話メトリクス（低信頼除外・生徒のみ・AI発話を成長にしない） ──
describe('computeSpeechMetrics', () => {
  it('生徒の確定発話のみ数え、AI発話・低信頼を除外する', () => {
    const m = computeSpeechMetrics([
      utt('system', 'connected'),
      utt('tutor', '今日はどうでしたか。'),
      utt('student', '日本の大会に出たことがあります。'),
      utt('student', 'あ', false),           // 低信頼（未確定）→除外
      utt('tutor', 'いいですね。理由は？'),
      utt('student', '楽しかったからです。'),
    ]);
    expect(m.studentTurns).toBe(2);
    expect(m.roundtrips).toBe(2);           // tutor→student が2回
    expect(m.gaveReason).toBe(true);        // 「からです」
    expect(m.longestAnswerChars).toBeGreaterThan(5);
  });
  it('聞き返しを検出する', () => {
    const m = computeSpeechMetrics([utt('tutor', '…'), utt('student', 'すみません、もう一度お願いします。')]);
    expect(m.askedBack).toBe(true);
  });
  it('発話が無くても壊れない', () => {
    const m = computeSpeechMetrics([]);
    expect(m.studentTurns).toBe(0);
    expect(m.gaveReason).toBe(false);
  });
});

// ── データ不足時に断定しない（§23/§26） ──
describe('growth sufficiency', () => {
  it('セッションが少ないと sufficient=false・残り回数を返す', () => {
    const g = calculateSpeakingGrowth([session({}), session({})], []);
    expect(g.sufficient).toBe(false);
    expect(g.sessionsUntilReady).toBe(MIN_SESSIONS_FOR_GROWTH - 2);
  });
  it('十分な完了セッションで sufficient=true', () => {
    const s = Array.from({ length: MIN_SESSIONS_FOR_GROWTH }, () => session({}));
    expect(calculateSpeakingGrowth(s, []).sufficient).toBe(true);
  });
});

// ── 自力使用率・発話量で高評価にしない（§15/§23） ──
describe('independent speaking rate', () => {
  it('自力使用フラグから算出（AI発話や長さではない）', () => {
    const s = [
      session({ targetUsedIndependently: true }),
      session({ targetUsedIndependently: false }),
      session({ targetUsedIndependently: true }),
    ];
    expect(calculateIndependentSpeakingRate(s)).toBeCloseTo(2 / 3, 5);
  });
  it('発話が長いだけの回は自力使用にカウントしない', () => {
    const long: SpeechMetrics = { studentTurns: 10, totalStudentChars: 500, longestAnswerChars: 120, roundtrips: 10, gaveReason: false, askedBack: false };
    const s = [session({ targetUsedIndependently: false, speechMetrics: long })];
    expect(calculateIndependentSpeakingRate(s)).toBe(0);
  });
});

describe('expression reuse rate', () => {
  it('復習成功・翌日以上に到達した表現を再使用とみなす', () => {
    const p = [
      prog({ itemId: 'w01m1', masteryState: 'reviewed_day1', successfulReviews: 1 }),
      prog({ itemId: 'w01m2', masteryState: 'used_independently' }),
      prog({ itemId: 'w01m3', masteryState: 'understood' }),
    ];
    // 3学習中、再使用は w01m1（reviewed_day1）のみ
    expect(calculateExpressionReuseRate(p)).toBeCloseTo(1 / 3, 5);
  });
});

// ── Can-do（自力以上のみ達成・誠実な段階） ──
describe('can-do', () => {
  it('自力使用未満は「できるようになった」に含めない', () => {
    expect(isAchieved('understood')).toBe(false);
    expect(isAchieved('used_with_hint')).toBe(false);
    expect(isAchieved('used_independently')).toBe(true);
  });
  it('mastery段階を誠実なラベルに変換する', () => {
    expect(stageOfMastery('initial')).toBe('practiced');
    expect(stageOfMastery('used_with_hint')).toBe('withHint');
    expect(stageOfMastery('used_independently')).toBe('independent');
    expect(stageOfMastery('retained_day7')).toBe('day7');
    expect(stageOfMastery('retained_day30')).toBe('day30');
  });
  it('currentCanDos はカテゴリ単位で、自力以上のものだけ返す', () => {
    const p = [
      prog({ itemId: 'w02m1', masteryState: 'used_independently' }), // experience
      prog({ itemId: 'w01m1', masteryState: 'understood' }),          // 未達成
    ];
    const cds = currentCanDos(p);
    expect(cds.length).toBe(1);
    expect(cds[0].id).toBe('experience');
  });
  it('canDosThisWeek は最大3件・その週のみ', () => {
    const p = [1, 2, 3, 4].map((o) => prog({ itemId: `w01m${o}`, masteryState: 'used_independently' }));
    const cds = canDosThisWeek(p, 1, 3);
    expect(cds.length).toBe(3);
  });
  it('nextAbility は次ミッションのカテゴリから決まる', () => {
    const na = nextAbility('w05m1'); // permission
    expect(na?.id).toBe('permission');
    expect(nextAbility(null)).toBeNull();
  });
});

// ── Before/After（実発話のみ・捏造しない・低信頼除外） ──
describe('before/after', () => {
  const mk = (transcript: string, sessionId: string, dateISO: string): SpeechSample => ({ transcript, sessionId, dateISO });
  it('別セッションの使える発話が2つ以上でペアを作る', () => {
    const ba = buildBeforeAfter([
      mk('日本に来ました。', 's1', '2026-08-01'),
      mk('毎週バドミントンをするようになりました。', 's2', '2026-09-01'),
    ]);
    expect(ba).not.toBeNull();
    expect(ba!.before.sessionId).not.toBe(ba!.after.sessionId);
  });
  it('データ不足なら null（捏造しない）', () => {
    expect(buildBeforeAfter([])).toBeNull();
    expect(buildBeforeAfter([mk('日本に来ました。', 's1', '2026-08-01')])).toBeNull();
  });
  it('低信頼（短すぎ・かな無し）は除外する', () => {
    const ba = buildBeforeAfter([
      mk('ok', 's1', '2026-08-01'),          // 短すぎ
      mk('你好', 's2', '2026-08-02'),          // 中国語のみ（かな無し）
      mk('はい', 's3', '2026-08-03'),          // 短すぎ
    ]);
    expect(ba).toBeNull();
  });
  it('同一セッションだけの発話ではペアにしない', () => {
    const ba = buildBeforeAfter([
      mk('日本に来ました。', 's1', '2026-08-01'),
      mk('バドミントンが好きです。', 's1', '2026-08-01'),
    ]);
    expect(ba).toBeNull();
  });
});

// ── 旅マップ（現在地・次） ──
describe('journey map', () => {
  it('現在地・次の目的地を返す', () => {
    const j = buildJourney([prog({ itemId: 'w01m1', masteryState: 'used_independently' })], 2);
    expect(j.length).toBe(12);
    expect(currentPlace(j, 2).week).toBe(2);
    expect(currentPlace(j, 2).state).toBe('current');
    expect(nextPlace(j, 2)?.week).toBe(3);
    expect(nextPlace(j, 12)).toBeNull();
  });
  it('学習した週は done、定着数が乗る', () => {
    const j = buildJourney([prog({ itemId: 'w01m1', masteryState: 'retained_day7' })], 2);
    const w1 = j.find((p) => p.week === 1)!;
    expect(w1.state).toBe('done');
    expect(w1.retained).toBe(1);
  });
});

// ── スナップショット（上書きせず時系列・重複しない） ──
describe('growth snapshots', () => {
  it('マイルストーン到達で trigger を返し、取得済みは返さない', () => {
    expect(dueSnapshotTrigger(5, 1, new Set())).toBe('after5');
    expect(dueSnapshotTrigger(5, 1, new Set(['after5']))).toBeNull();
    expect(dueSnapshotTrigger(20, 1, new Set(['after5']))).toBe('after20');
  });
  it('週末スナップショットは現在週の1つ前', () => {
    expect(dueSnapshotTrigger(3, 3, new Set())).toBe('week2');
  });
  it('buildGrowthSnapshot は完了数・メトリクス・代表発話を含む', () => {
    const s = Array.from({ length: 6 }, () => session({ targetUsedIndependently: true }));
    const snap = buildGrowthSnapshot({
      trigger: 'after5', sessions: s, progresses: [],
      canDoIds: ['experience'], nextAbilityId: 'permission', representativeUtterance: '日本の大会に出たことがあります。',
    });
    expect(snap.triggerKind).toBe('after5');
    expect(snap.sessionCount).toBe(6);
    expect(snap.representativeUtterance).toContain('大会');
    expect(snap.metrics.independentRate).toBe(1);
  });
});

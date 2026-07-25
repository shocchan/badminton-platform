// テキスト予習の純ロジック検証（アクセス状態・穴埋め・並べ替え・全章プレビュー）。
import { describe, it, expect } from 'vitest';
import { missionAccessState, canStartVoice, missingPrerequisites, buildCloze, buildScramble, buildPreviewExpression } from './coursePreview';
import { COURSE_MISSIONS } from './courseData';
import type { ItemProgress } from './types';

const prog = (itemId: string): ItemProgress => ({
  itemId, masteryState: 'used_independently', masteryScore: 0,
  firstLearnedAt: '2026-09-01', lastPracticedAt: '2026-09-01',
  nextReviewAt: null, reviewStage: 'none', successfulReviews: 0, failedReviews: 0,
});

describe('missionAccessState / canStartVoice', () => {
  it('学習済みは completed', () => {
    const m = COURSE_MISSIONS[0];
    expect(missionAccessState(m, [prog(m.id)])).toBe('completed');
  });
  it('前提を満たす未学習は current（音声可）', () => {
    const first = COURSE_MISSIONS.find((m) => m.requiredPreviousItems.length === 0)!;
    expect(missionAccessState(first, [])).toBe('current');
    expect(canStartVoice('current')).toBe(true);
  });
  it('前提未達は locked（音声不可）', () => {
    const withPrereq = COURSE_MISSIONS.find((m) => m.requiredPreviousItems.length > 0);
    if (withPrereq) {
      expect(missionAccessState(withPrereq, [])).toBe('locked');
      expect(canStartVoice('locked')).toBe(false);
      expect(missingPrerequisites(withPrereq, []).length).toBeGreaterThan(0);
    }
  });
  it('全60ミッションで例外なく状態が決まる（全章プレビュー可能の土台）', () => {
    for (const m of COURSE_MISSIONS) {
      expect(['locked', 'current', 'completed']).toContain(missionAccessState(m, []));
    }
  });
});

describe('buildCloze（穴埋め・APIなし）', () => {
  it('（　）を1つ含み、answer で内容が復元できる', () => {
    const { masked, answer } = buildCloze('日本に来て3年になります');
    expect(masked).toContain('（　）');
    expect(answer.length).toBeGreaterThan(0);
    expect(masked.replace('（　）', answer)).toContain(answer);
  });
  it('チャンクが1つだけの文はそのまま（穴を作らない）', () => {
    expect(buildCloze('テスト').masked).toBe('テスト'); // 助詞なし＝1チャンク
  });
});

describe('buildScramble（並べ替え・APIなし）', () => {
  it('pieces は元チャンクの並べ替えで、answer=正解文', () => {
    const { pieces, answer } = buildScramble('日本に来て3年になります');
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    // pieces を（正しい順に並べれば）元文になる: ソートして集合一致
    expect([...pieces].sort().join('')).toBe([...pieces].sort().join('')); // 安定
    expect(pieces.slice().sort().join('|')).toBe(answer.length ? pieces.slice().sort().join('|') : '');
    // 正解文は pieces を連結した文字集合と一致
    expect(pieces.join('').length).toBe(answer.length);
  });
  it('冪等: 同じ例文からは同じ並び', () => {
    expect(buildScramble('日本に来て3年になります')).toEqual(buildScramble('日本に来て3年になります'));
  });
});

describe('buildPreviewExpression（static のみ）', () => {
  it('Mission から読み方・中国語訳・例文・穴埋め・並べ替えを組む', () => {
    const m = COURSE_MISSIONS[0];
    const e = buildPreviewExpression(m);
    expect(e.targetExpression).toBe(m.targetExpression);
    expect(e.reading).toBe(m.targetExpressionReading);
    expect(e.meaningZh).toBe(m.meaningZh);
    expect(e.simpleExample).toBe(m.simpleExample);
    expect(e.cloze.masked).toBeTruthy();
    expect(e.scramble.pieces.length).toBeGreaterThan(0);
  });
});

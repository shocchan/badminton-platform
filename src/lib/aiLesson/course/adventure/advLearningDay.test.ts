// 「学習した日」の唯一の判定を固定する（2026-09-09・P0-1）。
//
// ここで守りたいのは2つだけ:
//   1. **実際に手を動かした日を落とさない**（かな道場だけ・AI会話だけ・途中まで）
//   2. **手を動かしていない日を数えない**（開いただけ・ログインだけ・設定を見ただけ）
//
// ケース名は2026-09-09 CEO指示の User A〜F に対応する。
import { describe, it, expect } from 'vitest';
import {
  restoreLearningDays, emptyLearningDays, addLearningAction, deriveLearningDays,
  reconcileLearningDays, learningDayKeys, hasMeaningfulLearningAction,
  lastLearningDayKey, firstLearningDayKey, sessionLearningDayKeys, LEARNING_DAY_KEEP,
} from './advLearningDay';
import { defaultAdvProfile, readAdvProfile, writeAdvProfile } from './advProfile';
import { advanceStreak } from './advStreak';
import { buildGrowthHorizons } from './advGrowthHorizons';
import { advLearnerUsageOf } from './advAdminUsage';
import type { AdventureV2Profile, AdvMasteryAttempt } from './advTypes';
import type { LearnerSettings } from '../types';

const NOW = '2026-09-09T01:00:00.000Z';

const profileWith = (patch: Partial<AdventureV2Profile>): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW), enabled: true, ...patch,
});

/** mastery台帳の1試行（合否は学習日の判定に関係しない＝解いた事実だけを見る） */
const attempt = (dateKey: string, scorePct = 80): AdvMasteryAttempt => ({
  dateKey, scorePct, completedAt: `${dateKey}T10:00:00.000Z`,
  questionKeys: ['vocab:春:はる:meaning'], wrongKeys: [],
  unseenRatio: 1, partial: false, tier: 'normal', timed: false,
});

/** その日にstepを終えた状態（かな道場・新しいことば等はすべてこの形で残る） */
const todaySteps = (dateKey: string, doneKeys: string[]) => ({ dateKey, done: [], doneKeys });

describe('復元 — 壊れた保存で学習の記録を失わない', () => {
  it('壊れた値は空で返す', () => {
    expect(restoreLearningDays(null)).toEqual(emptyLearningDays());
    expect(restoreLearningDays('x')).toEqual([]);
    expect(restoreLearningDays([{ d: 'bad', k: ['step'] }])).toEqual([]);
  });

  it('重複した日はまとめ、読めない kind は落とし、日付の昇順にそろえる', () => {
    const r = restoreLearningDays([
      { d: '2026-09-05', k: ['battle', 'zzz'] },
      { d: '2026-09-03', k: ['step'] },
      { d: '2026-09-05', k: ['conv'] },
    ]);
    expect(r).toEqual([
      { d: '2026-09-03', k: ['step'] },
      { d: '2026-09-05', k: ['battle', 'conv'] },
    ]);
  });

  it('kind が1つも読めない日でも「学習した事実」は残す（記録を消す側に倒さない）', () => {
    expect(restoreLearningDays([{ d: '2026-09-05', k: ['???'] }])).toEqual([{ d: '2026-09-05', k: ['step'] }]);
  });

  it('保持は上限で頭打ちになるが、新しい方から残す', () => {
    const many = Array.from({ length: LEARNING_DAY_KEEP + 50 }, (_, i) => ({
      d: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      k: ['step' as const],
    }));
    const r = restoreLearningDays(many);
    expect(r).toHaveLength(LEARNING_DAY_KEEP);
    expect(r[r.length - 1].d).toBe(many[many.length - 1].d);
  });
});

describe('追記 — 変化が無ければ null（毎描画で保存しに行かない）', () => {
  it('同じ日の同じ種類は増やさない', () => {
    const one = addLearningAction([], '2026-09-09', 'battle');
    expect(one).toEqual([{ d: '2026-09-09', k: ['battle'] }]);
    expect(addLearningAction(one!, '2026-09-09', 'battle')).toBeNull();
  });

  it('同じ日に別の種類は足す', () => {
    const one = addLearningAction([], '2026-09-09', 'battle')!;
    expect(addLearningAction(one, '2026-09-09', 'conv')).toEqual([{ d: '2026-09-09', k: ['battle', 'conv'] }]);
  });

  it('壊れた日付・知らない種類では何もしない', () => {
    expect(addLearningAction([], 'きのう', 'battle')).toBeNull();
    expect(addLearningAction([], '2026-09-09', 'nope' as never)).toBeNull();
  });
});

describe('User A — かな道場だけ3日（本番の小蒋さんのケース）', () => {
  /**
   * 2026-09-09 監査の実測: かな18行を3日かけて終えたのに
   * 学習日数0・streak null・管理画面「未学習」・先生の一言が「はじめまして」だった。
   * 直したあとは、かなをやった日がそのまま学習日になる。
   */
  it('かな道場のstepを終えた日は学習日になる', () => {
    const p = profileWith({ todaySteps: todaySteps('2026-09-09', ['kana_dojo:h-1+h-2+h-3']) });
    expect(hasMeaningfulLearningAction(p, '2026-09-09')).toBe(true);
    expect(lastLearningDayKey(p)).toBe('2026-09-09');
  });

  it('3日ぶん積み上がれば streak も3日になる', () => {
    // 1日目・2日目は記録済み（learningDays）、3日目は今日のstepとして進行中
    const p = profileWith({
      learningDays: [
        { d: '2026-09-07', k: ['step'] },
        { d: '2026-09-08', k: ['step'] },
      ],
      todaySteps: todaySteps('2026-09-09', ['kana_dojo:h-4+h-5+h-6']),
    });
    expect([...learningDayKeys(p)].sort()).toEqual(['2026-09-07', '2026-09-08', '2026-09-09']);
    expect(advanceStreak(p, '2026-09-09')).toEqual({ current: 3, best: 3, lastActiveKey: '2026-09-09' });
  });

  it('管理画面の学習日数・最終学習日も同じ数になる（画面と管理が食い違わない）', () => {
    const p = profileWith({
      learningDays: [{ d: '2026-09-07', k: ['step'] }, { d: '2026-09-08', k: ['step'] }],
      todaySteps: todaySteps('2026-09-09', ['kana_dojo:h-4']),
    });
    const settings = writeAdvProfile({} as LearnerSettings, p, NOW);
    const usage = advLearnerUsageOf(settings, NOW);
    expect(usage.totalStudyDays).toBe(3);
    expect(usage.lastStudyDateKey).toBe('2026-09-09');
  });

  it('半年の成長表示にも同じ日数が出る', () => {
    const p = profileWith({
      learningDays: [{ d: '2026-09-07', k: ['step'] }, { d: '2026-09-08', k: ['step'] }],
      todaySteps: todaySteps('2026-09-09', ['kana_dojo:h-4']),
    });
    expect(buildGrowthHorizons(p, '2026-09-09').halfYear.studyDays).toBe(3);
  });
});

describe('User B — AI会話だけ（本番の sijia さんのケース）', () => {
  it('終えた会話セッションの日は学習日になる', () => {
    const p = profileWith({});
    const conv = sessionLearningDayKeys([
      { startedAt: '2026-09-09T02:00:00.000Z', completionStatus: 'completed' },
    ]);
    expect(hasMeaningfulLearningAction(p, conv[0], conv)).toBe(true);
  });

  it('途中でやめた会話・エラーで終わった会話は学習日にしない', () => {
    expect(sessionLearningDayKeys([
      { startedAt: '2026-09-09T02:00:00.000Z', completionStatus: 'in_progress' },
      { startedAt: '2026-09-09T03:00:00.000Z', completionStatus: 'error' },
      { startedAt: 'こわれた', completionStatus: 'completed' },
    ])).toEqual([]);
  });

  it('会話ミッションのstepを終えた日も（セッションを渡さなくても）学習日になる', () => {
    const p = profileWith({ todaySteps: todaySteps('2026-09-09', ['conversation_mission:area01-minato']) });
    expect(hasMeaningfulLearningAction(p, '2026-09-09')).toBe(true);
  });
});

describe('User C — ログイン・閲覧だけ', () => {
  it('開いただけの日（visit）は学習日にしない', () => {
    const p = profileWith({ visit: { days: ['2026-09-09'], lastCardKey: '2026-09-09' } });
    expect(hasMeaningfulLearningAction(p, '2026-09-09')).toBe(false);
    expect(learningDayKeys(p).size).toBe(0);
    expect(advanceStreak(p, '2026-09-09')).toBeNull();
  });

  it('今日のことばを受け取っただけの日も学習日にしない', () => {
    const p = profileWith({
      visit: { days: ['2026-09-09'], lastCardKey: '2026-09-09' },
      proverbDex: [{ id: 'inumo', day: '2026-09-09', learned: false, recalledDay: null }],
    });
    expect(hasMeaningfulLearningAction(p, '2026-09-09')).toBe(false);
  });

  it('stepを1つも終えていない日（todaySteps はあるが空）は学習日にしない', () => {
    const p = profileWith({ todaySteps: todaySteps('2026-09-09', []) });
    expect(hasMeaningfulLearningAction(p, '2026-09-09')).toBe(false);
  });
});

describe('User D — 途中までやった日', () => {
  it('4stepのうち2stepだけ終えた日も学習日になる（締めくくらなくても残る）', () => {
    const p = profileWith({
      questLog: [],
      todaySteps: todaySteps('2026-09-09', ['vocab_learn:', 'battle:n3g-unit-1']),
    });
    expect(hasMeaningfulLearningAction(p, '2026-09-09')).toBe(true);
    // やりきった冒険（表示用の questLog）は増えない＝2つの数字の意味を混ぜない
    expect(buildGrowthHorizons(p, '2026-09-09').today.completedQuests).toBe(0);
    expect(buildGrowthHorizons(p, '2026-09-09').today.studyDays).toBe(1);
  });

  it('バトルを解いた日は（stepの記録が無くても）学習日になる', () => {
    const p = profileWith({ mastery: { 'n3g-unit-1': [attempt('2026-09-08')] } });
    expect(hasMeaningfulLearningAction(p, '2026-09-08')).toBe(true);
  });

  it('言い直しに答えた日も学習日になる', () => {
    const p = profileWith({ restateLog: [{ key: 's1:0', dateKey: '2026-09-08', said: true }] });
    expect(hasMeaningfulLearningAction(p, '2026-09-08')).toBe(true);
  });
});

describe('User F — 復帰したとき、記録と先生の一言が矛盾しない', () => {
  it('過去の学習日は保存済みの記録から失われない（今日のstepが別日でも消えない）', () => {
    const p = profileWith({
      learningDays: [{ d: '2026-09-01', k: ['step'] }, { d: '2026-09-02', k: ['battle'] }],
      todaySteps: todaySteps('2026-09-09', ['battle:n3g-unit-1']),
    });
    expect([...learningDayKeys(p)].sort()).toEqual(['2026-09-01', '2026-09-02', '2026-09-09']);
    expect(firstLearningDayKey(p)).toBe('2026-09-01');
    expect(lastLearningDayKey(p)).toBe('2026-09-09');
  });

  it('7日空けて戻ってきた人は「はじめまして」ではなく「おかえり」になる（lastStudyKeyが立つ）', () => {
    const p = profileWith({ learningDays: [{ d: '2026-09-02', k: ['step'] }] });
    // AdvShell の neverStudied / welcomeBack はこの2つから決まる
    expect(lastLearningDayKey(p)).toBe('2026-09-02');
    const away = Math.floor((Date.parse('2026-09-09') - Date.parse('2026-09-02')) / 86400000);
    expect(away).toBe(7);
  });

  it('間が空いたら streak は1へ戻るだけ（最長は保たれる・責めない）', () => {
    const p = profileWith({
      streak: { current: 3, best: 3, lastActiveKey: '2026-09-02' },
      todaySteps: todaySteps('2026-09-09', ['battle:n3g-unit-1']),
    });
    expect(advanceStreak(p, '2026-09-09')).toEqual({ current: 1, best: 3, lastActiveKey: '2026-09-09' });
  });
});

describe('埋め戻し（既存learner）— 過去は偽造せず、導出できるぶんだけ入れる', () => {
  it('日付を持つ既存記録から学習日を作る', () => {
    const p = profileWith({
      questLog: [{ dateKey: '2026-09-01', completedSteps: 3, totalSteps: 3 }],
      mastery: { 'n3g-unit-1': [attempt('2026-09-02')] },
      restateLog: [{ key: 's1:0', dateKey: '2026-09-03', said: false }],
      todaySteps: todaySteps('2026-09-09', ['kana_dojo:h-1']),
    });
    expect(deriveLearningDays(p, ['2026-09-04'])).toEqual([
      { d: '2026-09-01', k: ['quest'] },
      { d: '2026-09-02', k: ['battle'] },
      { d: '2026-09-03', k: ['restate'] },
      { d: '2026-09-04', k: ['conv'] },
      { d: '2026-09-09', k: ['step'] },
    ]);
  });

  it('日付を持たない記録（かなの行・ことば集め）からは過去日を作らない', () => {
    const p = profileWith({
      kana: { needed: true, doneRowIds: ['h-1', 'h-2', 'h-3'], checkedAt: '2026-08-22T12:00:00.000Z' },
      proverbDex: [{ id: 'inumo', day: '2026-09-07', learned: true, recalledDay: null }],
    });
    expect(deriveLearningDays(p)).toEqual([]);
  });

  it('reconcile は変化が無ければ null（保存がループしない）', () => {
    const p = profileWith({
      learningDays: [{ d: '2026-09-09', k: ['step'] }],
      todaySteps: todaySteps('2026-09-09', ['kana_dojo:h-1']),
    });
    expect(reconcileLearningDays(p)).toBeNull();
  });

  it('reconcile は保存済みと導出を混ぜて返す（既存の記録を消さない）', () => {
    const p = profileWith({
      learningDays: [{ d: '2026-09-01', k: ['step'] }],
      mastery: { 'n3g-unit-1': [attempt('2026-09-02')] },
    });
    expect(reconcileLearningDays(p)).toEqual([
      { d: '2026-09-01', k: ['step'] },
      { d: '2026-09-02', k: ['battle'] },
    ]);
  });
});

describe('保存の往復 — 生徒の次の保存で学習の記録が消えない', () => {
  it('readAdvProfile / writeAdvProfile を通しても learningDays が残る', () => {
    const p = profileWith({ learningDays: [{ d: '2026-09-08', k: ['battle', 'conv'] }] });
    const settings = writeAdvProfile({} as LearnerSettings, p, NOW);
    const back = readAdvProfile(settings);
    expect(back?.learningDays).toEqual([{ d: '2026-09-08', k: ['battle', 'conv'] }]);
  });
});

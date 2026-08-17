// 错题本（誤答ノート）の受入テスト。
//
// いちばん守りたいこと:
// 1. 旧データ（wrongKeys が無い試行）から「たぶん正解した」を推定して克服にしない。
//    記録が無いだけなのに「間違いゼロ」と言わない（原則13: 数字を作らない）。
// 2. 「克服」は最後の誤答より後に**別の日をまたいで**連続正解した記録があるときだけ。
//    同じ日のおかわりバトルで2回続けて正解しても克服にしない（原則9: 証拠の質）。
// 3. 束バトルで同じ試行が複数targetへ記録されても、誤答回数を二重に数えない。
//    片方だけ正誤を持つ壊れ方でも、誤答キーを取りこぼさない。
// 4. 解き直しの優先度が決定的（同じ台帳ならキーの並び順が変わっても同じ順）。
// 5. 日付は JST 基準（UTCの日付キーと混ぜない）。
// 6. 見出しが「未確認」を「未克服」と断定しない。文言の数字は MISTAKE_RULES から作る。
import { describe, it, expect } from 'vitest';
import {
  MISTAKE_RULES, MISTAKE_TERMS, buildMistakeNotebook, pickMistakeReviewKeys, pendingMistakeKeySet,
  summarizeMistakes, mistakeStatusText, isPendingMistake, remainingCorrectsForOvercome,
  mistakeDateKeyOf,
  type GradedMasteryAttempt, type MistakeEntry,
} from './advMistakeNotebook';
import { MASTERY_RULES } from './advMastery';
import type { AdvMasteryAttempt, AdvMasteryLedger } from './advTypes';

const NOW = '2026-08-17T12:00:00.000Z';
const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();
/** 台帳の dateKey は JST 基準（AdvMasteryAttempt の約束）。テストデータもそれに合わせる */
const keyOf = (iso: string): string => mistakeDateKeyOf(iso);
/** JSTの日付と時刻から ISO を作る（同じ日／日をまたぐ、を意図して書けるように） */
const jst = (dateKey: string, hhmm: string): string => new Date(`${dateKey}T${hhmm}:00+09:00`).toISOString();

/** 正誤を記録した試行（新データ） */
const graded = (
  completedAt: string, questionKeys: string[], wrongKeys: string[],
): GradedMasteryAttempt => ({
  dateKey: keyOf(completedAt),
  scorePct: questionKeys.length === 0 ? 0
    : Math.round(((questionKeys.length - wrongKeys.length) / questionKeys.length) * 100),
  unseenRatio: 1,
  questionKeys,
  wrongKeys,
  tier: 'normal',
  timed: false,
  completedAt,
});

/** 正誤を記録していない試行（旧データ。wrongKeys フィールドが存在しない） */
const legacy = (completedAt: string, questionKeys: string[], scorePct = 60): AdvMasteryAttempt => ({
  dateKey: keyOf(completedAt),
  scorePct,
  unseenRatio: 1,
  questionKeys,
  tier: 'normal',
  timed: false,
  completedAt,
});

const entryOf = (nb: { entries: MistakeEntry[] }, key: string): MistakeEntry =>
  nb.entries.find((e) => e.questionKey === key)!;

describe('旧データ（wrongKeys 無し）でも壊れない・推定しない', () => {
  it('旧データだけの台帳: 誤答は1件も作らず、「記録がまだ無い」と言う', () => {
    const ledger: AdvMasteryLedger = {
      g1: [legacy(daysAgo(9), ['rec:g1:1', 'rec:g1:2'], 50), legacy(daysAgo(3), ['rec:g1:1'], 100)],
    };
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(nb.entries).toEqual([]);
    expect(nb.totalAttempts).toBe(2);
    expect(nb.gradedAttempts).toBe(0);
    // ここが要点: 「間違いゼロ！」ではなく「まだ記録していない」
    expect(nb.recordingAvailable).toBe(false);
    const sum = summarizeMistakes(nb);
    expect(sum.headline.ja).toContain('まだありません');
    expect(sum.headline.zh).toBe('还没有错题记录（从下次战斗开始记录）');
  });

  it('誤答のあと旧データの試行で出題された → 克服と推定せず unverifiable', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(9), ['rec:g1:1', 'rec:g1:2'], ['rec:g1:1']),
        // scorePct 100 だが正誤キーが無い。「たぶん正解した」を採用しない
        legacy(daysAgo(5), ['rec:g1:1', 'rec:g1:2'], 100),
        legacy(daysAgo(4), ['rec:g1:1', 'rec:g1:2'], 100),
      ],
    };
    const nb = buildMistakeNotebook(ledger, NOW);
    const e = entryOf(nb, 'rec:g1:1');
    expect(e.resolution).toBe('unverifiable');
    expect(e.correctSinceLastWrong).toBe(0);
    expect(e.unverifiedSinceLastWrong).toBe(2);
    expect(e.unverifiedSinceLastGraded).toBe(2);
    expect(isPendingMistake(e)).toBe(true);
    // 未確認としか言わないと次に何をすればいいか分からないので、残り回数も併記する
    expect(mistakeStatusText(e).ja).toBe('正誤を記録していない回が2回あるため未確認（別の日にあと2回正解すると克服）');
    expect(mistakeStatusText(e).zh).toBe('有2次没有记录对错，待确认（在不同的日子再答对2次，就记为“已订正”）');
    expect(mistakeStatusText(e).ja).toContain(`あと${MISTAKE_RULES.clearStreak}回`);
  });

  it('壊れたデータ（null要素・型違い・completedAt欠落）でも落ちない', () => {
    const broken = {
      g1: [
        null,
        { dateKey: 1, questionKeys: 'nope', wrongKeys: 5, completedAt: daysAgo(2) },
        graded(daysAgo(1), ['rec:g1:1'], ['rec:g1:1']),
        { scorePct: 50 },
      ],
      g2: 'not-an-array',
    } as unknown as AdvMasteryLedger;
    const nb = buildMistakeNotebook(broken, NOW);
    expect(nb.entries.map((e) => e.questionKey)).toEqual(['rec:g1:1']);
    // 壊れたレコードの数え方も固定する（completedAt があるものだけ試行として数え、
    // 正誤の形が壊れているものは graded に数えない）
    expect(nb.totalAttempts).toBe(2);
    expect(nb.gradedAttempts).toBe(1);
    expect(nb.recordingAvailable).toBe(true);
    expect(() => summarizeMistakes(nb)).not.toThrow();
  });

  it('台帳が undefined / 空でも落ちない', () => {
    expect(buildMistakeNotebook(undefined, NOW).entries).toEqual([]);
    expect(buildMistakeNotebook({}, NOW).recordingAvailable).toBe(false);
  });

  it('nowISO が壊れていても落ちず、経過日数を作らない', () => {
    const nb = buildMistakeNotebook({ g1: [graded(daysAgo(3), ['rec:g1:1'], ['rec:g1:1'])] }, 'not-a-date');
    expect(nb.entries[0].daysSinceLastWrong).toBe(0);
    expect(() => summarizeMistakes(nb)).not.toThrow();
  });
});

describe('集計: 誤答回数・最後に間違えた日・その後の正解', () => {
  it('回数と最終誤答日を数え、経過日数を nowISO から出す', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(10), ['rec:g1:1', 'rec:g1:2'], ['rec:g1:1']),
        graded(daysAgo(6), ['rec:g1:1', 'rec:g1:2'], ['rec:g1:1', 'rec:g1:2']),
        graded(daysAgo(2), ['rec:g1:1', 'rec:g1:2'], []),
      ],
    };
    const nb = buildMistakeNotebook(ledger, NOW);
    const one = entryOf(nb, 'rec:g1:1');
    expect(one.wrongCount).toBe(2);
    expect(one.lastWrongDateKey).toBe(keyOf(daysAgo(6)));
    expect(one.daysSinceLastWrong).toBe(6);
    expect(one.correctSinceLastWrong).toBe(1);
    expect(one.correctStreakSinceLastWrong).toBe(1);
    expect(one.questionType).toBe('rec');
    expect(one.targetId).toBe('g1');
  });

  it('台帳に残る試行数の上限を notebook に出す（全期間の合計ではないと分かるように）', () => {
    const nb = buildMistakeNotebook({ g1: [graded(daysAgo(1), ['rec:g1:1'], ['rec:g1:1'])] }, NOW);
    expect(nb.retainedAttemptsPerTarget).toBe(MASTERY_RULES.maxAttemptsKept);
  });

  it('全問正解の試行は wrongKeys: [] を持つ＝正誤が記録された試行として数える', () => {
    const nb = buildMistakeNotebook({ g1: [graded(daysAgo(1), ['rec:g1:1'], [])] }, NOW);
    expect(nb.gradedAttempts).toBe(1);
    expect(nb.recordingAvailable).toBe(true);
    // 一度も間違えていない問題はノートに載せない
    expect(nb.entries).toEqual([]);
    expect(summarizeMistakes(nb).headline.ja).toBe('記録された誤答はありません');
  });

  it('questionKeys に無く wrongKeys にだけあるキーも誤答として拾う（台帳の壊れ耐性）', () => {
    const a = graded(daysAgo(1), ['rec:g1:1'], ['rec:g1:9']);
    const nb = buildMistakeNotebook({ g1: [a] }, NOW);
    expect(nb.entries.map((e) => e.questionKey)).toContain('rec:g1:9');
  });

  it('correctKeys だけがある試行でも正誤を読み取れる', () => {
    const a: GradedMasteryAttempt = {
      dateKey: keyOf(daysAgo(3)), scorePct: 50, unseenRatio: 1,
      questionKeys: ['rec:g1:1', 'rec:g1:2'], correctKeys: ['rec:g1:2'],
      tier: 'normal', timed: false, completedAt: daysAgo(3),
    };
    const nb = buildMistakeNotebook({ g1: [a] }, NOW);
    expect(nb.gradedAttempts).toBe(1);
    expect(nb.entries.map((e) => e.questionKey)).toEqual(['rec:g1:1']);
  });
});

describe('日付は JST 基準（UTCの日付キーと混ぜない）', () => {
  it('dateKey が欠けている試行は completedAt から JST の日付キーを作る', () => {
    // 2026-08-16T15:30Z = JST 2026-08-17 00:30。UTCの日付（08-16）を使うと1日ずれる
    const a = { ...graded('2026-08-16T15:30:00.000Z', ['rec:g1:1'], ['rec:g1:1']), dateKey: undefined };
    const nb = buildMistakeNotebook({ g1: [a] } as unknown as AdvMasteryLedger, '2026-08-19T00:00:00.000Z');
    expect(entryOf(nb, 'rec:g1:1').lastWrongDateKey).toBe('2026-08-17');
  });

  it('経過日数は JST のカレンダー日で数える（日付キーと基準を揃える）', () => {
    // 誤答 8/16 23:30 JST → いま 8/17 00:30 JST。経過1時間だが「昨日の誤答」なので1日
    const nb = buildMistakeNotebook(
      { g1: [graded(jst('2026-08-16', '23:30'), ['rec:g1:1'], ['rec:g1:1'])] },
      jst('2026-08-17', '00:30'),
    );
    const e = entryOf(nb, 'rec:g1:1');
    expect(e.lastWrongDateKey).toBe('2026-08-16');
    expect(e.daysSinceLastWrong).toBe(1);
  });

  it('同じJSTの日なら 0日（朝に間違えて夜に見ても「0日前」）', () => {
    const nb = buildMistakeNotebook(
      { g1: [graded(jst('2026-08-17', '01:00'), ['rec:g1:1'], ['rec:g1:1'])] },
      jst('2026-08-17', '23:00'),
    );
    expect(entryOf(nb, 'rec:g1:1').daysSinceLastWrong).toBe(0);
  });

  it('端末の時計がずれて nowISO が誤答より前でも負の日数を出さない', () => {
    const nb = buildMistakeNotebook(
      { g1: [graded(jst('2026-08-17', '10:00'), ['rec:g1:1'], ['rec:g1:1'])] },
      jst('2026-08-15', '10:00'),
    );
    expect(entryOf(nb, 'rec:g1:1').daysSinceLastWrong).toBe(0);
  });
});

describe('克服判定: 別の日をまたいだ連続正解だけを克服にする（原則9）', () => {
  it('同じ日に2回続けて正解しても克服にしない（おかわりバトルは当日に何度でもできる）', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(jst('2026-08-15', '21:00'), ['rec:g1:1'], ['rec:g1:1']),
        graded(jst('2026-08-16', '21:10'), ['rec:g1:1'], []),
        graded(jst('2026-08-16', '21:20'), ['rec:g1:1'], []),   // 同じ日の2回目
      ],
    };
    const e = buildMistakeNotebook(ledger, NOW).entries[0];
    expect(e.correctStreakSinceLastWrong).toBe(2);              // 連続正解は2回だが
    expect(e.clearDayKeysSinceLastWrong).toEqual(['2026-08-16']); // 別日は1日ぶんしかない
    expect(e.resolution).toBe('unresolved');
    expect(remainingCorrectsForOvercome(e)).toBe(1);
    expect(mistakeStatusText(e).ja).toBe('別の日にあと1回正解すると克服');
    expect(mistakeStatusText(e).zh).toBe('在不同的日子再答对1次，就记为“已订正”');
  });

  it('間違えた当日の正解は「別の日」の証拠に数えない', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(jst('2026-08-15', '09:00'), ['rec:g1:1'], ['rec:g1:1']),
        graded(jst('2026-08-15', '22:00'), ['rec:g1:1'], []),    // 間違えた当日の解き直し
        graded(jst('2026-08-16', '22:00'), ['rec:g1:1'], []),
      ],
    };
    const e = buildMistakeNotebook(ledger, NOW).entries[0];
    expect(e.correctStreakSinceLastWrong).toBe(2);
    expect(e.clearDayKeysSinceLastWrong).toEqual(['2026-08-16']);
    expect(e.resolution).toBe('unresolved');
  });

  it('別々の日に2回連続で正解して克服', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(5), ['rec:g1:1'], ['rec:g1:1']),
        graded(daysAgo(3), ['rec:g1:1'], []),
        graded(daysAgo(1), ['rec:g1:1'], []),
      ],
    };
    const e = buildMistakeNotebook(ledger, NOW).entries[0];
    expect(e.correctStreakSinceLastWrong).toBe(MISTAKE_RULES.clearStreak);
    expect(e.clearDayKeysSinceLastWrong).toEqual([keyOf(daysAgo(3)), keyOf(daysAgo(1))]);
    expect(e.resolution).toBe('overcome');
    expect(isPendingMistake(e)).toBe(false);
    expect(mistakeStatusText(e).ja).toBe('克服（別の日に続けて2回正解）');
    expect(mistakeStatusText(e).zh).toBe('已订正（在不同的日子连续答对2次）');
  });

  it('誤答→別日に正解1回 では克服しない（あと1回と伝える・「1回連続」とは言わない）', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(5), ['rec:g1:1'], ['rec:g1:1']),
        graded(daysAgo(3), ['rec:g1:1'], []),
      ],
    };
    const e = buildMistakeNotebook(ledger, NOW).entries[0];
    expect(e.resolution).toBe('unresolved');
    expect(mistakeStatusText(e).ja).toBe('別の日にあと1回正解すると克服');
    expect(mistakeStatusText(e).zh).toBe('在不同的日子再答对1次，就记为“已订正”');
    expect(mistakeStatusText(e).ja).not.toContain('1回連続');
    expect(mistakeStatusText(e).zh).not.toContain('连续答对1次');
  });

  it('正解2回のあとにまた間違えたら未克服へ戻る（連続も別日もリセット）', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(8), ['rec:g1:1'], ['rec:g1:1']),
        graded(daysAgo(6), ['rec:g1:1'], []),
        graded(daysAgo(5), ['rec:g1:1'], []),
        graded(daysAgo(2), ['rec:g1:1'], ['rec:g1:1']),
      ],
    };
    const e = buildMistakeNotebook(ledger, NOW).entries[0];
    expect(e.wrongCount).toBe(2);
    expect(e.correctStreakSinceLastWrong).toBe(0);
    expect(e.clearDayKeysSinceLastWrong).toEqual([]);
    expect(e.resolution).toBe('unresolved');
    expect(mistakeStatusText(e).ja).toBe('別の日にあと2回正解すると克服');
  });

  it('誤答→正解→旧データ→正解 は「連続2回」と言えないので克服にしない', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(8), ['rec:g1:1'], ['rec:g1:1']),
        graded(daysAgo(6), ['rec:g1:1'], []),
        legacy(daysAgo(4), ['rec:g1:1'], 100),
        graded(daysAgo(2), ['rec:g1:1'], []),
      ],
    };
    const e = buildMistakeNotebook(ledger, NOW).entries[0];
    expect(e.correctSinceLastWrong).toBe(2);       // 正解の実数は2
    expect(e.correctStreakSinceLastWrong).toBe(1); // が「連続」は1
    expect(e.unverifiedSinceLastWrong).toBe(1);    // 途中に正誤不明が1回あったことは残す
    // ただし最後は正誤つきで解けているので「いまの状態が確認できない」ではない。
    // 未確認に固定して「あと1回」を隠すと、旧データを持つ学習者ほど情報が減ってしまう
    expect(e.unverifiedSinceLastGraded).toBe(0);
    expect(e.resolution).toBe('unresolved');
    expect(mistakeStatusText(e).ja).toBe('別の日にあと1回正解すると克服');
  });

  it('最後の試行が旧データなら、そのときの状態は確認できない（unverifiable）', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(8), ['rec:g1:1'], ['rec:g1:1']),
        graded(daysAgo(6), ['rec:g1:1'], []),
        legacy(daysAgo(2), ['rec:g1:1'], 100),
      ],
    };
    const e = buildMistakeNotebook(ledger, NOW).entries[0];
    expect(e.unverifiedSinceLastGraded).toBe(1);
    expect(e.resolution).toBe('unverifiable');
  });

  it('台帳の並びが時系列でなくても completedAt 順に評価する', () => {
    const ledger: AdvMasteryLedger = {
      g1: [
        graded(daysAgo(1), ['rec:g1:1'], []),
        graded(daysAgo(2), ['rec:g1:1'], []),
        graded(daysAgo(5), ['rec:g1:1'], ['rec:g1:1']),
      ],
    };
    expect(buildMistakeNotebook(ledger, NOW).entries[0].resolution).toBe('overcome');
  });

  it('文言の数字は MISTAKE_RULES から作る（規則を変えたら説明も変わる）', () => {
    const rules = MISTAKE_RULES as { clearStreak: number; requireDifferentDays: boolean };
    const original = { ...rules };
    try {
      rules.clearStreak = 3;
      const ledger: AdvMasteryLedger = {
        g1: [
          graded(daysAgo(5), ['rec:g1:1'], ['rec:g1:1']),
          graded(daysAgo(3), ['rec:g1:1'], []),
          graded(daysAgo(1), ['rec:g1:1'], []),
        ],
      };
      const nb = buildMistakeNotebook(ledger, NOW);
      const e = nb.entries[0];
      expect(e.resolution).toBe('unresolved');              // 3回必要になったので未克服
      expect(mistakeStatusText(e).ja).toBe('別の日にあと1回正解すると克服');
      const note = summarizeMistakes(nb).note;
      expect(note.ja).toContain('3日');
      expect(note.zh).toContain('3天');
      expect(note.ja).not.toContain('2回');
      expect(note.zh).not.toContain('2次');
    } finally {
      Object.assign(rules, original);
    }
  });

  it('別日条件を外した設定では文言から「別の日」が消える（説明と実装を一致させる）', () => {
    const rules = MISTAKE_RULES as { clearStreak: number; requireDifferentDays: boolean };
    const original = { ...rules };
    try {
      rules.requireDifferentDays = false;
      const ledger: AdvMasteryLedger = {
        g1: [
          graded(jst('2026-08-15', '21:00'), ['rec:g1:1'], ['rec:g1:1']),
          graded(jst('2026-08-16', '21:10'), ['rec:g1:1'], []),
          graded(jst('2026-08-16', '21:20'), ['rec:g1:1'], []),
        ],
      };
      const e = buildMistakeNotebook(ledger, NOW).entries[0];
      expect(e.resolution).toBe('overcome');                // 同日連続でも克服になる設定
      expect(mistakeStatusText(e).ja).not.toContain('別の日');
      expect(summarizeMistakes(buildMistakeNotebook(ledger, NOW)).note.ja).not.toContain('別々の');
    } finally {
      Object.assign(rules, original);
    }
  });
});

describe('束バトルの二重記録', () => {
  it('同じ試行が単元IDとstage束IDの両方に記録されても1回として数える', () => {
    const a = graded(daysAgo(3), ['rec:g1:1', 'rec:g1:2'], ['rec:g1:1']);
    const ledger: AdvMasteryLedger = { g1: [a], 'stage-1': [a] };
    const nb = buildMistakeNotebook(ledger, NOW);
    const e = entryOf(nb, 'rec:g1:1');
    expect(e.wrongCount).toBe(1);            // 2ではない
    expect(nb.totalAttempts).toBe(1);
    expect(e.targetIds).toEqual(['g1', 'stage-1']);
    // 代表targetは1つ。内訳の合計が全体と合うようにする
    expect(e.targetIds).toContain(e.targetId);
  });

  it('片方だけ正誤を持つ壊れ方でも、正誤つきの側のキーを取りこぼさない', () => {
    const at = daysAgo(3);
    const ledger = {
      // 単元側は旧形式（正誤なし）、束側だけ正誤つき。しかも束側の wrongKeys にしか無いキーがある
      g1: [legacy(at, ['rec:g1:1', 'rec:g1:2'])],
      'stage-1': [graded(at, ['rec:g1:1', 'rec:g1:2'], ['rec:g1:2', 'rec:g1:9'])],
    } as unknown as AdvMasteryLedger;
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(nb.totalAttempts).toBe(1);        // 同一試行として畳む
    expect(nb.gradedAttempts).toBe(1);       // 正誤つきの側を採る
    expect(nb.entries.map((e) => e.questionKey).sort()).toEqual(['rec:g1:2', 'rec:g1:9']);
    expect(entryOf(nb, 'rec:g1:9').wrongCount).toBe(1);
    expect(entryOf(nb, 'rec:g1:2').targetIds).toEqual(['g1', 'stage-1']);
  });

  it('片方が「正解」でも、もう片方が誤答と言っていれば誤答として扱う（正解だと言い切らない）', () => {
    const at = daysAgo(2);
    const ledger: AdvMasteryLedger = {
      g1: [graded(at, ['rec:g1:1', 'rec:g1:2'], [])],
      'stage-1': [graded(at, ['rec:g1:1', 'rec:g1:2'], ['rec:g1:1'])],
    };
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(nb.entries.map((e) => e.questionKey)).toEqual(['rec:g1:1']);
    expect(entryOf(nb, 'rec:g1:1').wrongCount).toBe(1);
  });
});

describe('出題: 未克服から優先度順に返す', () => {
  const ledger: AdvMasteryLedger = {
    g1: [
      // A: 3回誤答（最終 6日前） / B: 2回誤答（最終 9日前） / C: 一度も間違えていない
      graded(daysAgo(12), ['rec:g1:A', 'rec:g1:B', 'rec:g1:C'], ['rec:g1:A', 'rec:g1:B']),
      graded(daysAgo(9), ['rec:g1:A', 'rec:g1:B'], ['rec:g1:A', 'rec:g1:B']),
      graded(daysAgo(6), ['rec:g1:A'], ['rec:g1:A']),
    ],
    g2: [
      // D: 1回誤答だが最近（1日前）。回数が少ないので A・B より後ろ
      graded(daysAgo(1), ['cloze:g2:D'], ['cloze:g2:D']),
    ],
    g3: [
      // E: 誤答後に別の日で2回連続正解＝克服。出題対象から外れる
      graded(daysAgo(8), ['rec:g3:E'], ['rec:g3:E']),
      graded(daysAgo(5), ['rec:g3:E'], []),
      graded(daysAgo(4), ['rec:g3:E'], []),
    ],
  };

  it('回数が多い順 → 最近間違えた順。克服は出さない', () => {
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(pickMistakeReviewKeys(nb, 10)).toEqual(['rec:g1:A', 'rec:g1:B', 'cloze:g2:D']);
  });

  it('誤答回数が同じなら「最近間違えた順 → キー辞書順」で決着する', () => {
    const tie: AdvMasteryLedger = {
      t: [
        // a と b は同じ試行で間違えた（lastWrongAt が同じ）→ キー辞書順
        graded(daysAgo(10), ['rec:t:b', 'rec:t:a'], ['rec:t:b', 'rec:t:a']),
        // c はあとで間違えた → 先に出す
        graded(daysAgo(4), ['rec:t:c'], ['rec:t:c']),
      ],
    };
    const nb = buildMistakeNotebook(tie, NOW);
    expect(nb.entries.map((e) => e.wrongCount)).toEqual([1, 1, 1]);
    expect(pickMistakeReviewKeys(nb, 10)).toEqual(['rec:t:c', 'rec:t:a', 'rec:t:b']);
  });

  it('上限件数を守る／小数は切り捨て／0以下・不正値は空', () => {
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(pickMistakeReviewKeys(nb, 2)).toEqual(['rec:g1:A', 'rec:g1:B']);
    expect(pickMistakeReviewKeys(nb, 2.7)).toEqual(['rec:g1:A', 'rec:g1:B']); // 3問出さない
    expect(pickMistakeReviewKeys(nb, 0.9)).toEqual([]);
    expect(pickMistakeReviewKeys(nb, 0)).toEqual([]);
    expect(pickMistakeReviewKeys(nb, -3)).toEqual([]);
    expect(pickMistakeReviewKeys(nb, Number.NaN)).toEqual([]);
    expect(pickMistakeReviewKeys(nb, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('target・問題タイプで絞れる／克服を混ぜることもできる', () => {
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(pickMistakeReviewKeys(nb, 10, { targetId: 'g2' })).toEqual(['cloze:g2:D']);
    expect(pickMistakeReviewKeys(nb, 10, { questionType: 'cloze' })).toEqual(['cloze:g2:D']);
    expect(pickMistakeReviewKeys(nb, 10, { includeOvercome: true })).toContain('rec:g3:E');
  });

  it('台帳のキー順・配列順が変わっても同じ順（DBから戻したときのブレを防ぐ）', () => {
    // JSON の往復でキー順や配列順が変わっても、出題順が変わってはいけない
    const shuffled: AdvMasteryLedger = {
      g3: [...ledger.g3].reverse(),
      g2: [...ledger.g2],
      g1: [ledger.g1[2], ledger.g1[0], ledger.g1[1]],
    };
    const base = buildMistakeNotebook(ledger, NOW);
    const other = buildMistakeNotebook(shuffled, NOW);
    expect(other.entries.map((e) => e.questionKey)).toEqual(base.entries.map((e) => e.questionKey));
    expect(pickMistakeReviewKeys(other, 10)).toEqual(pickMistakeReviewKeys(base, 10));
  });

  it('pendingMistakeKeySet は未克服だけを集める（バトルの優先再出題に渡す）', () => {
    const set = pendingMistakeKeySet(buildMistakeNotebook(ledger, NOW));
    expect([...set].sort()).toEqual(['cloze:g2:D', 'rec:g1:A', 'rec:g1:B']);
    expect(set.has('rec:g3:E')).toBe(false);
  });
});

describe('表示用の集計', () => {
  const ledger: AdvMasteryLedger = {
    g1: [
      graded(daysAgo(10), ['rec:g1:A', 'rec:g1:B'], ['rec:g1:A', 'rec:g1:B']),
      graded(daysAgo(4), ['rec:g1:A', 'rec:g1:B'], []),
      graded(daysAgo(3), ['rec:g1:A', 'rec:g1:B'], []),   // 別々の日なので A,B とも克服
    ],
    g2: [
      graded(daysAgo(7), ['cloze:g2:C'], ['cloze:g2:C']),
      legacy(daysAgo(2), ['cloze:g2:C'], 100),            // 判定不能
    ],
    g3: [graded(daysAgo(1), ['cloze:g3:D'], ['cloze:g3:D'])], // 未克服
  };

  it('未克服・克服・判定不能の件数と、内訳の合計が一致する', () => {
    const sum = summarizeMistakes(buildMistakeNotebook(ledger, NOW));
    expect(sum.overcomeCount).toBe(2);
    expect(sum.unverifiableCount).toBe(1);
    expect(sum.unresolvedCount).toBe(1);
    expect(sum.pendingCount).toBe(2);
    expect(sum.totalCount).toBe(4);
    const totals = sum.byTarget.reduce((n, r) => n + r.total, 0);
    const pend = sum.byTarget.reduce((n, r) => n + r.pending, 0);
    expect(totals).toBe(sum.totalCount);
    expect(pend).toBe(sum.pendingCount);
  });

  it('内訳は未克服が多い順・ラベルは ja/zh 両方（未指定なら targetId をそのまま出す）', () => {
    const sum = summarizeMistakes(buildMistakeNotebook(ledger, NOW), {
      labelOf: (id) => (id === 'g3' ? { ja: '〜ばかりに', zh: '～ばかりに' } : undefined),
    });
    expect(sum.byTarget.find((r) => r.targetId === 'g3')!.label).toEqual({ ja: '〜ばかりに', zh: '～ばかりに' });
    // 未克服1件のg2・g3が先（同数なのでtargetId辞書順）、未克服0件のg1が最後
    expect(sum.byTarget.map((r) => r.targetId)).toEqual(['g2', 'g3', 'g1']);
    const g1 = sum.byTarget.find((r) => r.targetId === 'g1')!;
    expect(g1.label).toEqual({ ja: 'g1', zh: 'g1' });   // 存在しない名前を作らない
    expect(g1.overcome).toBe(2);
  });

  it('見出しは「未確認」を「未克服」に混ぜない（判定不能を断定しない）', () => {
    const sum = summarizeMistakes(buildMistakeNotebook(ledger, NOW));
    expect(sum.headline.ja).toBe('未克服 1問 / 未確認 1問 / 克服 2問');
    expect(sum.headline.zh).toBe('未订正 1题 / 待确认 1题 / 已订正 2题');
    // 判定不能の件数を未克服側に足していないこと
    expect(sum.headline.ja).not.toContain(`未克服 ${sum.pendingCount}問`);
  });

  it('判定不能が無ければ見出しは2区分・unverifiedNote も出さない', () => {
    const nb = buildMistakeNotebook({ g1: [graded(daysAgo(1), ['rec:g1:A'], ['rec:g1:A'])] }, NOW);
    const sum = summarizeMistakes(nb);
    expect(sum.headline.ja).toBe('未克服 1問 / 克服 0問');
    expect(sum.headline.zh).toBe('未订正 1题 / 已订正 0题');
    expect(sum.unverifiedNote).toBeNull();
  });

  it('但し書きが正直（別日条件・合格を保証しない・数えた範囲を断る）', () => {
    const sum = summarizeMistakes(buildMistakeNotebook(ledger, NOW));
    expect(sum.note.ja).toContain('別々の2日');
    expect(sum.note.ja).toContain('同じ日に続けて正解しただけでは克服にしません');
    expect(sum.note.ja).toContain('保証するものではありません');
    expect(sum.note.zh).toContain('在不同的2天里连续答对2次');
    expect(sum.note.zh).toContain('并不保证考试合格');
    // 台帳に残っている範囲でしか数えられないことを毎回言う（wrongCount は全期間ではない）
    expect(sum.coverageNote.ja).toContain(String(MASTERY_RULES.maxAttemptsKept));
    expect(sum.coverageNote.ja).toContain('それより古い誤答は入っていません');
    expect(sum.coverageNote.zh).toContain(String(MASTERY_RULES.maxAttemptsKept));
    expect(sum.coverageNote.zh).toContain('更早的错题不在其中');
    expect(sum.unverifiedNote?.ja).toContain('1問');
    expect(sum.unverifiedNote?.zh).toContain('1题');
  });

  it('zh は既存語「已攻克」（単元の攻略済み）を1問の状態に流用しない', () => {
    const nb = buildMistakeNotebook(ledger, NOW);
    const sum = summarizeMistakes(nb);
    const zh = [
      sum.headline.zh, sum.note.zh, sum.coverageNote.zh, sum.unverifiedNote?.zh ?? '',
      ...nb.entries.map((e) => mistakeStatusText(e).zh),
      MISTAKE_TERMS.overcome.zh, MISTAKE_TERMS.unresolved.zh, MISTAKE_TERMS.unverifiable.zh,
    ].join('\n');
    expect(zh).not.toContain('攻克');
    expect(zh).not.toContain('攻略');
  });

  it('zh に日本語（かな）や日本語専用の記号が混ざらない', () => {
    const nb = buildMistakeNotebook(ledger, NOW);
    const sum = summarizeMistakes(nb);
    const zh = [
      sum.headline.zh, sum.note.zh, sum.coverageNote.zh, sum.unverifiedNote?.zh ?? '',
      ...nb.entries.map((e) => mistakeStatusText(e).zh),
    ];
    for (const text of zh) {
      expect(text).not.toMatch(/[ぁ-んァ-ヶー]/);
      // 「、」は中国語では並列専用の顿号。文の区切りには使わない（ここでは使わない方針）
      expect(text).not.toContain('、');
    }
  });

  it('文言に煽り・喪失恐怖・断定を入れない（ja/zh 両方）', () => {
    const nb = buildMistakeNotebook(ledger, NOW);
    const sum = summarizeMistakes(nb);
    const texts = [
      sum.headline.ja, sum.headline.zh, sum.note.ja, sum.note.zh,
      sum.coverageNote.ja, sum.coverageNote.zh,
      sum.unverifiedNote?.ja ?? '', sum.unverifiedNote?.zh ?? '',
      ...nb.entries.flatMap((e) => [mistakeStatusText(e).ja, mistakeStatusText(e).zh]),
    ].join('\n');
    for (const banned of ['必ず', '合格できます', '失われ', '消えて', 'ゼロ', '危険']) {
      expect(texts).not.toContain(banned);
    }
    for (const banned of ['一定能', '肯定', '保证合格', '保证通过', '会消失', '危险', '包过']) {
      expect(texts).not.toContain(banned);
    }
  });
});

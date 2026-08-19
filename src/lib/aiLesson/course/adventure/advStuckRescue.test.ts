// つまずき救済（advStuckRescue）のテスト。
// 検証の柱: ①詰まり判定の境界（別日2回では発火しない／3回で発火）
//           ②スキップが3日で必ず戻る（永久スキップが存在しない）
//           ③救済が合格水準を下げない前提（補充は既出問題優先）
import { describe, it, expect } from 'vitest';
import type { AdvMasteryAttempt, AdvMasteryLedger } from './advTypes';
import {
  STUCK_RESCUE_RULES, detectStuck, rescuePlanOf, stuckCheerOf,
  makeStuckSkip, isStuckSkipActive, activeStuckSkips,
} from './advStuckRescue';

/** JST 2026-08-19 の正午（dateKey は 2026-08-19 になる） */
const NOW = '2026-08-19T03:00:00.000Z';
const T = 'n3g-unit-1';

const att = (dateKey: string, scorePct: number, o: Partial<AdvMasteryAttempt> = {}): AdvMasteryAttempt => ({
  dateKey,
  scorePct,
  unseenRatio: 0.5,
  questionKeys: ['q:a', 'q:b', 'q:c'],
  tier: 'normal',
  timed: false,
  completedAt: `${dateKey}T10:00:00.000Z`,
  ...o,
});

const ledgerOf = (attempts: AdvMasteryAttempt[]): AdvMasteryLedger => ({ [T]: attempts });

describe('detectStuck: 詰まり判定の境界', () => {
  it('試行が無ければ詰まっていない', () => {
    const st = detectStuck({}, T, NOW);
    expect(st.stuck).toBe(false);
    expect(st.level).toBe(0);
    expect(st.failDayKeys).toEqual([]);
  });

  it('別日2回の不合格では発火しない（境界の下側）', () => {
    const st = detectStuck(ledgerOf([att('2026-08-17', 57), att('2026-08-18', 43)]), T, NOW);
    expect(st.stuck).toBe(false);
    expect(st.level).toBe(0);
    expect(st.failDayKeys).toHaveLength(2);
  });

  it('別日3回の不合格で発火する（境界の上側・新しい順で返る）', () => {
    const st = detectStuck(
      ledgerOf([att('2026-08-16', 57), att('2026-08-17', 43), att('2026-08-18', 57)]), T, NOW,
    );
    expect(st.stuck).toBe(true);
    expect(st.level).toBe(1);
    expect(st.failDayKeys).toEqual(['2026-08-18', '2026-08-17', '2026-08-16']);
  });

  it('同じ日に何回不合格でも1日と数える（1日3連敗を3日詰まり扱いしない）', () => {
    const st = detectStuck(
      ledgerOf([
        att('2026-08-18', 43, { completedAt: '2026-08-18T09:00:00.000Z' }),
        att('2026-08-18', 57, { completedAt: '2026-08-18T10:00:00.000Z' }),
        att('2026-08-18', 43, { completedAt: '2026-08-18T11:00:00.000Z' }),
        att('2026-08-17', 57),
      ]), T, NOW,
    );
    expect(st.stuck).toBe(false);
    expect(st.failDayKeys).toHaveLength(2);
  });

  it('最新日に合格していれば発火しない（立ち直りを尊重）', () => {
    const st = detectStuck(
      ledgerOf([att('2026-08-15', 57), att('2026-08-16', 43), att('2026-08-17', 57), att('2026-08-18', 71)]),
      T, NOW,
    );
    expect(st.stuck).toBe(false);
    expect(st.failDayKeys).toEqual([]);
  });

  it('合格日より前の不合格は数えない（連続は合格日で切れる）', () => {
    const st = detectStuck(
      ledgerOf([
        att('2026-08-12', 43), att('2026-08-13', 43), // 古い連敗（合格で切れる）
        att('2026-08-14', 86),                        // 合格
        att('2026-08-16', 57), att('2026-08-17', 43), att('2026-08-18', 57),
      ]), T, NOW,
    );
    expect(st.level).toBe(1);
    expect(st.failDayKeys).toEqual(['2026-08-18', '2026-08-17', '2026-08-16']);
  });

  it('途中でやめた回（partial）は不合格の証拠に数えない', () => {
    const st = detectStuck(
      ledgerOf([
        att('2026-08-16', 30, { partial: true }),
        att('2026-08-17', 0, { partial: true }),
        att('2026-08-18', 30, { partial: true }),
      ]), T, NOW,
    );
    expect(st.stuck).toBe(false);
    expect(st.failDayKeys).toEqual([]);
  });

  it('recentWindowDaysより古い不合格は数えない（昔の記録で今日を責めない)', () => {
    const st = detectStuck(
      ledgerOf([att('2026-08-01', 43), att('2026-08-02', 43), att('2026-08-03', 43)]), T, NOW,
    );
    expect(st.stuck).toBe(false);
    expect(st.failDayKeys).toEqual([]);
  });

  it('別日5回の連続不合格で level2（一時スキップ提案）に上がる', () => {
    const st = detectStuck(
      ledgerOf([
        att('2026-08-14', 43), att('2026-08-15', 57), att('2026-08-16', 43),
        att('2026-08-17', 57), att('2026-08-18', 43),
      ]), T, NOW,
    );
    expect(st.level).toBe(2);
    expect(st.failDayKeys).toHaveLength(5);
  });

  it('境界: 4別日ではまだ level1（failDaysForSkip=5 の下側）', () => {
    const st = detectStuck(
      ledgerOf([
        att('2026-08-15', 43), att('2026-08-16', 43),
        att('2026-08-17', 57), att('2026-08-18', 43),
      ]), T, NOW,
    );
    expect(st.level).toBe(1);
  });
});

describe('detectStuck: 間違えたままの問題キー（救済バトルの材料）', () => {
  it('後の試行で正解し直した問題は弱点に含めない（最新の結果が勝つ）', () => {
    const st = detectStuck(
      ledgerOf([
        att('2026-08-16', 43, { questionKeys: ['q:a', 'q:b', 'q:c'], wrongKeys: ['q:a', 'q:b'] }),
        att('2026-08-17', 43, {
          questionKeys: ['q:a', 'q:b', 'q:d'], wrongKeys: ['q:b', 'q:d'],
        }), // q:a は正解し直した
        att('2026-08-18', 43, { questionKeys: ['q:e'], wrongKeys: ['q:e'] }),
      ]), T, NOW,
    );
    expect(st.recentWrongKeys).toEqual(['q:e', 'q:b', 'q:d']); // 新しい順・q:a は除外
  });

  it('wrongKeysが無い旧データの試行は正解扱いにも誤答扱いにもしない', () => {
    const st = detectStuck(
      ledgerOf([
        att('2026-08-17', 43, { questionKeys: ['q:a', 'q:b'], wrongKeys: ['q:b'] }),
        // 旧データ（正誤不明）。q:b を含むが「正解し直した」と推定してはいけない
        att('2026-08-18', 43, { questionKeys: ['q:b', 'q:c'] }),
      ]), T, NOW,
    );
    expect(st.recentWrongKeys).toEqual(['q:b']);
  });
});

describe('rescuePlanOf: 救済の提案', () => {
  const stuck1 = detectStuck(
    ledgerOf([
      att('2026-08-16', 43, { questionKeys: ['q:a', 'q:b', 'q:c'], wrongKeys: ['q:a', 'q:b'] }),
      att('2026-08-17', 43, { questionKeys: ['q:c', 'q:d'], wrongKeys: ['q:d'] }),
      att('2026-08-18', 57, { questionKeys: ['q:e', 'q:f'], wrongKeys: ['q:e'] }),
    ]), T, NOW,
  );

  it('詰まっていなければ何も提案しない', () => {
    const plan = rescuePlanOf(
      { stuck: false, level: 0, failDayKeys: [], recentWrongKeys: [] },
      { targetId: T, poolKeys: ['p:1'], todayKey: '2026-08-19' },
    );
    expect(plan.level).toBe(0);
    expect(plan.focusBattle).toBeNull();
    expect(plan.skip).toBeNull();
    expect(plan.encourageJa).toBe('');
  });

  it('level1: 間違えた問題を先頭に、既出プール優先で7問に補充する（重複なし）', () => {
    expect(stuck1.level).toBe(1);
    const plan = rescuePlanOf(stuck1, {
      targetId: T,
      poolKeys: ['p:1', 'p:2', 'p:3', 'p:4', 'p:5', 'p:6'],
      seenKeys: new Set(['p:4', 'p:5']),
      todayKey: '2026-08-19',
    });
    expect(plan.focusBattle).not.toBeNull();
    const keys = plan.focusBattle?.questionKeys ?? [];
    expect(keys).toHaveLength(STUCK_RESCUE_RULES.focusBattleSize);
    // 誤答（新しい順）が先頭 → 既出のプール問題 → 未出のプール問題
    expect(keys).toEqual(['q:e', 'q:d', 'q:a', 'q:b', 'p:4', 'p:5', 'p:1']);
    expect(new Set(keys).size).toBe(keys.length);
    expect(plan.skip).toBeNull(); // level1ではスキップは提案しない
    expect(plan.encourageJa).toContain('よくある');
    expect(plan.encourageZh).toContain('很常见');
  });

  it('プールが7問に満たなければその分だけ短い（存在するふりをしない）', () => {
    const plan = rescuePlanOf(
      { stuck: true, level: 1, failDayKeys: ['2026-08-18', '2026-08-17', '2026-08-16'], recentWrongKeys: ['q:a'] },
      { targetId: T, poolKeys: ['q:a', 'p:1'], todayKey: '2026-08-19' },
    );
    expect(plan.focusBattle?.questionKeys).toEqual(['q:a', 'p:1']);
  });

  it('level2: 次の束があればスキップ提案（3日後に自動で戻る日付つき）', () => {
    const plan = rescuePlanOf(
      { stuck: true, level: 2, failDayKeys: [], recentWrongKeys: ['q:a'] },
      { targetId: T, poolKeys: ['p:1'], nextTargetId: 'n3g-unit-2', todayKey: '2026-08-19' },
    );
    expect(plan.skip).not.toBeNull();
    expect(plan.skip?.skipTargetId).toBe(T);
    expect(plan.skip?.parallelTargetId).toBe('n3g-unit-2');
    expect(plan.skip?.returnDateKey).toBe('2026-08-22'); // 19 + 3日
    expect(plan.focusBattle).not.toBeNull(); // 救済バトルの選択肢も残す
    expect(plan.encourageJa).toContain('よくある');
  });

  it('level2でも次の束が無ければスキップは出さず救済バトルで続行', () => {
    const plan = rescuePlanOf(
      { stuck: true, level: 2, failDayKeys: [], recentWrongKeys: ['q:a'] },
      { targetId: T, poolKeys: ['p:1', 'p:2'], nextTargetId: null, todayKey: '2026-08-19' },
    );
    expect(plan.skip).toBeNull();
    expect(plan.focusBattle).not.toBeNull();
    expect(plan.encourageJa).not.toBe('');
  });
});

describe('一時スキップ: 3日で必ず戻る（永久スキップは存在しない）', () => {
  it('makeStuckSkip: 復帰日はスキップ開始日+3日で確定する', () => {
    const skip = makeStuckSkip(T, '2026-08-19');
    expect(skip.skippedOnKey).toBe('2026-08-19');
    expect(skip.returnDateKey).toBe('2026-08-22');
  });

  it('スキップ当日から2日後までは有効、3日後（returnDateKey当日）から自動で戻る', () => {
    const skip = makeStuckSkip(T, '2026-08-19');
    expect(isStuckSkipActive(skip, '2026-08-19')).toBe(true);
    expect(isStuckSkipActive(skip, '2026-08-20')).toBe(true);
    expect(isStuckSkipActive(skip, '2026-08-21')).toBe(true);
    expect(isStuckSkipActive(skip, '2026-08-22')).toBe(false); // ここで戻る
    expect(isStuckSkipActive(skip, '2026-09-01')).toBe(false); // その後もずっと戻ったまま
  });

  it('月またぎでも3日で戻る（日付キーの加算がカレンダー通り）', () => {
    const skip = makeStuckSkip(T, '2026-08-30');
    expect(skip.returnDateKey).toBe('2026-09-02');
    expect(isStuckSkipActive(skip, '2026-09-01')).toBe(true);
    expect(isStuckSkipActive(skip, '2026-09-02')).toBe(false);
  });

  it('activeStuckSkips: 期限切れは自動で落ちる（解除処理を書き忘れても永久化しない）', () => {
    const skips = [makeStuckSkip('a', '2026-08-15'), makeStuckSkip('b', '2026-08-18')];
    const active = activeStuckSkips(skips, '2026-08-19');
    expect(active.map((s) => s.targetId)).toEqual(['b']); // aは8/18に復帰済み
    expect(activeStuckSkips(skips, '2026-08-21')).toEqual([]);
  });
});

describe('相棒の励ましセリフ', () => {
  it('全相棒×全レベルで ja/zh があり、「よくあること」を必ず伝える', () => {
    for (const id of ['natsu', 'haru', 'aki'] as const) {
      for (const level of [1, 2] as const) {
        const c = stuckCheerOf(id, level);
        expect(c.ja.length, `${id} L${level} ja`).toBeGreaterThan(0);
        expect(c.zh.length, `${id} L${level} zh`).toBeGreaterThan(0);
        expect(c.ja, `${id} L${level} ja`).toContain('よくある');
        expect(c.zh, `${id} L${level} zh`).toContain('很常见');
      }
    }
  });

  it('相棒未選択は既定（ナツ）のセリフになる', () => {
    expect(stuckCheerOf(null, 1)).toEqual(stuckCheerOf('natsu', 1));
    expect(stuckCheerOf(undefined, 2)).toEqual(stuckCheerOf('natsu', 2));
  });
});

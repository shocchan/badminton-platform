// つまずき救済の配線（2026-08-22）。
//
// advStuckRescue.ts は 2026-08-19 に作られていたが、**画面のどこにも繋がっていなかった**。
// 同じ束で別日3回不合格＝本人には打つ手が見えない状態で、そこが最大の離脱点。
// ここで守るのは配線の約束:
//   ① ホームに救済カードが出る（相棒の励まし＋救済バトル／一時スキップ）
//   ② 救済バトルは**通常の束ID**で走る（＝合格すればそのまま攻略の証拠。合格ラインを下げない）
//   ③ 出題は指定キーだけに絞られる（間違えた問題が中心）
//   ④ 一時スキップは3日で自動復帰。スキップ中の束は今日の主対象から外れる
//   ⑤ スキップの記録はプロファイルに保存され、期限切れは読み込み時に落ちる
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readAdvProfile, defaultAdvProfile, writeAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import {
  detectStuck, rescuePlanOf, makeStuckSkip, activeStuckSkips, STUCK_RESCUE_RULES,
} from '../../../lib/aiLesson/course/adventure/advStuckRescue';
import type { AdvMasteryLedger } from '../../../lib/aiLesson/course/adventure/advTypes';

const SRC = readFileSync(new URL('./AdvShell.tsx', import.meta.url), 'utf8');
const NOW = '2026-08-22T10:00:00.000Z';

describe('① ホームの救済カード', () => {
  it('詰まり判定と提案を quest 生成のところで呼んでいる', () => {
    expect(SRC).toMatch(/detectStuck\(profile\.mastery, stuckTargetId, nowISO\)/);
    expect(SRC).toMatch(/rescuePlanOf\(status, \{/);
    // 相棒の励ましを出す（責めない文言は advStuckRescue が持つ）
    expect(SRC).toMatch(/rescue\.plan\.encourageJa, rescue\.plan\.encourageZh/);
  });

  it('救済カードは「今日の冒険」カードより前に出る（気づかれない位置に置かない）', () => {
    const rescueAt = SRC.indexOf('{rescue && (');
    const questAt = SRC.indexOf('{quest && (\n        <div className={`${card} mb-4 border-blue-200`}>');
    expect(rescueAt).toBeGreaterThan(0);
    expect(questAt).toBeGreaterThan(0);
    expect(rescueAt).toBeLessThan(questAt);
  });
});

describe('② ③ 救済バトルの走らせ方', () => {
  it('救済バトルは束IDで走り、出題キーだけに絞る（錯題本の専用IDは使わない）', () => {
    const block = /trackAdv\('stuck_rescue_focus_battle'[\s\S]{0,600}?setView\('battle'\);/.exec(SRC);
    expect(block, '救済バトルのハンドラが見つからない').toBeTruthy();
    expect(block![0]).toMatch(/targetId: rescue\.targetId/);
    expect(block![0]).toMatch(/focusKeys: fb\.questionKeys/);
    expect(block![0]).not.toMatch(/MISTAKE_TARGET_ID/);
  });

  it('focusKeys があるときは、その問題だけのプールを束IDで作って渡す', () => {
    expect(SRC).toMatch(/const focusPool = \(\) => \{|const focusPool = \(\(\) => \{/);
    expect(SRC).toMatch(/new Map<string, AdvBattleQuestion\[\]>\(\[\[battle\.targetId, picked\]\]\)/);
    expect(SRC).toMatch(/pool=\{mistakePool \?\? focusPool \?\?/);
  });
});

describe('④ 一時スキップ', () => {
  it('スキップ中の束は今日の主対象から外れ、quest には除外後のリストを渡す', () => {
    expect(SRC).toMatch(/const activeSkips = activeStuckSkips\(profile\.stuckSkips \?\? \[\], dateKey\)/);
    expect(SRC).toMatch(/const liveGrammarIds = ct\.nextGrammarIds\.filter\(\(x\) => !skipped\.has\(bundleOfItem\(x\)\)\)/);
    expect(SRC).toMatch(/nextGrammarIds: liveGrammarIds/);
  });

  it('スキップは必ず期限つきで保存される（永久スキップを作らない）', () => {
    const block = /trackAdv\('stuck_rescue_skip'[\s\S]{0,500}?setRescue\(null\);/.exec(SRC);
    expect(block, 'スキップのハンドラが見つからない').toBeTruthy();
    expect(block![0]).toMatch(/makeStuckSkip\(sk\.skipTargetId, dateKey\)/);
  });
});

describe('⑤ 保存と自動復帰（実データで確認）', () => {
  const settingsWith = (skips: unknown) => ({ adventureV2: { ...defaultAdvProfile(NOW), stuckSkips: skips } });

  it('スキップはプロファイルに往復し、3日後に自動で戻る', () => {
    const skip = makeStuckSkip('bundle-a', '2026-08-22');
    expect(skip.returnDateKey).toBe('2026-08-25');   // skipReturnDays = 3
    const saved = writeAdvProfile(
      { zhSupport: true, correction: 'gentle', weeklyTarget: 5, sessionMinutes: 15, examDateISO: null } as never,
      { ...defaultAdvProfile(NOW), stuckSkips: [skip] }, NOW);
    const back = readAdvProfile(saved as never);
    expect(back?.stuckSkips).toEqual([skip]);
    // 期限内は有効・期限日には戻る
    expect(activeStuckSkips([skip], '2026-08-24').length).toBe(1);
    expect(activeStuckSkips([skip], '2026-08-25').length).toBe(0);
  });

  it('壊れた記録・期限の無い記録は読み込みで落ちる', () => {
    const back = readAdvProfile(settingsWith([
      { targetId: 'ok', skippedOnKey: '2026-08-22', returnDateKey: '2026-08-25' },
      { targetId: 'no-return' },            // 期限が無い＝永久スキップは受け付けない
      'garbage',
    ]) as never);
    expect(back?.stuckSkips.map((x) => x.targetId)).toEqual(['ok']);
  });

  it('古いプロファイル（stuckSkips が無い）を読んでも落ちない', () => {
    const back = readAdvProfile({ adventureV2: { schemaVersion: 1, enabled: true } } as never);
    expect(back?.stuckSkips).toEqual([]);
  });
});

describe('救済の中身（合格ラインを下げていないこと）', () => {
  const ledgerWithFails = (days: string[]): AdvMasteryLedger => ({
    'bundle-a': days.map((dateKey) => ({
      dateKey, scorePct: 40, completedAt: `${dateKey}T09:00:00.000Z`,
      questionKeys: ['q1', 'q2'], wrongKeys: ['q1'], unseenCapped: false,
      unseenRatio: 0, tier: 'normal' as const, timed: false, partial: false,
      skills: ['grammar' as const], bySkill: {},
    })) as unknown as AdvMasteryLedger[string],
  });

  it('別日3回の不合格で level1、5回で level2 になる（2回では出ない）', () => {
    const two = detectStuck(ledgerWithFails(['2026-08-21', '2026-08-22']), 'bundle-a', NOW);
    expect(two.level).toBe(0);
    const three = detectStuck(ledgerWithFails(['2026-08-20', '2026-08-21', '2026-08-22']), 'bundle-a', NOW);
    expect(three.level).toBe(1);
    const five = detectStuck(
      ledgerWithFails(['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22']), 'bundle-a', NOW);
    expect(five.level).toBe(2);
  });

  it('救済バトルは間違えた問題が先頭で、7問を超えない', () => {
    const status = detectStuck(ledgerWithFails(['2026-08-20', '2026-08-21', '2026-08-22']), 'bundle-a', NOW);
    const plan = rescuePlanOf(status, {
      targetId: 'bundle-a',
      poolKeys: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'],
      seenKeys: new Set(['q2', 'q3']),
      nextTargetId: null, todayKey: '2026-08-22',
    }, 'natsu');
    expect(plan.focusBattle?.questionKeys[0]).toBe('q1');
    expect(plan.focusBattle?.questionKeys.length).toBe(STUCK_RESCUE_RULES.focusBattleSize);
    // 既出を優先して補充する（未出で埋めて qualifying 試行に化けさせない）
    expect(plan.focusBattle?.questionKeys.slice(1, 3)).toEqual(['q2', 'q3']);
    // 最後の束にはスキップ提案を出さない（行き先が無い）
    expect(plan.skip).toBeNull();
  });
});

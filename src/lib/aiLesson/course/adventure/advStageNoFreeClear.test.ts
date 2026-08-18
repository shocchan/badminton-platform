// 「一度も戦わずに攻略済みになるstage」が生まれていないことの回帰テスト（2026-08-18 P0）。
//
// 起きていたこと: 読解stage・ボスstage・N2の門は、攻略判定に使う配下targetが
// **手前のstageと同じか部分集合**だった。そのため手前を終えた瞬間に攻略済みへ変わり、
// currentStageOf の現在地に一度もならないまま100%になっていた。
// 画面には攻略条件「ランダム問題で80%以上を別の日に3回＋7日後の確認」と書いてあるのに、
// その条件がどこにも適用されない＝「N5達成の確認」が実体として存在しなかった。
//
// 実測（日次シミュレータ）で該当していたstage:
//   N5: stg-n5reading / stg-n5boss、N4: stg-n4reading / stg-n4boss、
//   N3: stg-n3boss、N2: stg-n2gate / stg-n2reading / stg-n2boss
// N2目標では読解の練習が生涯1回だけで「N2模擬ボス」を一度も戦わずに攻略済みになっていた。
//
// 同時に、**要求だけ増やして戦う手段が無い**ともっと悪い行き止まりになるので、
// 「現在地になったらその攻略条件を満たすstepが今日の冒険に出る」ことも併せて固定する。
import { describe, it, expect } from 'vitest';
import {
  generateRoute, stageMasteryTargetIds, stageContentTargetIds, deriveMasteredStageIds,
  currentStageOf, isConversationStage, readingEvidenceTargetId,
} from './advRoute';
import { loadGrammarPools } from './advContent';
import { generateTodayQuest } from './advQuest';
import { readingTargetIds } from './reading/readingBank';
import { listeningTargetIds } from './listening/listeningBank';
import type { AdvBand, AdventureV2Profile, AdvRoute, AdvRouteStage, JlptLevel } from './advTypes';

const TARGETS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2'];
const BANDS: AdvBand[] = ['needs_assessment', 'n4_late', 'n3_late'];

const routeFor = (target: JlptLevel, band: AdvBand): AdvRoute => generateRoute({
  goalType: 'jlpt', targetJlpt: target, knowledgeBand: band, conversationBand: band,
  diagnosis: null, nowISO: '2026-08-18T00:00:00.000Z',
});

describe('攻略ルートに「戦わずに終わるstage」が無い', () => {
  it('手前のstageを全部終えても、次のstageは自動で攻略済みにならない', async () => {
    const p = await loadGrammarPools();
    const free: string[] = [];
    for (const target of TARGETS) {
      for (const band of BANDS) {
        const route = routeFor(target, band);
        const gated = route.stages.filter((s) => !isConversationStage(s));
        // 現在地のstageだけを攻略していく（＝実際の学習の進み方）
        const mastered = new Set<string>();
        const visited: string[] = [];
        for (let i = 0; i < 40; i += 1) {
          const done = deriveMasteredStageIds(
            route, mastered, p.n3Ids, p.n2ByUnit, p.n3BundleByItem, p.basicByUnit, p.basicBundleByUnit);
          const cur = currentStageOf(route, done);
          if (!cur || visited.includes(cur.stageId)) break;
          visited.push(cur.stageId);
          const ids = stageMasteryTargetIds(
            cur, p.n3Ids, p.n2ByUnit, p.n3BundleByItem, p.basicByUnit, p.basicBundleByUnit, route.destinationJlpt);
          expect(ids.length, `${target}/${band} ${cur.stageId} の攻略条件が空`).toBeGreaterThan(0);
          for (const id of ids) mastered.add(id);
        }
        for (const s of gated) {
          if (!visited.includes(s.stageId)) free.push(`${target}/${band}:${s.stageId}`);
        }
      }
    }
    expect(free, `一度も現在地にならないstage: ${free.join(', ')}`).toEqual([]);
  }, 300_000);

  it('ボス・門は自分の撃破記録でしか攻略できない（手前の学習では埋まらない）', async () => {
    const p = await loadGrammarPools();
    let checked = 0;
    for (const target of TARGETS) {
      const route = routeFor(target, 'needs_assessment');
      for (const s of route.stages) {
        if (s.kind !== 'mock_boss' && s.kind !== 'n2_gate') continue;
        checked += 1;
        const ids = stageMasteryTargetIds(
          s, p.n3Ids, p.n2ByUnit, p.n3BundleByItem, p.basicByUnit, p.basicBundleByUnit, route.destinationJlpt);
        expect(ids, `${target} ${s.stageId}`).toEqual([s.stageId]);
        // ボス戦の出題対象は**プールのキー**であること（stageIdを渡すと0問バトルになる）
        const battleTargets = stageContentTargetIds(
          s, p.n3Ids, p.n2ByUnit, p.n3BundleByItem, p.basicByUnit, p.basicBundleByUnit);
        const questions = battleTargets.reduce((n, id) => n + (p.byItem.get(id)?.length ?? 0), 0);
        // rankboss は20問編成。別日3回＋7日後の確認を未出問題で回せる下限として余裕をみる
        expect(questions, `${target} ${s.stageId} のボス戦の出題数`).toBeGreaterThanOrEqual(60);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  }, 300_000);

  it('読解stageは読解の実績を攻略条件にする', async () => {
    const p = await loadGrammarPools();
    let checked = 0;
    for (const target of TARGETS) {
      const route = routeFor(target, 'needs_assessment');
      for (const s of route.stages) {
        if (s.kind !== 'reading_listening') continue;
        checked += 1;
        const ids = stageMasteryTargetIds(
          s, p.n3Ids, p.n2ByUnit, p.n3BundleByItem, p.basicByUnit, p.basicBundleByUnit, route.destinationJlpt);
        expect(ids).toContain(readingEvidenceTargetId(route.destinationJlpt));
        // 攻略条件にするからには在庫が要る（3セット×別日3回＋確認）
        expect(readingTargetIds(target as 'N5' | 'N4' | 'N3' | 'N2').length).toBeGreaterThan(0);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  }, 300_000);
});

describe('攻略条件を満たす手段が今日の冒険に出る（要求だけ増やして詰ませない）', () => {
  const questFor = (
    route: AdvRoute, stage: AdvRouteStage, target: JlptLevel,
    minutes: 5 | 15 | 30, bossTargets: string[],
  ) => {
    const profile = {
      schemaVersion: 1, enabled: true, goalType: 'jlpt', targetJlpt: target,
      examDateISO: null, weeklyDays: 7, dailyMinutes: minutes, companionId: 'natsu',
      teacherId: null, diagnosis: null, skills: {}, route, mastery: {},
      lastQuest: null, todaySteps: null, questLog: [], xp: 0, mockSession: null, mockLog: [],
      kana: null, answerSheets: [], answerSheetSession: null, teacherNotes: [],
    } as unknown as AdventureV2Profile;
    // 手前のstageは全部攻略済み＝このstageが現在地、という状態を作る
    const done = new Set(route.stages.slice(0, route.stages.indexOf(stage)).map((s) => s.stageId));
    const lvl = target as 'N5' | 'N4' | 'N3' | 'N2';
    return generateTodayQuest({
      profile, route, reviewQuestionCount: 0, weakGrammarIds: [],
      dateKey: '2026-09-10', nowISO: '2026-09-10T09:00:00.000Z', daysToExam: null,
      masteredStageIds: done, contentStage: stage,
      availability: {
        nextGrammarIds: [], nextUnitIds: [], conversationTargets: [],
        confirmTargetIds: [], vocabBattleTargetId: null, bossBattleTargetIds: bossTargets,
      },
      examSkills: {
        weakestSkill: null, readingEvidence: 5, listeningEvidence: 5,
        readingTargetIds: readingTargetIds(lvl), listeningTargetIds: listeningTargetIds(lvl),
      },
    });
  };

  it('ボスstageが現在地なら、どの学習時間設定でもボス戦stepが出る', async () => {
    const p = await loadGrammarPools();
    const missing: string[] = [];
    for (const target of TARGETS) {
      const route = routeFor(target, 'needs_assessment');
      for (const s of route.stages) {
        if (s.kind !== 'mock_boss' && s.kind !== 'n2_gate') continue;
        const bossTargets = stageContentTargetIds(
          s, p.n3Ids, p.n2ByUnit, p.n3BundleByItem, p.basicByUnit, p.basicBundleByUnit);
        for (const minutes of [5, 15, 30] as const) {
          const q = questFor(route, s, target, minutes, bossTargets);
          const boss = q.steps.find((x) => x.tier === 'rankboss' || x.tier === 'midboss');
          if (!boss) missing.push(`${target}/${s.stageId}/${minutes}分`);
          else expect(boss.refIds.every((id) => p.byItem.has(id)), `${s.stageId} のボス戦に空target`).toBe(true);
        }
      }
    }
    expect(missing, `ボス戦stepが出ない: ${missing.join(', ')}`).toEqual([]);
  }, 300_000);

  it('読解stageが現在地なら、どの学習時間設定でも読解stepが出る', async () => {
    const missing: string[] = [];
    for (const target of TARGETS) {
      const route = routeFor(target, 'needs_assessment');
      for (const s of route.stages) {
        if (s.kind !== 'reading_listening') continue;
        for (const minutes of [5, 15, 30] as const) {
          const q = questFor(route, s, target, minutes, []);
          if (!q.steps.some((x) => x.kind === 'reading_short')) missing.push(`${target}/${s.stageId}/${minutes}分`);
        }
      }
    }
    expect(missing, `読解stepが出ない: ${missing.join(', ')}`).toEqual([]);
  }, 300_000);
});

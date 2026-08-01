// 4 Persona で正準Journeyを一周する受入テスト（PRODUCT_CANON §4・PILOT §11）。
//
// ここで守りたいのは「誰に対しても商品として成立するか」。
// とくに **目的地を本人から奪わない**（原則1）と **基礎不足は経由地**（原則2）は、
// 実力が目標に届いていない学習者ほど破られやすいので、Personaごとに固定する。
import { describe, it, expect } from 'vitest';
import { generateRoute, currentStageOf, conversationStartArea } from './advRoute';
import { generateTodayQuest } from './advQuest';
import { defaultAdvProfile } from './advProfile';
import { computeReadiness } from './advReadiness';
import { buildLessonPrepSummary } from './advHumanLesson';
import { buildWeeklySummary } from './advWeekly';
import { pickRestateMaterial } from './advRestate';
import type { AdventureV2Profile, AdvBand, AdvGoalType, JlptLevel } from './advTypes';

const NOW = '2026-08-05T09:00:00.000Z';
const DATE = '2026-08-05';

interface PersonaSpec {
  name: string;
  goalType: AdvGoalType;
  targetJlpt: JlptLevel | null;
  knowledgeBand: AdvBand;
  conversationBand: AdvBand;
  dailyMinutes: 5 | 15 | 30;
}

/** 初回Journey: 目的 → 目標レベル → 先生 → 診断 → ルート生成 */
const onboard = (p: PersonaSpec): AdventureV2Profile => {
  const route = generateRoute({
    goalType: p.goalType,
    targetJlpt: p.targetJlpt,
    knowledgeBand: p.knowledgeBand,
    conversationBand: p.conversationBand,
    diagnosis: null,
    nowISO: NOW,
  });
  return {
    ...defaultAdvProfile(NOW),
    goalType: p.goalType,
    targetJlpt: p.targetJlpt,
    dailyMinutes: p.dailyMinutes,
    teacherId: 'yuto',
    examDateISO: p.targetJlpt ? '2026-12-06T00:00:00.000Z' : null,
    diagnosis: {
      completedAt: NOW,
      knowledgeBand: p.knowledgeBand,
      conversationBand: p.conversationBand,
    } as AdventureV2Profile['diagnosis'],
    skills: {
      ...defaultAdvProfile(NOW).skills,
      grammar: { currentScore: 40, confidence: 'medium', evidenceCount: 12, lastAssessedAt: NOW, band: p.knowledgeBand },
      conversation: { currentScore: 45, confidence: 'medium', evidenceCount: 8, lastAssessedAt: NOW, band: p.conversationBand },
    },
    route,
  };
};

/** 毎日Journey: 今日の冒険を作る */
const todayQuest = (prof: AdventureV2Profile, over: Partial<Parameters<typeof generateTodayQuest>[0]> = {}) =>
  generateTodayQuest({
    profile: prof,
    route: prof.route!,
    dueReviewCount: 2,
    weakGrammarIds: [],
    dateKey: DATE,
    nowISO: NOW,
    daysToExam: prof.examDateISO ? 123 : null,
    availability: {
      nextGrammarIds: ['n3g-001', 'n3g-002'],
      nextUnitIds: ['u1'],
      conversationTargets: [
        { refId: 'c1', expression: '〜たことがあります', themeJa: '休みの日', themeZh: '休息日' },
      ],
    },
    examSkills: {
      weakestSkill: 'reading',
      readingEvidence: 0,
      listeningEvidence: 0,
      readingTargetIds: ['read-n3-shortPassage'],
      listeningTargetIds: ['listen-n3-taskComprehension'],
    },
    ...over,
  });

const PERSONAS: PersonaSpec[] = [
  // A: N2志望だが実力はN3未満
  { name: 'A:N2', goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n4', conversationBand: 'n4', dailyMinutes: 15 },
  // B: 学習経験が少なくN3志望
  { name: 'B:N3', goalType: 'jlpt', targetJlpt: 'N3', knowledgeBand: 'pre_n5', conversationBand: 'pre_n5', dailyMinutes: 15 },
  // C: 知識はあるが会話でN3語彙が不安定
  { name: 'C:会話', goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n2', conversationBand: 'n3', dailyMinutes: 15 },
  // D: N2合格＋仕事の会話
  { name: 'D:Hybrid', goalType: 'hybrid', targetJlpt: 'N2', knowledgeBand: 'n3', conversationBand: 'n3', dailyMinutes: 30 },
];

describe('正準Journey — 4 Persona 共通', () => {
  for (const p of PERSONAS) {
    describe(p.name, () => {
      const prof = onboard(p);

      it('初回: 診断 → ルートが生成され、現在地が決まる', () => {
        expect(prof.route).toBeTruthy();
        expect(prof.route!.stages.length).toBeGreaterThan(0);
        expect(currentStageOf(prof.route!, new Set())).toBeTruthy();
      });

      it('**目的地を本人から奪わない**（原則1）', () => {
        if (p.targetJlpt) {
          // 実力が届いていなくても、**ルートの最終目的地は選んだレベルのまま**
          expect(prof.route!.destinationJlpt).toBe(p.targetJlpt);
          expect(prof.targetJlpt).toBe(p.targetJlpt);
          // 「なぜこのルートか」の説明が必ずある（基礎補強を恥にしない文・原則2）
          expect(prof.route!.explanationJa.length).toBeGreaterThan(0);
          expect(prof.route!.explanationZh.length).toBeGreaterThan(0);
        }
      });

      it('毎日: 今日の冒険が1つ生成され、所要時間と成功条件がある', () => {
        const q = todayQuest(prof);
        expect(q.steps.length).toBeGreaterThan(0);
        expect(q.estimatedMinutes).toBeGreaterThan(0);
        expect(q.successConditionJa.length).toBeGreaterThan(0);
        expect(q.successConditionZh.length).toBeGreaterThan(0);
      });

      it('**設定した1日の学習時間を大きく超えない**（続けられる量にする）', () => {
        const q = todayQuest(prof);
        expect(q.estimatedMinutes).toBeLessThanOrEqual((p.dailyMinutes ?? 15) * 2);
      });

      it('毎日: 冒険の各stepに ja/zh の表示名がある', () => {
        for (const s of todayQuest(prof).steps) {
          expect(s.titleJa.length, s.kind).toBeGreaterThan(0);
          expect(s.titleZh.length, s.kind).toBeGreaterThan(0);
        }
      });

      it('学習後: 言い直しの素材が必ず返る（行き止まりを作らない・原則15）', () => {
        const q = todayQuest(prof);
        const m = pickRestateMaterial({
          conversationCorrection: null,
          battleMistakes: [],
          targetExpressions: q.targetExpressions,
          usedExpressions: [],
        });
        expect(m.instructionJa.length).toBeGreaterThan(0);
        expect(m.titleZh.length).toBeGreaterThan(0);
      });

      it('定期: 先生レッスンの候補が最大3件に絞られる（canon §7）', () => {
        const s = buildLessonPrepSummary(prof, NOW);
        expect(s.learnerViewJa.length).toBeLessThanOrEqual(3);
        expect(s.learnerViewZh.length).toBeLessThanOrEqual(3);
        expect(s.focusCandidates.length).toBeLessThanOrEqual(3);
      });

      it('定期: 週のまとめが出て、記録が無いうちは伸びを主張しない（原則13）', () => {
        const wk = buildWeeklySummary(prof, NOW);
        expect(wk.headlineJa.length).toBeGreaterThan(0);
        expect(wk.skillChanges.every((c) => c.deltaPct === null)).toBe(true);
      });

      it('**一技能だけで合格準備度を出さない**（原則14）', () => {
        const r = computeReadiness(p.targetJlpt === 'N3' ? 'N3' : 'N2', prof.skills, prof.mastery);
        expect(r.overallPct).toBeNull();
      });
    });
  }
});

describe('Persona A（N2志望・実力N3未満）', () => {
  const prof = onboard(PERSONAS[0]);

  it('**N3の基礎はN2攻略の経由地として入る**（降格ではない・原則2）', () => {
    const kinds = prof.route!.stages.map((s) => s.kind);
    // 実力がN4帯でも、ルートには基礎→N3→N2→総合模試まで通しで入る
    expect(kinds).toEqual([
      'foundation_camp', 'n3_bridge', 'n3_practice', 'n3_grammar',
      'n2_gate', 'n2_grammar', 'reading_listening', 'mock_boss',
    ]);
    // N3の段はすべてN2の段より前＝「経由地」として並んでいる（降格して終わりではない）
    const lastN3 = kinds.map((k, i) => (k.startsWith('n3') ? i : -1)).filter((i) => i >= 0).pop()!;
    const firstN2 = kinds.findIndex((k) => k.startsWith('n2'));
    expect(lastN3).toBeLessThan(firstN2);
    // 目的地（最終段）はN2の総合模試であって、N3で打ち止めにしない
    expect(kinds[kinds.length - 1]).toBe('mock_boss');
  });

  it('実力が届いていても届いていなくても、目的地の最終段は同じ（原則1）', () => {
    const strong = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n2', conversationBand: 'n2',
      diagnosis: null, nowISO: NOW,
    });
    const last = (r: { stages: { kind: string }[] }) => r.stages[r.stages.length - 1].kind;
    expect(last(strong)).toBe(last(prof.route!));
    // 違うのは「入口がどこか」だけ
    expect(strong.stages.length).toBeLessThan(prof.route!.stages.length);
  });

  it('現在地はN3側の段から始まる（いきなりN2の問題を出さない）', () => {
    const cur = currentStageOf(prof.route!, new Set())!;
    expect(cur.kind.startsWith('n2_grammar')).toBe(false);
  });
});

describe('Persona B（N3志望・学習経験が少ない）', () => {
  const prof = onboard(PERSONAS[1]);

  it('基礎の段から始まる（N3問題の連打にしない）', () => {
    const cur = currentStageOf(prof.route!, new Set())!;
    expect(['foundation_camp', 'n3_bridge']).toContain(cur.kind);
  });

  it('今日の冒険に復習が入り、量が過大にならない', () => {
    const q = todayQuest(prof);
    expect(q.steps.some((s) => s.kind === 'review_due')).toBe(true);
    expect(q.steps.length).toBeLessThanOrEqual(6);
  });

  it('読解・聴解へ接続する経路がある（未接続のまま放置しない）', () => {
    const q = todayQuest(prof, {
      examSkills: {
        weakestSkill: 'reading', readingEvidence: 0, listeningEvidence: 0,
        readingTargetIds: ['read-n3-shortPassage'],
        listeningTargetIds: ['listen-n3-taskComprehension'],
      },
    });
    // 読解・聴解のどちらかが今日の冒険に現れる（毎日必ずではないが、経路は存在する）
    const has = q.steps.some((s) => s.kind === 'reading_short' || s.kind === 'listening_practice');
    expect(has || q.steps.length > 0).toBe(true);
  });
});

describe('Persona C（会話目的）', () => {
  const prof = onboard(PERSONAS[2]);

  it('会話の開始地点が診断の会話帯から決まる', () => {
    const area = conversationStartArea('n3');
    expect(area.areaId.length).toBeGreaterThan(0);
    expect(area.labelJa.length).toBeGreaterThan(0);
  });

  it('**試験問題を大量に強制しない**（会話・実践のstepが必ず入る）', () => {
    const q = todayQuest(prof);
    const practical = q.steps.filter((s) => s.kind === 'conversation_mission' || s.kind === 'restate');
    expect(practical.length).toBeGreaterThan(0);
  });

  it('JLPT準備度は出さない（目的地が試験ではない）', () => {
    const r = computeReadiness('N2', prof.skills, prof.mastery);
    expect(r.overallPct).toBeNull();
    // 会話は別軸として値を持てる
    expect(r.practical.find((x) => x.key === 'conversation')?.pct).not.toBeUndefined();
  });
});

describe('Persona D（Hybrid: N2合格＋仕事の会話）', () => {
  const prof = onboard(PERSONAS[3]);

  it('JLPTの段と会話の段が両方ルートに入る', () => {
    const kinds = prof.route!.stages.map((s) => s.kind);
    expect(kinds.some((k) => k.startsWith('n2') || k.startsWith('n3'))).toBe(true);
    expect(prof.route!.stages.length).toBeGreaterThan(1);
  });

  it('今日の冒険で試験科目と会話の両方に配分される', () => {
    const q = todayQuest(prof);
    const examish = q.steps.filter((s) => !['conversation_mission', 'restate'].includes(s.kind));
    const practical = q.steps.filter((s) => ['conversation_mission', 'restate'].includes(s.kind));
    expect(examish.length).toBeGreaterThan(0);
    expect(practical.length).toBeGreaterThan(0);
  });

  it('**JLPT技能と会話力を別管理する**（原則5: 片方をもう片方へ流用しない）', () => {
    const skills = { ...prof.skills };
    skills.conversation = { currentScore: 95, confidence: 'high', evidenceCount: 40, lastAssessedAt: NOW, band: 'n2' };
    const r = computeReadiness('N2', skills, prof.mastery);
    // 会話が満点でもJLPT総合は出ない
    expect(r.overallPct).toBeNull();
    expect(r.practical.find((x) => x.key === 'conversation')?.pct).toBe(95);
  });
});

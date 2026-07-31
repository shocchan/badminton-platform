// §15（80%多日攻略）・§14（敵編成）・§13（今日の冒険）・§16（準備度）の受入テスト。
import { describe, it, expect } from 'vitest';
import type { AdvMasteryAttempt, AdvMasteryLedger, AdventureV2Profile } from './advTypes';
import { computeMastery, recordAttempt, seenQuestionKeys, isQualifyingAttempt, masteryProgressPct, MASTERY_RULES } from './advMastery';
import { buildEncounter, gradeEncounter } from './advBattle';
import type { AdvBattleQuestion } from './advVariants';
import { generateTodayQuest, type GenerateQuestInput } from './advQuest';
import { computeReadiness } from './advReadiness';
import { generateRoute } from './advRoute';
import { defaultAdvProfile, emptySkillProfile } from './advProfile';

const NOW = '2026-07-31T12:00:00.000Z';

const att = (dateKey: string, scorePct: number, over: Partial<AdvMasteryAttempt> = {}): AdvMasteryAttempt => ({
  dateKey, scorePct, unseenRatio: 0.5,
  questionKeys: ['rec:a', 'cloze:a:1', 'meaning:a', 'form:a', 'cloze:a:2'],
  tier: 'normal', timed: false, completedAt: `${dateKey}T10:00:00.000Z`, ...over,
});

describe('advMastery（§15）', () => {
  it('1回80%では攻略にならない', () => {
    const st = computeMastery([att('2026-07-31', 95)], NOW);
    expect(st.state).toBe('in_progress');
    expect(st.qualifyingDays).toHaveLength(1);
  });

  it('同じ日に何回やっても1日分', () => {
    const st = computeMastery([att('2026-07-31', 90), att('2026-07-31', 95), att('2026-07-31', 100)], NOW);
    expect(st.qualifyingDays).toHaveLength(1);
  });

  it('別日3回80%→遅延確認待ち→7日後80%でmastered', () => {
    const base = [att('2026-07-01', 85), att('2026-07-03', 90), att('2026-07-05', 88)];
    const pending = computeMastery(base, '2026-07-06T00:00:00.000Z');
    expect(pending.state).toBe('cleared_pending_delay');
    expect(pending.delayCheckOpensAt).toBe('2026-07-12T10:00:00.000Z');
    const done = computeMastery([...base, att('2026-07-13', 82)], '2026-07-14T00:00:00.000Z');
    expect(done.state).toBe('mastered');
    // 遅延確認前の高得点では mastered にならない
    const early = computeMastery([...base, att('2026-07-08', 100)], '2026-07-09T00:00:00.000Z');
    expect(early.state).toBe('cleared_pending_delay');
  });

  it('未出問題を含まない試行はqualifyingにならない（問題ID暗記の排除）', () => {
    expect(isQualifyingAttempt(att('2026-07-31', 100, { unseenRatio: 0 }), true)).toBe(false);
    expect(isQualifyingAttempt(att('2026-07-31', 100, { unseenRatio: 0.4 }), true)).toBe(true);
  });

  it('5問以上で問題タイプが1種類だけの試行はqualifyingにならない', () => {
    const single = att('2026-07-31', 100, { questionKeys: ['rec:a', 'rec:b', 'rec:c', 'rec:d', 'rec:e'] });
    expect(isQualifyingAttempt(single, true)).toBe(false);
    expect(isQualifyingAttempt(single, false)).toBe(true); // プールに1タイプしか無い場合は課さない
  });

  it('recordAttemptは履歴上限を守り、seenQuestionKeysが蓄積される', () => {
    let ledger: AdvMasteryLedger = {};
    for (let i = 0; i < 30; i++) ledger = recordAttempt(ledger, 'n2g-001', att(`2026-06-${String((i % 28) + 1).padStart(2, '0')}`, 70));
    expect(ledger['n2g-001']).toHaveLength(MASTERY_RULES.maxAttemptsKept);
    expect(seenQuestionKeys(ledger).has('cloze:a:1')).toBe(true);
  });

  it('攻略率は1回の高得点で跳ねない', () => {
    expect(masteryProgressPct([att('2026-07-31', 100)], NOW)).toBeLessThanOrEqual(35);
  });
});

const q = (key: string, type: AdvBattleQuestion['type'], answerIndex = 0): AdvBattleQuestion => ({
  key, type, level: 'n2', skill: 'grammar', promptJa: null, promptZh: `prompt ${key}`,
  choices: ['正', '誤1', '誤2', '誤3'], answerIndex, explanationZh: 'e', sourceId: key.split(':')[1] ?? 'x',
  status: 'validated_beta',
});

describe('advBattle（§14/§18）', () => {
  const pool = new Map<string, AdvBattleQuestion[]>([
    ['g1', [q('rec:g1', 'rec'), q('cloze:g1:1', 'cloze'), q('meaning:g1', 'meaning'), q('form:g1', 'form')]],
    ['g2', [q('rec:g2', 'rec'), q('cloze:g2:1', 'cloze'), q('meaning:g2', 'meaning')]],
    ['g3', [q('rec:g3', 'rec'), q('cloze:g3:1', 'cloze')]],
  ]);

  it('normalは1テーマ・未出優先・タイプが偏らない', () => {
    const enc = buildEncounter({ tier: 'normal', targetIds: ['g1', 'g2'], pool, seenKeys: new Set(['rec:g1']), recentWrongKeys: new Set(), seed: 1 });
    expect(enc.questions.every((x) => x.sourceId === 'g1')).toBe(true);
    const types = new Set(enc.questions.map((x) => x.type));
    expect(types.size).toBeGreaterThanOrEqual(2);
    expect(enc.timed).toBe(false);
  });

  it('strongは複数テーマ・未出中心', () => {
    const seen = new Set(['rec:g1', 'rec:g2', 'rec:g3']);
    const enc = buildEncounter({ tier: 'strong', targetIds: ['g1', 'g2', 'g3'], pool, seenKeys: seen, recentWrongKeys: new Set(), seed: 2 });
    expect(enc.unseenRatio).toBeGreaterThan(0.5);
    const sources = new Set(enc.questions.map((x) => x.sourceId));
    expect(sources.size).toBeGreaterThan(1);
  });

  it('midboss/rankbossは制限時間つき', () => {
    const enc = buildEncounter({ tier: 'midboss', targetIds: ['g1', 'g2', 'g3'], pool, seenKeys: new Set(), recentWrongKeys: new Set(), seed: 3 });
    expect(enc.timed).toBe(true);
    expect(enc.timeLimitSec).toBeGreaterThan(0);
  });

  it('プール不足なら実在分だけ出す（存在するふりをしない）', () => {
    const enc = buildEncounter({ tier: 'rankboss', targetIds: ['g3'], pool, seenKeys: new Set(), recentWrongKeys: new Set(), seed: 4 });
    expect(enc.questions).toHaveLength(2);
  });

  it('採点: 未回答は誤答・attemptに未出比率と問題キーが載る', () => {
    const enc = buildEncounter({ tier: 'normal', targetIds: ['g1'], pool, seenKeys: new Set(), recentWrongKeys: new Set(), seed: 5 });
    const answers = enc.questions.map((x, i) => ({ key: x.key, choiceIndex: i === 0 ? x.answerIndex : null }));
    const r = gradeEncounter(enc, answers, '2026-07-31', NOW, null);
    expect(r.scorePct).toBe(Math.round((1 / enc.questions.length) * 100));
    expect(r.attempt.questionKeys).toHaveLength(enc.questions.length);
    expect(r.attempt.unseenRatio).toBe(1);
  });
});

describe('advQuest（§13）', () => {
  const mkInput = (over: Partial<GenerateQuestInput> = {}): GenerateQuestInput => {
    const profile: AdventureV2Profile = {
      ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N2', dailyMinutes: 15,
    };
    const route = generateRoute({ goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n4', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    return {
      profile, route, dueReviewCount: 2, weakGrammarIds: ['n3g-aaa'], dateKey: '2026-07-31', nowISO: NOW,
      availability: {
        nextGrammarIds: ['n3g-bbb', 'n3g-ccc'], nextUnitIds: ['n3u-01-self'],
        conversationTargets: [{ refId: 'ctx-1', expression: '〜てもらえますか', themeJa: '仕事のお願い', themeZh: '工作请求' }],
      },
      daysToExam: 124, ...over,
    };
  };

  it('復習が先頭・why/成功条件/次の一歩がja/zhで必ずある', () => {
    const quest = generateTodayQuest(mkInput());
    expect(quest.steps[0].kind).toBe('review_due');
    expect(quest.whyJa.length).toBeGreaterThan(0);
    expect(quest.whyZh.length).toBeGreaterThan(0);
    expect(quest.successConditionJa).toBeTruthy();
    expect(quest.successConditionZh).toBeTruthy();
    expect(quest.nextStepJa).toBeTruthy();
    expect(quest.estimatedMinutes).toBeGreaterThan(0);
    expect(quest.whyJa).toContain('試験まで124日');
  });

  it('5分は軽量構成・30分は読解を含む（試験45日前）', () => {
    const q5 = generateTodayQuest(mkInput({ profile: { ...mkInput().profile, dailyMinutes: 5 } }));
    expect(q5.estimatedMinutes).toBeLessThanOrEqual(8);
    const q30 = generateTodayQuest(mkInput({ profile: { ...mkInput().profile, dailyMinutes: 30 }, daysToExam: 40 }));
    expect(q30.steps.some((s) => s.kind === 'reading_short')).toBe(true);
    expect(q30.estimatedMinutes).toBeGreaterThan(q5.estimatedMinutes);
  });

  it('前日と同じ主対象を避ける（代替があるとき）', () => {
    const base = mkInput();
    const withLast = {
      ...base,
      profile: { ...base.profile, lastQuest: { dateKey: '2026-07-30', primaryTargets: ['n3g-bbb'], stepKinds: [] } },
    };
    const quest = generateTodayQuest(withLast);
    const learn = quest.steps.find((s) => s.kind === 'grammar_new');
    expect(learn?.refIds).toEqual(['n3g-ccc']);
  });

  it('会話goalの5分構成は会話ミッションを含み、試験バトルを積まない', () => {
    const base = mkInput();
    const convRoute = generateRoute({ goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW });
    const quest = generateTodayQuest({
      ...base, route: convRoute, dueReviewCount: 0,
      profile: { ...base.profile, goalType: 'conversation', targetJlpt: null, dailyMinutes: 5 },
      weakGrammarIds: [], daysToExam: null,
    });
    expect(quest.steps.some((s) => s.kind === 'conversation_mission')).toBe(true);
    expect(quest.steps.some((s) => s.kind === 'battle')).toBe(false);
  });
});

describe('advReadiness（§16）', () => {
  it('データ無し→総合も各行も未判定（0%と混同しない）', () => {
    const r = computeReadiness('N2', emptySkillProfile(), {});
    expect(r.overallPct).toBeNull();
    expect(r.rows.every((row) => row.pct === null)).toBe(true);
    expect(r.summaryJa).toContain('判定できません');
  });

  it('聴解は常に未判定・時間配分はtimed試行が無ければ未判定（D-009/D-012）', () => {
    const skills = emptySkillProfile();
    skills.grammar = { currentScore: 80, confidence: 'medium', evidenceCount: 20, lastAssessedAt: NOW, band: 'n3' };
    const ledger: AdvMasteryLedger = { 'n2g-001': [att('2026-07-30', 85)] };
    const r = computeReadiness('N2', skills, ledger);
    const listening = r.rows.find((x) => x.key === 'listening');
    const timing = r.rows.find((x) => x.key === 'timing');
    expect(listening?.pct).toBeNull();
    expect(timing?.pct).toBeNull();
    expect(r.summaryJa).toContain('合格を保証するものではありません');
  });

  it('timed試行があると時間配分が実測される', () => {
    const skills = emptySkillProfile();
    skills.grammar = { currentScore: 80, confidence: 'medium', evidenceCount: 20, lastAssessedAt: NOW, band: 'n3' };
    const ledger: AdvMasteryLedger = {
      'stg-n2boss': [att('2026-07-28', 70, { timed: true, tier: 'rankboss' }), att('2026-07-30', 74, { timed: true, tier: 'rankboss' })],
    };
    const r = computeReadiness('N2', skills, ledger);
    const timing = r.rows.find((x) => x.key === 'timing');
    expect(timing?.pct).toBe(72);
    expect(timing?.provisional).toBe(true); // 3回未満は暫定
    expect(r.overallPct).not.toBeNull();
  });
});

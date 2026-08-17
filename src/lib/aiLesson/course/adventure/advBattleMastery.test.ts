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

const q = (key: string, type: AdvBattleQuestion['type']): AdvBattleQuestion => ({
  key, type, level: 'n2', skill: 'grammar', examSection: 'languageKnowledge',
  targetJapanese: null, questionJa: null, questionZh: `prompt ${key}`,
  choices: [
    { choiceId: 'choice-a', textJa: '正', isCorrect: true },
    { choiceId: 'choice-b', textJa: '誤1', isCorrect: false },
    { choiceId: 'choice-c', textJa: '誤2', isCorrect: false },
    { choiceId: 'choice-d', textJa: '誤3', isCorrect: false },
  ],
  explanation: {
    meaningJa: 'm', meaningZh: 'm', whyCorrectJa: 'w', whyCorrectZh: 'w',
    exampleJa: null, exampleZh: null, sourceItemId: key.split(':')[1] ?? 'x', sourceLabel: 'p',
  },
  sourceItemId: key.split(':')[1] ?? 'x', difficulty: 2, timed: false,
  variantId: key, reviewState: 'validated_beta', status: 'validated_beta',
});

describe('advBattle（§14/§18）', () => {
  const pool = new Map<string, AdvBattleQuestion[]>([
    ['g1', [q('rec:g1', 'rec'), q('cloze:g1:1', 'cloze'), q('meaning:g1', 'meaning'), q('form:g1', 'form')]],
    ['g2', [q('rec:g2', 'rec'), q('cloze:g2:1', 'cloze'), q('meaning:g2', 'meaning')]],
    ['g3', [q('rec:g3', 'rec'), q('cloze:g3:1', 'cloze')]],
  ]);

  it('normalは1テーマ・未出優先・タイプが偏らない', () => {
    const enc = buildEncounter({ tier: 'normal', targetIds: ['g1', 'g2'], pool, seenKeys: new Set(['rec:g1']), recentWrongKeys: new Set(), seed: 1 });
    expect(enc.questions.every((x) => x.sourceItemId === 'g1')).toBe(true);
    const types = new Set(enc.questions.map((x) => x.type));
    expect(types.size).toBeGreaterThanOrEqual(2);
    expect(enc.timed).toBe(false);
  });

  it('strongは複数テーマ・未出中心', () => {
    const seen = new Set(['rec:g1', 'rec:g2', 'rec:g3']);
    const enc = buildEncounter({ tier: 'strong', targetIds: ['g1', 'g2', 'g3'], pool, seenKeys: seen, recentWrongKeys: new Set(), seed: 2 });
    expect(enc.unseenRatio).toBeGreaterThan(0.5);
    const sources = new Set(enc.questions.map((x) => x.sourceItemId));
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
    const answers = enc.questions.map((x, i) => ({
      key: x.key,
      choiceId: i === 0 ? (enc.presented.find((p) => p.key === x.key)?.correctChoiceId ?? null) : null,
    }));
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
      profile, route, reviewQuestionCount: 2, weakGrammarIds: ['n3g-aaa'], dateKey: '2026-07-31', nowISO: NOW,
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

  it('5分は軽量構成・30分は試験技能（読解/聴解）を含む', () => {
    const q5 = generateTodayQuest(mkInput({ profile: { ...mkInput().profile, dailyMinutes: 5 } }));
    // 奇数日はバトル（約6分）が入るため最大9分（バトル永久排除の循環を防ぐ設計・P0-1）
    expect(q5.estimatedMinutes).toBeLessThanOrEqual(9);
    // 基礎固め中（基礎キャンプ・N3橋）は試験技能を出さない設計（P0-1）になったため、
    // 30分構成の検証は橋を越えたルート（knowledgeBand n3）で行う
    const routeAfterBridge = generateRoute({ goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n3', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    const q30 = generateTodayQuest(mkInput({
      profile: { ...mkInput().profile, dailyMinutes: 30 }, daysToExam: 40, route: routeAfterBridge,
      examSkills: {
        weakestSkill: null, readingEvidence: 0, listeningEvidence: 0,
        readingTargetIds: ['read-n2-shortPassage'], listeningTargetIds: ['listen-n2-taskComprehension'],
      },
    }));
    expect(q30.steps.some((s) => s.kind === 'reading_short' || s.kind === 'listening_practice')).toBe(true);
    expect(q30.estimatedMinutes).toBeGreaterThan(q5.estimatedMinutes);
  });

  it('**出題できる読解・聴解が無ければstepを作らない**（存在するふりをしない）', () => {
    const q = generateTodayQuest(mkInput({
      profile: { ...mkInput().profile, dailyMinutes: 30 }, daysToExam: 10,
      examSkills: {
        weakestSkill: 'reading', readingEvidence: 0, listeningEvidence: 0,
        readingTargetIds: [], listeningTargetIds: [],
      },
    }));
    expect(q.steps.some((s) => s.kind === 'reading_short')).toBe(false);
    expect(q.steps.some((s) => s.kind === 'listening_practice')).toBe(false);
  });

  it('会話目的では試験技能stepを積まない', () => {
    const base = mkInput();
    const convRoute = generateRoute({ goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW });
    const q = generateTodayQuest({
      ...base, route: convRoute,
      profile: { ...base.profile, goalType: 'conversation', targetJlpt: null, dailyMinutes: 30 },
      examSkills: {
        weakestSkill: 'reading', readingEvidence: 0, listeningEvidence: 0,
        readingTargetIds: ['read-n2-shortPassage'], listeningTargetIds: ['listen-n2-taskComprehension'],
      },
    });
    expect(q.steps.some((s) => s.kind === 'reading_short' || s.kind === 'listening_practice')).toBe(false);
  });

  it('束が無い文法は攻略まで同じ対象を連日固める（2026-08-15 進度改善: 前日回避スワップを廃止）', () => {
    // 旧仕様は前日と同じ対象を避けて交互に出したが、qualifying「別日3回」が2対象に
    // 半分ずつ散って攻略が遅くなる。新仕様は同じ対象を最短3日で固め、7日待ちに
    // 入ったら stageContent が次の対象へ進める（advQuestParallel.test.ts で検証）
    const base = mkInput();
    const withLast = {
      ...base,
      profile: { ...base.profile, lastQuest: { dateKey: '2026-07-30', primaryTargets: ['n3g-bbb'], stepKinds: [] } },
    };
    const quest = generateTodayQuest(withLast);
    const learn = quest.steps.find((s) => s.kind === 'grammar_new');
    expect(learn?.refIds).toEqual(['n3g-bbb']);
  });

  it('会話goalの5分構成は会話ミッションを含み、試験バトルを積まない', () => {
    const base = mkInput();
    const convRoute = generateRoute({ goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW });
    const quest = generateTodayQuest({
      ...base, route: convRoute, reviewQuestionCount: 0,
      profile: { ...base.profile, goalType: 'conversation', targetJlpt: null, dailyMinutes: 5 },
      weakGrammarIds: [], daysToExam: null,
    });
    expect(quest.steps.some((s) => s.kind === 'conversation_mission')).toBe(true);
    expect(quest.steps.some((s) => s.kind === 'battle')).toBe(false);
  });
});

describe('advReadiness（ASSESSMENT INTEGRITY §9）', () => {
  const gAtt = (dateKey: string, correct: number, total: number, over: Partial<AdvMasteryAttempt> = {}): AdvMasteryAttempt => ({
    ...att(dateKey, Math.round((correct / total) * 100), over),
    bySkill: { grammar: { correct, total, unseen: Math.round(total / 2) } },
    skills: ['grammar'],
    ...over,
  });

  it('データ無し→総合も各行も未判定（0%と混同しない）', () => {
    const r = computeReadiness('N2', emptySkillProfile(), {});
    expect(r.overallPct).toBeNull();
    expect(r.rows.every((row) => row.pct === null)).toBe(true);
    expect(r.summaryJa).toContain('判定できません');
  });

  it('本試験の構成（N2 105分＋50分 / N3 30+70+40分）を持つ', () => {
    expect(computeReadiness('N2', emptySkillProfile(), {}).examParts.map((p) => p.minutes)).toEqual([105, 50]);
    expect(computeReadiness('N3', emptySkillProfile(), {}).examParts.map((p) => p.minutes)).toEqual([30, 70, 40]);
  });

  it('**文法だけの結果から総合準備度を出さない**（§9の中核）', () => {
    const ledger: AdvMasteryLedger = {
      'n2g-001': [gAtt('2026-07-20', 24, 30), gAtt('2026-07-25', 26, 30), gAtt('2026-07-30', 25, 30)],
    };
    const r = computeReadiness('N2', emptySkillProfile(), ledger);
    const grammar = r.rows.find((x) => x.key === 'grammar');
    expect(grammar?.pct).not.toBeNull();          // 文法は実測される
    expect(r.overallPct).toBeNull();               // が、総合は出ない
    expect(r.overallBlockersJa.some((b) => b.includes('読解'))).toBe(true);
    expect(r.overallBlockersJa.some((b) => b.includes('聴解'))).toBe(true);
    expect(r.summaryJa).toContain('合格を保証するものではありません');
  });

  it('skill別にevidence（出題・未出・遅延・時間つき）を保持する', () => {
    const ledger: AdvMasteryLedger = {
      'n2g-002': [gAtt('2026-07-01', 8, 10), gAtt('2026-07-20', 9, 10, { timed: true, tier: 'rankboss' })],
    };
    const r = computeReadiness('N2', emptySkillProfile(), ledger);
    const g = r.rows.find((x) => x.key === 'grammar')!;
    expect(g.evidence.evidenceCount).toBe(20);
    expect(g.evidence.unseenQuestionCount).toBe(10);
    expect(g.evidence.delayedEvidenceCount).toBe(10);   // 19日後＝遅延
    expect(g.evidence.timedEvidenceCount).toBe(10);
    expect(g.evidence.lastAssessedAt).not.toBeNull();
  });

  it('聴解・読解は測っていないので常に未判定（0%にしない）', () => {
    const ledger: AdvMasteryLedger = { 'n2g-003': [gAtt('2026-07-30', 20, 25)] };
    const r = computeReadiness('N2', emptySkillProfile(), ledger);
    expect(r.rows.find((x) => x.key === 'listening')?.pct).toBeNull();
    expect(r.rows.find((x) => x.key === 'reading')?.pct).toBeNull();
    expect(r.rows.find((x) => x.key === 'listening')?.noteJa).toContain('未判定');
  });

  it('時間配分はtimed実績からのみ算出する', () => {
    const noTimed: AdvMasteryLedger = { 'n2g-004': [gAtt('2026-07-30', 8, 10)] };
    expect(computeReadiness('N2', emptySkillProfile(), noTimed).rows.find((x) => x.key === 'timeManagement')?.pct).toBeNull();
    const timed: AdvMasteryLedger = {
      'stg-n2boss': [gAtt('2026-07-28', 14, 20, { timed: true, tier: 'rankboss' })],
    };
    const row = computeReadiness('N2', emptySkillProfile(), timed).rows.find((x) => x.key === 'timeManagement');
    expect(row?.pct).toBe(70);
  });

  it('AI会話の成績はJLPT準備度に加算せず、別軸で表示する（§5）', () => {
    const skills = emptySkillProfile();
    skills.conversation = { currentScore: 90, confidence: 'medium', evidenceCount: 12, lastAssessedAt: NOW, band: 'n3' };
    const ledger: AdvMasteryLedger = { 'n2g-005': [gAtt('2026-07-30', 10, 20)] };
    const r = computeReadiness('N2', skills, ledger);
    // 会話90%があっても文法の実測値は引き上がらない
    expect(r.rows.find((x) => x.key === 'grammar')?.pct).toBeLessThan(60);
    expect(r.overallPct).toBeNull();
    const conv = r.practical.find((p) => p.key === 'conversation');
    expect(conv?.pct).toBe(90);
    expect(conv?.noteJa).toContain('JLPTの点数には足しません');
  });

  it('bySkillの無い旧attemptは推測せず集計に入れない（後方互換）', () => {
    const legacy: AdvMasteryLedger = { 'n2g-006': [att('2026-07-30', 100)] };
    const r = computeReadiness('N2', emptySkillProfile(), legacy);
    expect(r.rows.every((row) => row.pct === null)).toBe(true);
  });
});

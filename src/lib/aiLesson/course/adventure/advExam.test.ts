// 時間配分・中ボス・総合ミニ模試の受入テスト（COMPLETION §8・§9・§10・§11）。
import { describe, it, expect } from 'vitest';
import {
  buildMockSpec, buildMidboss, midbossUnlocked, evaluateTiming, examStructureOf,
  EXAM_MINUTES, MOCK_REQUIREMENT, MIDBOSS_REQUIREMENT,
} from './advMock';
import { computeReadiness } from './advReadiness';
import { emptySkillProfile } from './advProfile';
import type { AdvMasteryAttempt, AdvMasteryLedger } from './advTypes';

const NOW = '2026-08-01T00:00:00.000Z';
const att = (dateKey: string, bySkill: Record<string, { correct: number; total: number; unseen: number }>,
  over: Partial<AdvMasteryAttempt> = {}): AdvMasteryAttempt => ({
  dateKey, scorePct: 80, unseenRatio: 0.5, questionKeys: ['k1'], tier: 'normal', timed: false,
  completedAt: `${dateKey}T10:00:00.000Z`, bySkill, skills: Object.keys(bySkill), ...over,
});

describe('試験時間モデル（§8）', () => {
  it('N2は105分＋50分、N3は30＋70＋40分', () => {
    expect(EXAM_MINUTES.N2.map((p) => p.minutes)).toEqual([105, 50]);
    expect(EXAM_MINUTES.N3.map((p) => p.minutes)).toEqual([30, 70, 40]);
    expect(examStructureOf('N2').map((p) => p.minutes)).toEqual([105, 50]);
  });

  it('時間配分: 記録が無ければ未判定', () => {
    const t = evaluateTiming([]);
    expect(t.score).toBeNull();
    expect(t.noteJa).toContain('未判定');
  });

  it('**速いだけでは高評価にしない**（正答率が低ければ score も低い）', () => {
    const fastButWrong = evaluateTiming([
      { secondsPerQuestion: 8, finishedInTime: true, unansweredCount: 0, accuracy: 0.2, section: 'reading' },
      { secondsPerQuestion: 7, finishedInTime: true, unansweredCount: 0, accuracy: 0.25, section: 'reading' },
      { secondsPerQuestion: 9, finishedInTime: true, unansweredCount: 0, accuracy: 0.2, section: 'reading' },
    ]);
    const slowerButRight = evaluateTiming([
      { secondsPerQuestion: 40, finishedInTime: true, unansweredCount: 0, accuracy: 0.9, section: 'reading' },
      { secondsPerQuestion: 42, finishedInTime: true, unansweredCount: 0, accuracy: 0.85, section: 'reading' },
      { secondsPerQuestion: 38, finishedInTime: true, unansweredCount: 0, accuracy: 0.9, section: 'reading' },
    ]);
    expect(slowerButRight.score!).toBeGreaterThan(fastButWrong.score!);
  });

  it('時間内に終わらない・未回答が多いと score が下がる', () => {
    const unfinished = evaluateTiming([
      { secondsPerQuestion: 60, finishedInTime: false, unansweredCount: 5, accuracy: 0.8, section: 'reading' },
      { secondsPerQuestion: 65, finishedInTime: false, unansweredCount: 4, accuracy: 0.8, section: 'reading' },
    ]);
    const finished = evaluateTiming([
      { secondsPerQuestion: 45, finishedInTime: true, unansweredCount: 0, accuracy: 0.8, section: 'reading' },
      { secondsPerQuestion: 44, finishedInTime: true, unansweredCount: 0, accuracy: 0.8, section: 'reading' },
    ]);
    expect(finished.score!).toBeGreaterThan(unfinished.score!);
    expect(unfinished.unfinishedRate).toBe(1);
  });

  it('記録が3回未満なら暫定と明示する', () => {
    const t = evaluateTiming([{ secondsPerQuestion: 30, finishedInTime: true, unansweredCount: 0, accuracy: 0.8, section: 'reading' }]);
    expect(t.noteJa).toContain('暫定');
  });
});

describe('中ボス（§9）', () => {
  it('問題数・定着・未出成績が足りなければ開かない', () => {
    expect(midbossUnlocked({ unitMastery: 0.9, unseenAccuracy: 0.9, delayedMasteredCount: 2, availableQuestions: 5 }).ok).toBe(false);
    expect(midbossUnlocked({ unitMastery: 0.2, unseenAccuracy: 0.9, delayedMasteredCount: 2, availableQuestions: 30 }).ok).toBe(false);
    expect(midbossUnlocked({ unitMastery: 0.9, unseenAccuracy: null, delayedMasteredCount: 2, availableQuestions: 30 }).ok).toBe(false);
    expect(midbossUnlocked({ unitMastery: 0.9, unseenAccuracy: 0.3, delayedMasteredCount: 2, availableQuestions: 30 }).ok).toBe(false);
  });

  it('条件を満たすと挑戦できる', () => {
    const r = midbossUnlocked({ unitMastery: 0.7, unseenAccuracy: 0.7, delayedMasteredCount: 1, availableQuestions: 30 });
    expect(r.ok).toBe(true);
  });

  it('中ボスは15〜20問・制限時間つき・複数テーマ', () => {
    const b = buildMidboss('N3', 'grammar', 40);
    expect(b.questionCount).toBeGreaterThanOrEqual(MIDBOSS_REQUIREMENT.minQuestions);
    expect(b.questionCount).toBeLessThanOrEqual(20);
    expect(b.timeLimitSec).toBeGreaterThan(0);
    const lk = buildMidboss('N2', 'languageKnowledge', 18);
    expect(lk.skills.length).toBeGreaterThan(1);
  });
});

describe('総合ミニ模試（§10）', () => {
  it('**4技能が揃わなければ「総合」と名乗らない**', () => {
    const noListening = buildMockSpec('N2', { vocabCount: 20, grammarCount: 20, readingCount: 10, listeningCount: 0 });
    expect(noListening.ready).toBe(false);
    expect(noListening.titleJa).not.toContain('総合');
    expect(noListening.blockersJa.some((b) => b.includes('聴解'))).toBe(true);
  });

  it('何も揃わなければ「準備中」', () => {
    const none = buildMockSpec('N3', { vocabCount: 0, grammarCount: 0, readingCount: 0, listeningCount: 0 });
    expect(none.titleJa).toContain('準備中');
    expect(none.sections).toHaveLength(0);
  });

  it('文法・語彙だけなら「文法・語彙ミニ模試」', () => {
    const only = buildMockSpec('N3', { vocabCount: 20, grammarCount: 20, readingCount: 0, listeningCount: 0 });
    expect(only.titleJa).toContain('文法・語彙');
    expect(only.sections).toHaveLength(1);
  });

  it('4技能が揃えば総合ミニ模試になり、section遷移を持つ', () => {
    const full = buildMockSpec('N2', { vocabCount: 20, grammarCount: 20, readingCount: 10, listeningCount: 10 });
    expect(full.ready).toBe(true);
    expect(full.titleJa).toBe('N2総合ミニ模試');
    expect(full.sections.map((s) => s.sectionId)).toEqual(['languageKnowledge', 'reading', 'listening']);
    for (const s of full.sections) {
      expect(s.questionCount).toBeGreaterThan(0);
      expect(s.timeLimitSec).toBeGreaterThan(0);
    }
  });

  it('**「本番同等」と表示しない**（ミニ版であることを明示）', () => {
    const full = buildMockSpec('N2', { vocabCount: 20, grammarCount: 20, readingCount: 10, listeningCount: 10 });
    expect(full.disclaimerJa).toContain('本番の試験と同じ問題数・時間ではありません');
    expect(full.disclaimerZh).toContain('与真实考试不同');
    expect(full.titleJa).toContain('ミニ');
  });

  it('必要問題数の定義が存在する', () => {
    expect(MOCK_REQUIREMENT.reading).toBeGreaterThan(0);
    expect(MOCK_REQUIREMENT.listening).toBeGreaterThan(0);
  });
});

describe('総合準備度のgating（§11）', () => {
  it('文法だけ十分でも総合は未判定（読解・聴解・時間配分が不足）', () => {
    const ledger: AdvMasteryLedger = {
      'n2g-001': Array.from({ length: 3 }, (_, i) =>
        att(`2026-07-2${i}`, { grammar: { correct: 9, total: 10, unseen: 5 } })),
    };
    const r = computeReadiness('N2', emptySkillProfile(), ledger);
    expect(r.rows.find((x) => x.key === 'grammar')?.pct).not.toBeNull();
    expect(r.overallPct).toBeNull();
    expect(r.overallBlockersJa.some((b) => b.includes('読解'))).toBe(true);
    expect(r.overallBlockersJa.some((b) => b.includes('聴解'))).toBe(true);
  });

  it('**timed記録が無ければ総合は出せない**（COMPLETION §11）', () => {
    const ledger: AdvMasteryLedger = {};
    for (const [id, skill] of [['a', 'charactersVocabulary'], ['b', 'grammar'], ['c', 'reading'], ['d', 'listening']] as const) {
      ledger[id] = Array.from({ length: 3 }, (_, i) =>
        att(`2026-07-1${i}`, { [skill]: { correct: 9, total: 10, unseen: 5 } }));
    }
    const noTimed = computeReadiness('N2', emptySkillProfile(), ledger);
    expect(noTimed.overallPct).toBeNull();
    expect(noTimed.overallBlockersJa.some((b) => b.includes('制限時間'))).toBe(true);
  });

  it('**4技能＋timedだけでは総合を出さない**（遅延・模試3回が必要・COMPLETION §10）', () => {
    const ledger: AdvMasteryLedger = {};
    for (const [id, skill] of [['a', 'charactersVocabulary'], ['b', 'grammar'], ['c', 'reading'], ['d', 'listening']] as const) {
      ledger[id] = Array.from({ length: 3 }, (_, i) =>
        att(`2026-07-1${i}`, { [skill]: { correct: 9, total: 10, unseen: 5 } }));
    }
    ledger.mock = [att('2026-07-20', { grammar: { correct: 8, total: 10, unseen: 5 } }, { timed: true, tier: 'rankboss' })];
    const r = computeReadiness('N2', emptySkillProfile(), ledger);
    expect(r.rows.find((x) => x.key === 'timeManagement')?.pct).not.toBeNull();
    expect(r.overallGate.timedEvidence).toBe(true);
    expect(r.overallGate.delayedEvidence).toBe(false);
    expect(r.overallGate.mockCount).toBe(false);
    expect(r.overallPct).toBeNull();
  });

  it('4技能＋timed＋7日後の測り直し＋模試3回で総合が出る（ただし合格保証はしない）', () => {
    const ledger: AdvMasteryLedger = {};
    for (const [id, skill] of [['a', 'charactersVocabulary'], ['b', 'grammar'], ['c', 'reading'], ['d', 'listening']] as const) {
      ledger[id] = [
        att('2026-07-01', { [skill]: { correct: 9, total: 10, unseen: 5 } }, { timed: true }),
        att('2026-07-02', { [skill]: { correct: 9, total: 10, unseen: 5 } }, { timed: true }),
        // 初回から7日以降＝遅延evidence
        att('2026-07-15', { [skill]: { correct: 9, total: 10, unseen: 5 } }, { timed: true }),
      ];
    }
    const mocks = Array.from({ length: 3 }, () => ({ completedAt: '2026-07-20T00:00:00.000Z' }));
    const r = computeReadiness('N2', emptySkillProfile(), ledger, mocks);
    expect(r.overallBlockersJa).toEqual([]);
    expect(r.overallPct).not.toBeNull();
    expect(r.summaryJa).toContain('合格を保証するものではありません');
    expect(r.mockCount).toBe(3);
  });

  it('会話・実践は別軸のまま（JLPT加算しない）', () => {
    const skills = emptySkillProfile();
    skills.conversation = { currentScore: 95, confidence: 'high', evidenceCount: 30, lastAssessedAt: NOW, band: 'n2' };
    const r = computeReadiness('N2', skills, {});
    expect(r.overallPct).toBeNull();
    expect(r.practical.find((p) => p.key === 'conversation')?.pct).toBe(95);
  });
});

// FINAL COMPLETION §17: 「1つでも欠ければ未判定」を条件ごとに個別固定する。
// 総合準備度は学習者の進路判断に直結するため、抜けた条件が何であっても出してはいけない。
describe('総合準備度のgating — 欠けている条件ごとの個別確認（§17）', () => {
  /** 4技能をすべて満たした台帳を作り、指定の技能だけ落とす */
  const fullLedger = (drop?: 'reading' | 'listening' | 'charactersVocabulary' | 'grammar',
    opts: { unseen?: number } = {}): AdvMasteryLedger => {
    const ledger: AdvMasteryLedger = {};
    const unseen = opts.unseen ?? 5;
    for (const [id, skill] of [
      ['a', 'charactersVocabulary'], ['b', 'grammar'], ['c', 'reading'], ['d', 'listening'],
    ] as const) {
      if (skill === drop) continue;
      ledger[id] = [
        att('2026-07-01', { [skill]: { correct: 9, total: 10, unseen } }, { timed: true }),
        att('2026-07-02', { [skill]: { correct: 9, total: 10, unseen } }, { timed: true }),
        att('2026-07-15', { [skill]: { correct: 9, total: 10, unseen } }, { timed: true }),
      ];
    }
    return ledger;
  };
  const mocks = (n: number) => Array.from({ length: n }, () => ({ completedAt: '2026-07-20T00:00:00.000Z' }));

  it('聴解の記録が無ければ、模試を5回やっても未判定', () => {
    const r = computeReadiness('N2', emptySkillProfile(), fullLedger('listening'), mocks(5));
    expect(r.overallGate.listeningEvidence).toBe(false);
    expect(r.overallPct).toBeNull();
    expect(r.overallBlockersJa.some((b) => b.includes('聴解'))).toBe(true);
  });

  it('読解の記録が無ければ未判定', () => {
    const r = computeReadiness('N2', emptySkillProfile(), fullLedger('reading'), mocks(5));
    expect(r.overallGate.readingEvidence).toBe(false);
    expect(r.overallPct).toBeNull();
    expect(r.overallBlockersJa.some((b) => b.includes('読解'))).toBe(true);
  });

  it('文字・語彙の記録が無ければ未判定（言語知識は2科目そろって初めて満たす）', () => {
    const r = computeReadiness('N2', emptySkillProfile(), fullLedger('charactersVocabulary'), mocks(5));
    expect(r.overallGate.languageKnowledgeEvidence).toBe(false);
    expect(r.overallPct).toBeNull();
  });

  it('未出問題の記録が無ければ未判定（覚えた問題の再演では測れない）', () => {
    const r = computeReadiness('N2', emptySkillProfile(), fullLedger(undefined, { unseen: 0 }), mocks(5));
    expect(r.overallGate.unseenEvidence).toBe(false);
    expect(r.overallPct).toBeNull();
  });

  it('模試が2回では未判定（3回目で初めて条件を満たす）', () => {
    const ledger = fullLedger();
    expect(computeReadiness('N2', emptySkillProfile(), ledger, mocks(2)).overallPct).toBeNull();
    expect(computeReadiness('N2', emptySkillProfile(), ledger, mocks(2)).overallGate.mockCount).toBe(false);
    expect(computeReadiness('N2', emptySkillProfile(), ledger, mocks(3)).overallPct).not.toBeNull();
  });

  it('N3でも同じgateが働く（レベルで甘くしない）', () => {
    expect(computeReadiness('N3', emptySkillProfile(), fullLedger('listening'), mocks(5)).overallPct).toBeNull();
    expect(computeReadiness('N3', emptySkillProfile(), fullLedger(), mocks(3)).overallPct).not.toBeNull();
  });
});

// ミニ模試 runtime の必須検査（COMPLETION §9・§10）。
//
// FAIL条件（落ちたらPilotへ出さない）:
// - reload復帰で問題・提示順・残り時間が変わる
// - 採点が表示位置に依存する
// - 「本番同等」と表示する
// - 模試3回未満で総合準備度が出る
import { describe, it, expect } from 'vitest';
import {
  startMockSession, restoreMockSession, gradeMock, gradeSection,
  unansweredIndexes, sectionTimeLimit, MOCK_MODE_LABEL, toMockAttempt, toMockLogEntry,
  type MockSessionState,
} from './advMockSession';
import { buildMockSpec } from './advMock';
import type { AdvBattleQuestion } from './advVariants';
import { computeReadiness } from './advReadiness';
import { OVERALL_READINESS_REQUIREMENT } from './advExamSkills';
import { emptySkillProfile } from './advProfile';
import type { AdvMasteryLedger, AdvMockLogEntry } from './advTypes';

const q = (
  key: string, skill: AdvBattleQuestion['skill'], correctId: string,
): AdvBattleQuestion => ({
  key,
  type: 'rec',
  level: 'n2',
  skill,
  examSection: skill === 'listening' ? 'listening' : skill === 'reading' ? 'reading' : 'languageKnowledge',
  targetJapanese: `対象${key}`,
  questionJa: `設問${key}`,
  questionZh: `问题${key}`,
  choices: ['a', 'b', 'c', 'd'].map((c) => ({
    choiceId: `${key}-${c}`,
    textJa: `選択${c}`,
    isCorrect: `${key}-${c}` === correctId,
  })),
  explanation: {
    meaningJa: '意味', meaningZh: '意思',
    whyCorrectJa: '正解の理由', whyCorrectZh: '正确的理由',
    exampleJa: null, exampleZh: null,
    sourceItemId: `src-${key}`, sourceLabel: key,
  },
  sourceItemId: `src-${key}`,
  difficulty: 2,
  timed: true,
  variantId: `${key}-v`,
  reviewState: 'authored',
  status: 'authored',
});

const buildPools = (): Map<string, AdvBattleQuestion[]> => {
  const m = new Map<string, AdvBattleQuestion[]>();
  m.set('vocab', Array.from({ length: 12 }, (_, i) => q(`v${i}`, 'charactersVocabulary', `v${i}-a`)));
  m.set('grammar', Array.from({ length: 12 }, (_, i) => q(`g${i}`, 'grammar', `g${i}-b`)));
  m.set('reading', Array.from({ length: 8 }, (_, i) => q(`r${i}`, 'reading', `r${i}-c`)));
  m.set('listening', Array.from({ length: 8 }, (_, i) => q(`l${i}`, 'listening', `l${i}-d`)));
  return m;
};

const fullSpec = () => buildMockSpec('N2', {
  vocabCount: 12, grammarCount: 12, readingCount: 8, listeningCount: 8,
});

describe('§9 ミニ模試 runtime', () => {
  it('4技能が揃えば3セクション構成になる', () => {
    const spec = fullSpec();
    expect(spec.ready).toBe(true);
    expect(spec.sections.map((s) => s.sectionId)).toEqual(['languageKnowledge', 'reading', 'listening']);
  });

  it('**「本番同等」と表示しない**（モード表記・disclaimer）', () => {
    const spec = fullSpec();
    const blob = [
      spec.disclaimerJa, spec.disclaimerZh, spec.titleJa, spec.titleZh,
      MOCK_MODE_LABEL.short.ja, MOCK_MODE_LABEL.short.note.ja,
      MOCK_MODE_LABEL.fullTime.ja, MOCK_MODE_LABEL.fullTime.note.ja,
    ].join('\n');
    expect(blob).not.toContain('本番同等');
    expect(blob).not.toContain('本番と同じ問題数');
    // 本番時間版でも「問題数は本番より少ない」と明示している
    expect(MOCK_MODE_LABEL.fullTime.note.ja).toContain('少ない');
  });

  it('短時間版と本番時間版で制限時間が分かれている', () => {
    const spec = fullSpec();
    for (const s of spec.sections) {
      const short = sectionTimeLimit(s, 'N2', 'short');
      const full = sectionTimeLimit(s, 'N2', 'fullTime');
      expect(full).toBeGreaterThan(short);
    }
    // N2聴解の本番時間は50分
    const listening = spec.sections.find((s) => s.sectionId === 'listening')!;
    expect(sectionTimeLimit(listening, 'N2', 'fullTime')).toBe(50 * 60);
  });

  it('**reload復帰で問題・提示順・残り時間が変わらない**', () => {
    const spec = fullSpec();
    const pools = buildPools();
    const rt = startMockSession(spec, pools, 'short', 987654, '2026-08-01T00:00:00.000Z')!;
    // 途中まで解いて、時間も減らした状態を保存
    const saved: MockSessionState = {
      ...rt.state,
      sectionIndex: 1,
      remainingSecBySection: rt.state.remainingSecBySection.map((v, i) => (i === 1 ? v - 137 : v)),
      answers: { [rt.sections[0].questions[0].key]: rt.sections[0].presented[0].choices[2].choiceId },
      completedSections: ['languageKnowledge'],
    };
    const restored = restoreMockSession(spec, pools, saved)!;
    expect(restored.sections.map((s) => s.questions.map((x) => x.key)))
      .toEqual(rt.sections.map((s) => s.questions.map((x) => x.key)));
    expect(restored.sections.map((s) => s.presented.map((p) => p.presentedChoiceOrder)))
      .toEqual(rt.sections.map((s) => s.presented.map((p) => p.presentedChoiceOrder)));
    expect(restored.state.remainingSecBySection[1]).toBe(rt.state.remainingSecBySection[1] - 137);
    expect(restored.state.sectionIndex).toBe(1);
    expect(restored.state.answers).toEqual(saved.answers);
  });

  it('採点はchoiceIdだけを見る（表示位置に依存しない）', () => {
    const spec = fullSpec();
    const pools = buildPools();
    const rt = startMockSession(spec, pools, 'short', 42, '2026-08-01T00:00:00.000Z')!;
    // 全問正解のchoiceIdを入れる
    const answers: Record<string, string> = {};
    for (const sec of rt.sections) {
      for (const p of sec.presented) answers[p.key] = p.correctChoiceId;
    }
    const answered = { ...rt, state: { ...rt.state, answers } };
    const res = gradeMock(answered, new Set());
    expect(res.totalCorrect).toBe(res.totalQuestions);
    expect(res.totalUnanswered).toBe(0);
    // 正解が常に同じ表示位置に来ていない（位置バイアスが無い）
    const positions = rt.sections.flatMap((s) => s.presented.map((p) => p.presentedChoiceOrder.indexOf(p.correctChoiceId)));
    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it('未回答は誤答として数え、未回答番号を1始まりで返す', () => {
    const spec = fullSpec();
    const rt = startMockSession(spec, buildPools(), 'short', 7, '2026-08-01T00:00:00.000Z')!;
    const missing = unansweredIndexes(rt, 0);
    expect(missing).toEqual(rt.sections[0].questions.map((_, i) => i + 1));
    const g = gradeSection(rt, 0, new Set());
    expect(g.unanswered).toBe(rt.sections[0].questions.length);
    expect(g.correct).toBe(0);
  });

  it('時間切れは finishedInTime=false・elapsedSec=制限時間 になる', () => {
    const spec = fullSpec();
    const rt = startMockSession(spec, buildPools(), 'short', 7, '2026-08-01T00:00:00.000Z')!;
    const limit = rt.state.remainingSecBySection[0];
    const timedOut = { ...rt, state: { ...rt.state, remainingSecBySection: rt.state.remainingSecBySection.map((v, i) => (i === 0 ? 0 : v)) } };
    const g = gradeSection(timedOut, 0, new Set());
    expect(g.finishedInTime).toBe(false);
    expect(g.elapsedSec).toBe(limit);
  });

  it('技能別の結果が全セクション合算で出る', () => {
    const spec = fullSpec();
    const rt = startMockSession(spec, buildPools(), 'short', 3, '2026-08-01T00:00:00.000Z')!;
    const res = gradeMock(rt, new Set());
    expect(Object.keys(res.bySkill).sort())
      .toEqual(['charactersVocabulary', 'grammar', 'listening', 'reading']);
    expect(res.unseenRatio).toBe(1); // seenKeysが空＝すべて初見
  });

  it('模試attemptは timed:true と bySkill を持つ（準備度へ流れる）', () => {
    const spec = fullSpec();
    const rt = startMockSession(spec, buildPools(), 'short', 3, '2026-08-01T00:00:00.000Z')!;
    const res = gradeMock(rt, new Set());
    const at = toMockAttempt(res, '2026-08-01', new Set(), '2026-08-01T01:00:00.000Z');
    expect(at.timed).toBe(true);
    expect(Object.keys(at.bySkill).length).toBe(4);
    expect(at.questionKeys.length).toBe(res.totalQuestions);
    const log = toMockLogEntry(res, '2026-08-01', '2026-08-01T01:00:00.000Z');
    expect(log.sectionCount).toBe(3);
    expect(log.totalQuestions).toBe(res.totalQuestions);
  });

  it('技能が不足すれば「総合」と名乗らず、不足理由を返す', () => {
    const spec = buildMockSpec('N3', { vocabCount: 10, grammarCount: 10, readingCount: 0, listeningCount: 0 });
    expect(spec.ready).toBe(false);
    expect(spec.titleJa).not.toContain('総合');
    expect(spec.blockersJa.length).toBeGreaterThan(0);
    expect(spec.sections).toHaveLength(1);
  });

  it('問題が1件も無ければセッションを作らない（空の模試を出さない）', () => {
    const spec = fullSpec();
    expect(startMockSession(spec, new Map(), 'short', 1, '2026-08-01T00:00:00.000Z')).toBeNull();
  });
});

describe('§10 総合準備度のゲート', () => {
  /** 全skillに十分なevidenceがあり、遅延・timedも満たす台帳を作る */
  const richLedger = (): AdvMasteryLedger => {
    const mk = (skill: string, dayOffset: number, timed: boolean) => ({
      dateKey: `2026-07-${String(1 + dayOffset).padStart(2, '0')}`,
      scorePct: 85,
      unseenRatio: 1,
      questionKeys: Array.from({ length: 30 }, (_, i) => `${skill}-${dayOffset}-${i}`),
      tier: 'normal' as const,
      timed,
      completedAt: `2026-07-${String(1 + dayOffset).padStart(2, '0')}T00:00:00.000Z`,
      skills: [skill],
      bySkill: { [skill]: { correct: 26, total: 30, unseen: 15 } },
    });
    const led: AdvMasteryLedger = {};
    for (const s of OVERALL_READINESS_REQUIREMENT.requiredSkills) {
      // 初回と、7日以降の測り直し（delayed evidence）
      led[`t-${s}`] = [mk(s, 0, true), mk(s, 10, true)];
    }
    return led;
  };

  const mockLog = (n: number): AdvMockLogEntry[] => Array.from({ length: n }, (_, i) => ({
    mockId: `m${i}`, dateKey: '2026-07-20', level: 'N2' as const, mode: 'short' as const,
    totalCorrect: 15, totalQuestions: 20, totalUnanswered: 0,
    sectionsFinishedInTime: 3, sectionCount: 3, skills: ['grammar'],
    completedAt: '2026-07-20T00:00:00.000Z',
  }));

  it('**模試0回では総合準備度を出さない**（他の条件が揃っていても）', () => {
    const r = computeReadiness('N2', emptySkillProfile(), richLedger(), []);
    expect(r.overallPct).toBeNull();
    expect(r.overallGate.mockCount).toBe(false);
    expect(r.overallBlockersJa.some((b) => b.includes('ミニ模試'))).toBe(true);
  });

  it('模試2回でもまだ出さない', () => {
    const r = computeReadiness('N2', emptySkillProfile(), richLedger(), mockLog(2));
    expect(r.overallPct).toBeNull();
    expect(r.overallGate.mockCount).toBe(false);
  });

  it('模試3回＋全条件が揃って初めて総合準備度が出る', () => {
    const r = computeReadiness('N2', emptySkillProfile(), richLedger(), mockLog(3));
    expect(r.overallGate).toEqual({
      languageKnowledgeEvidence: true,
      readingEvidence: true,
      listeningEvidence: true,
      timedEvidence: true,
      unseenEvidence: true,
      delayedEvidence: true,
      mockCount: true,
    });
    expect(r.overallBlockersJa).toEqual([]);
    expect(r.overallPct).not.toBeNull();
  });

  it('**文法だけの実績では総合準備度を出さない**（文法攻略率の流用禁止）', () => {
    const led: AdvMasteryLedger = {
      'n2g-001': Array.from({ length: 5 }, (_, i) => ({
        dateKey: `2026-07-0${i + 1}`,
        scorePct: 100,
        unseenRatio: 1,
        questionKeys: Array.from({ length: 40 }, (_, k) => `g-${i}-${k}`),
        tier: 'normal' as const,
        timed: true,
        completedAt: `2026-07-0${i + 1}T00:00:00.000Z`,
        skills: ['grammar'],
        bySkill: { grammar: { correct: 40, total: 40, unseen: 40 } },
      })),
    };
    const r = computeReadiness('N2', emptySkillProfile(), led, mockLog(5));
    expect(r.overallPct).toBeNull();
    expect(r.overallGate.readingEvidence).toBe(false);
    expect(r.overallGate.listeningEvidence).toBe(false);
    // 文法だけは満点でも、総合は未判定のまま
    expect(r.rows.find((x) => x.key === 'grammar')!.pct).toBe(100);
  });

  it('遅延evidenceが無ければ総合は未判定', () => {
    const led: AdvMasteryLedger = {};
    for (const s of OVERALL_READINESS_REQUIREMENT.requiredSkills) {
      led[`t-${s}`] = [{
        dateKey: '2026-07-01',
        scorePct: 85, unseenRatio: 1,
        questionKeys: Array.from({ length: 30 }, (_, i) => `${s}-${i}`),
        tier: 'normal', timed: true,
        completedAt: '2026-07-01T00:00:00.000Z',
        skills: [s], bySkill: { [s]: { correct: 26, total: 30, unseen: 15 } },
      }];
    }
    const r = computeReadiness('N2', emptySkillProfile(), led, mockLog(3));
    expect(r.overallGate.delayedEvidence).toBe(false);
    expect(r.overallPct).toBeNull();
  });
});

// ── 言語知識の層化選択（CEO指摘 2026-08-14: 同じ語の読み方・例文連打＋基礎偏重の是正）──

/** 実プールと同じ形の語彙問題（1語から観点違いを複数生成・sourceItemId共有） */
const vocabQ = (
  wordId: string, aspect: string, band: AdvBattleQuestion['level'],
): AdvBattleQuestion => ({
  ...q(`vocab:${wordId}:${aspect}`, 'charactersVocabulary', `vocab:${wordId}:${aspect}-a`),
  type: `vocab-${aspect}`,
  level: band,
  sourceItemId: wordId,
});

const grammarQ = (gid: string, band: AdvBattleQuestion['level']): AdvBattleQuestion => ({
  ...q(`g:${gid}`, 'grammar', `g:${gid}-b`),
  type: 'recognize',
  level: band,
  sourceItemId: gid,
});

const realisticPools = (): Map<string, AdvBattleQuestion[]> => {
  const aspects = ['meaning', 'reading', 'orthography', 'usage', 'context', 'confusable'];
  const vocab: AdvBattleQuestion[] = [];
  // 基礎語20語 × 6観点 = 120問（プールの大半が基礎、実態の縮図）
  for (let w = 0; w < 20; w++) for (const a of aspects) vocab.push(vocabQ(`fw${w}`, a, 'foundation'));
  // N3語8語 × 6観点 = 48問
  for (let w = 0; w < 8; w++) for (const a of aspects) vocab.push(vocabQ(`nw${w}`, a, 'n3'));
  const grammar: AdvBattleQuestion[] = [
    ...Array.from({ length: 10 }, (_, i) => grammarQ(`fg${i}`, 'foundation')),
    ...Array.from({ length: 10 }, (_, i) => grammarQ(`ng${i}`, 'n3')),
  ];
  const m = new Map<string, AdvBattleQuestion[]>();
  m.set('vocab', vocab);
  m.set('grammar', grammar);
  return m;
};

describe('言語知識セクションの層化選択', () => {
  const spec = () => buildMockSpec('N3', {
    vocabCount: 168, grammarCount: 20, readingCount: 0, listeningCount: 0,
  });

  it('同一語（sourceItemId）は1問まで＝10問の異なり語・文法数が10になる', () => {
    for (const seed of [1, 7, 12345, 999999, 20260814]) {
      const rt = startMockSession(spec(), realisticPools(), 'short', seed, '2026-08-14T00:00:00.000Z')!;
      const items = rt.sections[0].questions.map((x) => x.sourceItemId);
      expect(new Set(items).size).toBe(items.length);
    }
  });

  it('語彙と文法が半々に出る（語彙がプールの9割でも文法を圧殺しない）', () => {
    const rt = startMockSession(spec(), realisticPools(), 'short', 42, '2026-08-14T00:00:00.000Z')!;
    const bySkill = rt.sections[0].questions.map((x) => x.skill);
    expect(bySkill.filter((s) => s === 'grammar').length).toBe(5);
    expect(bySkill.filter((s) => s === 'charactersVocabulary').length).toBe(5);
  });

  it('語彙の観点が3種類以上に散る（読み方・例文の連打にならない）', () => {
    for (const seed of [1, 7, 12345]) {
      const rt = startMockSession(spec(), realisticPools(), 'short', seed, '2026-08-14T00:00:00.000Z')!;
      const aspects = rt.sections[0].questions
        .filter((x) => x.skill === 'charactersVocabulary').map((x) => x.type);
      expect(new Set(aspects).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('meaning（中国語訳選び・JLPTに無い形式）は他観点で足りる限り出ない', () => {
    for (const seed of [1, 7, 12345]) {
      const rt = startMockSession(spec(), realisticPools(), 'short', seed, '2026-08-14T00:00:00.000Z')!;
      expect(rt.sections[0].questions.some((x) => x.type === 'vocab-meaning')).toBe(false);
    }
  });

  it('N3模試は受験バンド（n3）の問題が過半（基礎語ばかりにならない）', () => {
    for (const seed of [1, 7, 12345, 999999]) {
      const rt = startMockSession(spec(), realisticPools(), 'short', seed, '2026-08-14T00:00:00.000Z')!;
      const n3 = rt.sections[0].questions.filter((x) => x.level === 'n3').length;
      expect(n3).toBeGreaterThanOrEqual(6);
    }
  });

  it('層化選択でも同一seedの再構成（reload復帰）は完全一致する', () => {
    const a = startMockSession(spec(), realisticPools(), 'short', 777, '2026-08-14T00:00:00.000Z')!;
    const b = startMockSession(spec(), realisticPools(), 'short', 777, '2026-08-14T00:00:00.000Z')!;
    expect(a.sections[0].questions.map((x) => x.key)).toEqual(b.sections[0].questions.map((x) => x.key));
    expect(a.sections[0].presented.map((p) => p.choices.map((c) => c.choiceId)))
      .toEqual(b.sections[0].presented.map((p) => p.choices.map((c) => c.choiceId)));
  });

  it('seedが違えば別の問題セットになる（再受験のたびに新しい模試）', () => {
    const keysOf = (seed: number) => startMockSession(spec(), realisticPools(), 'short', seed, '2026-08-14T00:00:00.000Z')!
      .sections[0].questions.map((x) => x.key).join('|');
    const variants = new Set([1, 2, 3, 4, 5].map(keysOf));
    expect(variants.size).toBeGreaterThanOrEqual(4);
  });
});

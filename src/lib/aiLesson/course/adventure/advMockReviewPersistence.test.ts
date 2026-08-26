// 模試の間違い直しが**あとから読み返せる**こと（2026-08-25 CEO指摘）。
//
// これまで: 解説は終了直後の結果画面にしか無く、閉じると問題文ごと消えていた。
// 錯題本は設計上、問題文を持たない（キーだけ）ので、模試の解説はどこにも残らなかった。
//
// ここで守りたいこと:
//  1. 完了した回の誤答は、問題文・選んだ答え・正解・解説つきで保存される
//  2. 保存が無制限に太らない（新しい数回ぶんだけ解説を残す）
//  3. 保存 → 読み込みで中身が生き残る（reloadで消えない）
//  4. 準備度・mastery の材料（wrongKeys）はこれまでどおり
import { describe, it, expect } from 'vitest';
import {
  appendMockLog, restoreMockWrongDetails, toMockLogEntry, toMockWrongDetails,
  MOCK_DETAIL_KEEP, MAX_WRONG_DETAILS,
  type MockResult, type MockRuntime, type MockWrongDetail,
} from './advMockSession';
import { defaultAdvProfile, readAdvProfile, writeAdvProfile } from './advProfile';
import type { AdvMockLogEntry, AdventureV2Profile } from './advTypes';
import type { LearnerSettings } from '../types';

/** 最小の runtime（採点に要るところだけ） */
const runtime = (picked: Record<string, string>): MockRuntime => ({
  spec: { level: 'N2', titleJa: '', titleZh: '', sections: [], ready: true, blockersJa: [], blockersZh: [] },
  sections: [{
    section: { sectionId: 'languageKnowledge', labelJa: '言語知識', labelZh: '语言知识', questionCount: 2, minutes: 10, skills: ['vocabulary'] },
    questions: [
      {
        key: 'q1', skill: 'vocabulary', targetJapanese: '挑戦', questionJa: '「挑戦」の読みは？', questionZh: '「挑戦」怎么读？',
        choices: [
          { choiceId: 'a', textJa: 'ちょうせん', isCorrect: true },
          { choiceId: 'b', textJa: 'とうせん', isCorrect: false },
        ],
        explanation: { whyCorrectJa: '「挑」は音読みで「ちょう」。', whyCorrectZh: '「挑」音读为「ちょう」。' },
      },
      {
        key: 'q2', skill: 'vocabulary', targetJapanese: '給料', questionJa: '「給料」の読みは？', questionZh: '「給料」怎么读？',
        choices: [
          { choiceId: 'a', textJa: 'きゅうりょう', isCorrect: true },
          { choiceId: 'b', textJa: 'きゅうりょ', isCorrect: false },
        ],
        explanation: { whyCorrectJa: '「料」は「りょう」と伸ばす。', whyCorrectZh: '「料」读作长音「りょう」。' },
      },
    ],
    presented: [],
  }],
  state: {
    mockId: 'mock-N2-short-1', level: 'N2', mode: 'short', attemptSeed: 1,
    startedAt: '2026-08-25T00:00:00.000Z', sectionIndex: 0,
    remainingSecBySection: [600], answers: picked, completedSections: [], finishedAt: null,
  },
} as unknown as MockRuntime);

const entry = (over: Partial<AdvMockLogEntry> = {}): AdvMockLogEntry => ({
  mockId: 'm', dateKey: '2026-08-25', level: 'N2', mode: 'short',
  totalCorrect: 8, totalQuestions: 20, totalUnanswered: 0,
  sectionsFinishedInTime: 3, sectionCount: 3, skills: ['vocabulary'],
  completedAt: '2026-08-25T00:00:00.000Z',
  wrong: [{
    key: 'q1', sectionLabelJa: '言語知識', sectionLabelZh: '语言知识', index: 1,
    stemJa: '「挑戦」の読みは？', stemZh: '', pickedTextJa: 'とうせん',
    correctTextJa: 'ちょうせん', whyJa: '解説', whyZh: '解析',
  }],
  ...over,
});

describe('誤答の記録', () => {
  it('間違えた問題だけを、問題文・選んだ答え・正解・解説つきで残す', () => {
    // q1 は誤答、q2 は正解
    const details = toMockWrongDetails(runtime({ q1: 'b', q2: 'a' }));
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      key: 'q1',
      sectionLabelJa: '言語知識',
      index: 1,
      pickedTextJa: 'とうせん',
      correctTextJa: 'ちょうせん',
      whyJa: '「挑」は音読みで「ちょう」。',
      whyZh: '「挑」音读为「ちょう」。',
    });
    expect(details[0]!.stemJa).toContain('挑戦');
  });

  it('未回答も「間違い」として残す（何を答えなかったかが分かる）', () => {
    const details = toMockWrongDetails(runtime({ q1: 'a' }));
    expect(details.map((d) => d.key)).toEqual(['q2']);
    expect(details[0]!.pickedTextJa).toBeNull();
  });

  it('全問正解なら記録は空（履歴にも wrong を持たせない）', () => {
    const details = toMockWrongDetails(runtime({ q1: 'a', q2: 'a' }));
    expect(details).toHaveLength(0);
    const log = toMockLogEntry({
      mockId: 'm', level: 'N2', mode: 'short', sections: [], totalCorrect: 2, totalQuestions: 2,
      totalUnanswered: 0, bySkill: {}, skills: [], allQuestionKeys: [], wrongKeys: [],
      unseenRatio: 0, wrong: details,
    } as MockResult, '2026-08-25', '2026-08-25T00:00:00.000Z');
    expect(log.wrong).toBeUndefined();
  });
});

describe('保存が太らないこと', () => {
  it(`解説つきで残るのは新しい${MOCK_DETAIL_KEEP}回ぶんだけ（古い回は集計だけ残る）`, () => {
    let log: AdvMockLogEntry[] = [];
    for (let i = 0; i < MOCK_DETAIL_KEEP + 3; i += 1) {
      log = appendMockLog(log, entry({ mockId: `m${i}`, dateKey: `2026-08-${10 + i}` }));
    }
    expect(log).toHaveLength(MOCK_DETAIL_KEEP + 3);
    const withDetail = log.filter((e) => e.wrong !== undefined);
    expect(withDetail).toHaveLength(MOCK_DETAIL_KEEP);
    // 残っているのは新しい方
    expect(withDetail.map((e) => e.mockId)).toEqual(
      log.slice(-MOCK_DETAIL_KEEP).map((e) => e.mockId),
    );
    // 集計（回数・点数）は古い回も消えない＝準備度の mock count は変わらない
    expect(log[0]).toMatchObject({ mockId: 'm0', totalCorrect: 8, totalQuestions: 20 });
  });

  it('1回に保存する誤答は上限つき', () => {
    const many = Array.from({ length: MAX_WRONG_DETAILS + 10 }, (_, i) => ({
      key: `k${i}`, sectionLabelJa: 'a', sectionLabelZh: 'a', index: i + 1,
      stemJa: 'x', stemZh: '', pickedTextJa: null, correctTextJa: 'y', whyJa: '', whyZh: '',
    })) as MockWrongDetail[];
    expect(restoreMockWrongDetails(many)).toHaveLength(MAX_WRONG_DETAILS);
  });
});

describe('壊れたデータ・reload', () => {
  it('問題文や正解が欠けた行は落とす（空の解説カードを出さない）', () => {
    const restored = restoreMockWrongDetails([
      { key: 'ok', stemJa: '問題', correctTextJa: '正解', whyJa: '解説' },
      { key: 'nostem', correctTextJa: '正解' },
      { key: 'noanswer', stemJa: '問題' },
      'こわれている',
    ]);
    expect(restored.map((r) => r.key)).toEqual(['ok']);
    expect(restored[0]!.pickedTextJa).toBeNull();
    expect(restoreMockWrongDetails(null)).toEqual([]);
  });

  it('保存 → 読み込みで解説が生き残る', () => {
    const prof: AdventureV2Profile = {
      ...defaultAdvProfile('2026-08-25T00:00:00.000Z'),
      enabled: true,
      mockLog: [entry()],
    };
    const back = readAdvProfile(writeAdvProfile({} as LearnerSettings, prof, '2026-08-25T00:00:00.000Z'));
    expect(back?.mockLog).toHaveLength(1);
    expect(back?.mockLog[0]?.wrong?.[0]).toMatchObject({
      correctTextJa: 'ちょうせん', whyJa: '解説',
    });
  });

  it('解説を持たない古い記録も、そのまま読める（履歴が消えない）', () => {
    const prof: AdventureV2Profile = {
      ...defaultAdvProfile('2026-08-25T00:00:00.000Z'),
      enabled: true,
      mockLog: [entry({ wrong: undefined })],
    };
    const back = readAdvProfile(writeAdvProfile({} as LearnerSettings, prof, '2026-08-25T00:00:00.000Z'));
    expect(back?.mockLog).toHaveLength(1);
    expect(back?.mockLog[0]?.wrong).toBeUndefined();
  });
});

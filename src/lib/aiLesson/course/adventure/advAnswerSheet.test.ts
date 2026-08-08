// 答案用紙（マークシート）の受入テスト。
//
// いちばん守りたいこと:
// ① **N2の試験を受ける人にだけ見える**（それ以外に存在させない）
// ② 正解が未登録なら**採点しない**（0点に見せない・原則13）
// ③ 残り時間は壁時計基準（閉じても進む＝本番と同じ）
import { describe, it, expect } from 'vitest';
import {
  answerSheetsVisible, availablePapers, startSession, setAnswer, remainingSeconds,
  unansweredNumbers, advanceSection, grade, restorePaper, restorePapers,
  restoreSheetSession, restoreSheetLog, formatClock,
  type AnswerSheetPaper,
} from './advAnswerSheet';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile } from './advTypes';

const NOW = '2026-08-02T10:00:00.000Z';

const paper = (over: Partial<AnswerSheetPaper> = {}): AnswerSheetPaper => ({
  paperId: 'p1',
  titleJa: '2023年12月 N2', titleZh: '2023年12月 N2',
  level: 'N2',
  sections: [
    { id: 's1', labelJa: '言語知識・読解', labelZh: '语言知识・阅读', questionCount: 3, choiceCount: 4, minutes: 105 },
    { id: 's2', labelJa: '聴解', labelZh: '听力', questionCount: 2, choiceCount: 4, minutes: 50 },
  ],
  issuedAtISO: NOW,
  ...over,
});

const profileWith = (over: Partial<AdventureV2Profile>): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType: 'jlpt',
  targetJlpt: 'N2',
  ...over,
});

describe('可視性 — N2受験者だけ', () => {
  it('N2目標のjlpt/hybridに見える', () => {
    expect(answerSheetsVisible(profileWith({ goalType: 'jlpt' }))).toBe(true);
    expect(answerSheetsVisible(profileWith({ goalType: 'hybrid' }))).toBe(true);
  });

  it('**会話目的・N3目標・未設定には見えない**', () => {
    expect(answerSheetsVisible(profileWith({ goalType: 'conversation' }))).toBe(false);
    expect(answerSheetsVisible(profileWith({ targetJlpt: 'N3' }))).toBe(false);
    expect(answerSheetsVisible(profileWith({ targetJlpt: null }))).toBe(false);
  });

  it('見えない人には用紙が届いていても一覧に出ない', () => {
    const p = profileWith({ goalType: 'conversation', answerSheets: [paper()] });
    expect(availablePapers(p)).toEqual([]);
  });

  it('新しい用紙が先頭に来る', () => {
    const p = profileWith({
      answerSheets: [
        paper({ paperId: 'old', issuedAtISO: '2026-07-01T00:00:00.000Z' }),
        paper({ paperId: 'new', issuedAtISO: '2026-08-01T00:00:00.000Z' }),
      ],
    });
    expect(availablePapers(p).map((x) => x.paperId)).toEqual(['new', 'old']);
  });
});

describe('記入', () => {
  it('マークして、同じ番号をもう一度押すと消える', () => {
    const pp = paper();
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 0, 3);
    expect(s.answers.s1).toEqual([3, null, null]);
    s = setAnswer(s, pp.sections[0], 0, 3);
    expect(s.answers.s1).toEqual([null, null, null]);
  });

  it('範囲外の入力は無視する', () => {
    const pp = paper();
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 0, 5);   // 4択に5
    s = setAnswer(s, pp.sections[0], 9, 1);   // 存在しない問題
    expect(s.answers.s1).toEqual([null, null, null]);
  });

  it('未回答の問題番号が1始まりで出る', () => {
    const pp = paper();
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 1, 2);
    expect(unansweredNumbers(s, pp.sections[0])).toEqual([1, 3]);
  });
});

describe('時間 — 壁時計基準（本番と同じ）', () => {
  it('経過した分だけ減る。アプリを閉じていた時間も減る', () => {
    const pp = paper();
    const s = startSession(pp, NOW);
    expect(remainingSeconds(pp.sections[0], s, NOW)).toBe(105 * 60);
    const after10min = '2026-08-02T10:10:00.000Z';
    expect(remainingSeconds(pp.sections[0], s, after10min)).toBe(95 * 60);
  });

  it('0を下回らない', () => {
    const pp = paper();
    const s = startSession(pp, NOW);
    expect(remainingSeconds(pp.sections[0], s, '2026-08-02T20:00:00.000Z')).toBe(0);
  });

  it('次の科目へ進むと、その時点から新しい科目の時間が始まる', () => {
    const pp = paper();
    const s = startSession(pp, NOW);
    const later = '2026-08-02T11:45:00.000Z';
    const next = advanceSection(pp, s, later)!;
    expect(next.sectionIndex).toBe(1);
    expect(remainingSeconds(pp.sections[1], next, later)).toBe(50 * 60);
  });

  it('最後の科目の次は null（＝提出）', () => {
    const pp = paper();
    let s = startSession(pp, NOW);
    s = advanceSection(pp, s, NOW)!;
    expect(advanceSection(pp, s, NOW)).toBeNull();
  });

  it('mm:ss 表示', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(105 * 60)).toBe('105:00');
  });

  it('**科目ごとの経過時間は実測**（早く終えた科目に按分で時間を盛らない・監査sh-time）', () => {
    const pp = paper();
    let s = startSession(pp, NOW);                              // s1(105分)を10:00に開始
    s = advanceSection(pp, s, '2026-08-02T10:30:00.000Z')!;     // 30分でs1を終える
    const r = grade(pp, s, '2026-08-02T10:50:00.000Z');         // s2は20分で提出
    expect(r.sections[0].elapsedSeconds).toBe(30 * 60);
    expect(r.sections[1].elapsedSeconds).toBe(20 * 60);
  });

  it('実測の無い旧セッションでも grade が落ちない（按分にフォールバック）', () => {
    const pp = paper();
    const restored = restoreSheetSession({
      paperId: 'p1', sectionIndex: 1, startedAtISO: NOW,
      sectionStartedAtISO: '2026-08-02T11:45:00.000Z', answers: {},
    })!;
    expect(restored.sectionElapsed).toEqual({});
    const r = grade(pp, restored, '2026-08-02T12:00:00.000Z');
    expect(r.sections[0].elapsedSeconds).toBe(105 * 60); // 旧データは従来どおりの按分（上限cap）
    expect(r.sections[1].elapsedSeconds).toBe(15 * 60);  // いまの科目は実測
  });
});

describe('採点 — 未登録なら採点しない（原則13）', () => {
  it('**正解未登録なら correct も scorePct も null**（0点に見せない）', () => {
    const pp = paper();
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 0, 1);
    const r = grade(pp, s, '2026-08-02T12:00:00.000Z');
    expect(r.sections[0].correct).toBeNull();
    expect(r.scorePct).toBeNull();
    expect(r.answeredTotal).toBe(1);
    expect(r.questionTotal).toBe(5);
  });

  it('**学習者の選んだ番号が結果に必ず残る**（未採点運用ではこれが先生に渡る唯一の答案・監査P0）', () => {
    const pp = paper();
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 0, 3);
    s = setAnswer(s, pp.sections[0], 2, 1);
    s = setAnswer(s, pp.sections[1], 1, 4);
    const r = grade(pp, s, NOW);
    expect(r.sections[0].choices).toEqual([3, null, 1]);
    expect(r.sections[1].choices).toEqual([null, 4]);
  });

  it('提出履歴の復元で choices が残る。choicesの無い旧記録は空配列で落ちない', () => {
    const pp = paper();
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 0, 2);
    const r = grade(pp, s, NOW);
    const restored = restoreSheetLog(JSON.parse(JSON.stringify([r])));
    expect(restored[0].sections[0].choices).toEqual([2, null, null]);
    // 旧形式（choicesなし）
    const legacy = restoreSheetLog([{
      ...JSON.parse(JSON.stringify(r)),
      sections: r.sections.map((s) => { const rest = { ...s } as Record<string, unknown>; delete rest.choices; return rest; }),
    }]);
    expect(legacy[0].sections[0].choices).toEqual([]);
  });

  it('全科目に正解が登録されているときだけ総合スコアが出る', () => {
    const pp = paper({
      sections: [
        { id: 's1', labelJa: 'A', labelZh: 'A', questionCount: 2, choiceCount: 4, minutes: 10, correctChoices: [1, 2] },
        { id: 's2', labelJa: 'B', labelZh: 'B', questionCount: 2, choiceCount: 4, minutes: 10, correctChoices: [3, 4] },
      ],
    });
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 0, 1); // 正解
    s = setAnswer(s, pp.sections[0], 1, 1); // 不正解
    s = setAnswer(s, pp.sections[1], 0, 3); // 正解
    const r = grade(pp, s, NOW);
    expect(r.sections[0].correct).toBe(1);
    expect(r.sections[1].correct).toBe(1);
    expect(r.scorePct).toBe(50); // 2/4
  });

  it('**1科目でも正解未登録なら総合は出さない**（部分点を全体に見せない）', () => {
    const pp = paper({
      sections: [
        { id: 's1', labelJa: 'A', labelZh: 'A', questionCount: 2, choiceCount: 4, minutes: 10, correctChoices: [1, 2] },
        { id: 's2', labelJa: 'B', labelZh: 'B', questionCount: 2, choiceCount: 4, minutes: 10 },
      ],
    });
    const r = grade(pp, startSession(pp, NOW), NOW);
    expect(r.sections[0].correct).toBe(0);
    expect(r.sections[1].correct).toBeNull();
    expect(r.scorePct).toBeNull();
  });

  it('未回答は不正解として数えない（正解数は選んだものだけで数える）', () => {
    const pp = paper({
      sections: [{ id: 's1', labelJa: 'A', labelZh: 'A', questionCount: 3, choiceCount: 4, minutes: 10, correctChoices: [1, 1, 1] }],
    });
    let s = startSession(pp, NOW);
    s = setAnswer(s, pp.sections[0], 0, 1);
    const r = grade(pp, s, NOW);
    expect(r.sections[0].correct).toBe(1);
    expect(r.scorePct).toBe(33); // 1/3
  });
});

describe('壊れたデータの復元', () => {
  it('正しい用紙はそのまま通る（正解つきも）', () => {
    const pp = paper({
      sections: [{ id: 's1', labelJa: 'A', labelZh: 'A', questionCount: 2, choiceCount: 4, minutes: 10, correctChoices: [1, 4] }],
    });
    const restored = restorePaper(JSON.parse(JSON.stringify(pp)))!;
    expect(restored.paperId).toBe('p1');
    expect(restored.sections[0].correctChoices).toEqual([1, 4]);
  });

  it('**半端な正解（問題数と合わない・範囲外）は捨てる**（採点を嘘にしない）', () => {
    const bad1 = restorePaper({ ...paper(), sections: [{ id: 's1', labelJa: 'A', labelZh: 'A', questionCount: 3, choiceCount: 4, minutes: 10, correctChoices: [1, 2] }] })!;
    expect(bad1.sections[0].correctChoices).toBeUndefined();
    const bad2 = restorePaper({ ...paper(), sections: [{ id: 's1', labelJa: 'A', labelZh: 'A', questionCount: 2, choiceCount: 4, minutes: 10, correctChoices: [1, 9] }] })!;
    expect(bad2.sections[0].correctChoices).toBeUndefined();
  });

  it('壊れた用紙・科目0の用紙は捨てる', () => {
    expect(restorePaper(null)).toBeNull();
    expect(restorePaper({ paperId: 'x', level: 'N1', sections: [] })).toBeNull();
    expect(restorePapers([paper(), null, { broken: true }])).toHaveLength(1);
  });

  it('進行中の答案も復元できる（壊れた解答は null に落ちる）', () => {
    const s = restoreSheetSession({
      paperId: 'p1', sectionIndex: 1, startedAtISO: NOW,
      answers: { s1: [1, 'x', 99] },
    })!;
    expect(s.sectionIndex).toBe(1);
    expect(s.answers.s1).toEqual([1, null, null]);
    expect(s.sectionStartedAtISO).toBe(NOW);
  });

  it('プロファイル復元に組み込まれている（answerSheets が無い旧データでも落ちない）', () => {
    const p = defaultAdvProfile(NOW);
    expect(p.answerSheets).toEqual([]);
    expect(p.answerSheetSession).toBeNull();
    expect(p.answerSheetLog).toEqual([]);
  });
});

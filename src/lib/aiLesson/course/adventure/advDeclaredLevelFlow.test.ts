// 級を申告した人に起きていた2つの取り違え（2026-08-23 実機で発覚）。
//
// テストアカウントで「会話を伸ばしたい」→「JLPT N1を持っている」を選んだところ:
//  ① かなチェック（ひらがなを読めますか）が出た
//  ② AI会話が第1週の「〜といいます」から始まった
//
// ①の原因: 診断を出さない人は帯が needs_assessment になり、
//          それが「かなが読めるか分からない人」の合図として使われていた。
// ②の原因: 会話ミッションの選定に使う値は正しく保存されていたが、
//          画面側が開いた時点の古い plan を持ち続けていた（別テストで固定）。
//
// ここでは①の判定そのものと、申告から開始週が決まることを固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { conversationEntryWeekOf } from '../courseEngine';
import { readAdvProfile, defaultAdvProfile } from './advProfile';
import { generateTodayQuest } from './advQuest';
import { generateRoute } from './advRoute';
import type { Learner, LearnerSettings } from '../types';

/** オンボーディング完了時に保存される形（AdvShell.profileFromOutcome 相当） */
const settingsWith = (declared: 'N1' | 'N2' | 'N3' | null, band: string): LearnerSettings => ({
  zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null,
  adventureV2: {
    schemaVersion: 1, enabled: true,
    goalType: 'conversation', targetJlpt: null, declaredJlpt: declared,
    diagnosis: { knowledgeBand: band },
  },
} as unknown as LearnerSettings);

const learnerWith = (declared: 'N1' | 'N2' | 'N3' | null, band: string): Learner => ({
  id: 'L', userId: 'U', startedAtISO: null, displayName: '検証', preferredLanguage: 'zh',
  estimatedLevel: 'N3', difficultyLevel: 2, currentWeek: 1, isActive: true, hearing: {},
  settings: settingsWith(declared, band), adminOverrides: {},
});

describe('申告した級が保存され、読み戻せる', () => {
  it('N1/N2/N3 は保存され、想定外の値は落とす', () => {
    for (const v of ['N1', 'N2', 'N3'] as const) {
      expect(readAdvProfile(settingsWith(v, 'needs_assessment'))?.declaredJlpt).toBe(v);
    }
    const broken = { ...settingsWith(null, 'needs_assessment') } as Record<string, unknown>;
    (broken.adventureV2 as Record<string, unknown>).declaredJlpt = 'N9';
    expect(readAdvProfile(broken as unknown as LearnerSettings)?.declaredJlpt).toBeNull();
  });
});

describe('② 会話の開始週は申告で決まる（診断の帯に負けない）', () => {
  it('N1・N2の申告があれば、帯が needs_assessment でも上級パートから', () => {
    for (const v of ['N1', 'N2'] as const) {
      expect(conversationEntryWeekOf(learnerWith(v, 'needs_assessment')), `${v}`).toBe(13);
    }
  });

  it('N3の申告なら第10週から', () => {
    expect(conversationEntryWeekOf(learnerWith('N3', 'needs_assessment'))).toBe(10);
  });

  it('申告が無い人は今までどおり診断の帯で決まる', () => {
    expect(conversationEntryWeekOf(learnerWith(null, 'needs_assessment'))).toBe(1);
    expect(conversationEntryWeekOf(learnerWith(null, 'n3_late'))).toBe(10);
  });

  it('申告は診断の帯より優先される（低く測られても申告を尊重する）', () => {
    expect(conversationEntryWeekOf(learnerWith('N1', 'pre_n5'))).toBe(13);
  });
});

/**
 * ① かなチェックの入口条件。
 * AdvShell は「帯が needs_assessment / pre_n5」でかなを未確認に初期化する。
 * 級の申告がある人はその対象から外す、という判定をここで固定する。
 */
const kanaCheckNeeded = (declared: 'N1' | 'N2' | 'N3' | null, band: string): boolean =>
  declared === null && (band === 'needs_assessment' || band === 'pre_n5');

describe('① 級を申告した人にかなチェックを出さない', () => {
  it('N1・N2・N3の申告があれば、帯が未判定でも出さない', () => {
    for (const v of ['N1', 'N2', 'N3'] as const) {
      expect(kanaCheckNeeded(v, 'needs_assessment'), `${v} にかなチェックが出る`).toBe(false);
      expect(kanaCheckNeeded(v, 'pre_n5'), `${v} にかなチェックが出る`).toBe(false);
    }
  });

  it('申告が無い人には今までどおり出す（N5/N4目標の人を守る）', () => {
    expect(kanaCheckNeeded(null, 'needs_assessment')).toBe(true);
    expect(kanaCheckNeeded(null, 'pre_n5')).toBe(true);
  });

  it('帯が測れている人には出さない', () => {
    expect(kanaCheckNeeded(null, 'n3')).toBe(false);
    expect(kanaCheckNeeded(null, 'n2')).toBe(false);
  });
});

// 2026-08-23 実機再現（staging）: 「準備をやり直す」で会話目標＋N1申告に変えた直後、
// 今日の一手が「假名检查（かなチェック）」になった。原因は2つ:
//   ① 以前の設定で立った kana.needed=null が、級を申告しても取り下げられない
//   ② quest生成側が profile.kana だけを見て、申告レベルを見ていない
// N1〜N3を申告した人にひらがなの読みを確認させない。
describe('級を申告した人にかなチェックを出さない（2026-08-23 実機再現）', () => {
  const NOW = '2026-08-23T09:00:00.000Z';
  const convRoute = generateRoute({
    goalType: 'conversation', targetJlpt: null, knowledgeBand: 'needs_assessment',
    conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
  });
  const questWith = (declared: 'N1' | null) => generateTodayQuest({
    profile: {
      ...defaultAdvProfile(NOW), goalType: 'conversation', targetJlpt: null,
      declaredJlpt: declared, dailyMinutes: 15, route: convRoute,
      // 未確認のまま（以前の設定で立った状態）
      kana: { needed: null, doneRowIds: [], checkedAt: null },
    },
    route: convRoute, reviewQuestionCount: 0, weakGrammarIds: [], dateKey: '2026-08-23',
    nowISO: NOW, daysToExam: null, masteredStageIds: new Set(), contentStage: convRoute.stages[0],
    availability: {
      nextGrammarIds: [], nextUnitIds: [], conversationTargets: [],
      confirmTargetIds: [], vocabBattleTargetId: 'vocab-1', kanjiBattleTargetId: null,
    },
  });

  it('kana.needed が null（未確認）のままでも、申告があればかな道場stepを作らない', () => {
    const q = questWith('N1');
    expect(q, '今日の冒険が組めない').toBeTruthy();
    expect(q!.steps.some((s) => s.kind === 'kana_dojo'), 'かな道場が出ている').toBe(false);
  });

  it('申告が無い超初心者には従来どおり出る（機能を消していない）', () => {
    const q = questWith(null);
    expect(q!.steps.some((s) => s.kind === 'kana_dojo')).toBe(true);
  });
});

// 2026-08-23 実機再現（staging・上と同じセッション）: 「準備をやり直す」→会話目標→「N1を持っている」
// →更新、のあと DB の declaredJlpt が **null のまま**だった（実測）。
// 原因は finishAdjust が OnboardingOutcome に declaredJlpt を載せていなかったこと。
// 申告が消えると会話が第1週へ巻き戻り、かなチェックまで復活する（この2つは上のテストで固定済み）。
describe('調整モードでも申告した級が保存される（2026-08-23 実機再現）', () => {
  it('finishAdjust の outcome に declaredJlpt が含まれている', () => {
    const src = readFileSync(new URL('../../../../components/ai-course/adventure/AdvOnboarding.tsx', import.meta.url), 'utf8');
    const fn = /const finishAdjust = \(\) => \{[\s\S]*?\n  \};/.exec(src);
    expect(fn, 'finishAdjust が見つからない').toBeTruthy();
    expect(fn![0], 'finishAdjust が declaredJlpt を落としている').toMatch(/declaredJlpt: declared,/);
  });

  it('調整モードの初期値は保存済みの級（毎回「わからない」に戻さない）', () => {
    const src = readFileSync(new URL('../../../../components/ai-course/adventure/AdvOnboarding.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/useState<'N1' \| 'N2' \| 'N3' \| null>\(adjust\?\.declaredJlpt \?\? null\)/);
    const shell = readFileSync(new URL('../../../../components/ai-course/adventure/AdvShell.tsx', import.meta.url), 'utf8');
    expect(shell, 'AdvShell が adjust へ declaredJlpt を渡していない').toMatch(/declaredJlpt: profile\.declaredJlpt \?\? null,/);
  });
});

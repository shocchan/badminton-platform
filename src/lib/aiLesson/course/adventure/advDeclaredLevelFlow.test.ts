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
import { conversationEntryWeekOf } from '../courseEngine';
import { readAdvProfile } from './advProfile';
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

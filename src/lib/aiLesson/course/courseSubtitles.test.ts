// 中国語補助字幕ロジックの受入テスト（§9）

import { describe, it, expect } from 'vitest';
import {
  deriveDefaultSubtitleMode, effectiveSubtitleMode, autoTranslateAll, zhAssistAvailable,
  studentIsStuck, tutorUsedChinese, shouldAutoShowOnStuck, isRepeatedTutorQuestion,
} from './courseSubtitles';
import { estimateTranslateCostUsd } from './courseTranslateApi';
import type { LearnerSettings } from './types';

const settings = (over: Partial<LearnerSettings> = {}): LearnerSettings => ({
  zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null, ...over,
});

describe('subtitle default mode (level + zhSupport based)', () => {
  it('zhSupport none は常に 日本語のみ', () => {
    expect(deriveDefaultSubtitleMode('none', 1)).toBe('ja');
    expect(deriveDefaultSubtitleMode('none', 5)).toBe('ja');
  });
  it('N3前半以下（difficulty<=3）は中国語補助あり', () => {
    expect(deriveDefaultSubtitleMode('whenStuck', 1)).toBe('ja_zh');
    expect(deriveDefaultSubtitleMode('whenStuck', 2)).toBe('ja_zh');
    expect(deriveDefaultSubtitleMode('whenStuck', 3)).toBe('ja_zh');
  });
  it('N3後半以上（difficulty>=4）は困ったときだけ', () => {
    expect(deriveDefaultSubtitleMode('often', 4)).toBe('whenStuck');
    expect(deriveDefaultSubtitleMode('grammar', 5)).toBe('whenStuck');
  });
});

describe('effective subtitle mode', () => {
  it('明示設定が最優先される', () => {
    expect(effectiveSubtitleMode(settings({ subtitleMode: 'ja' }), 'zh', 2)).toBe('ja');
    expect(effectiveSubtitleMode(settings({ subtitleMode: 'whenStuck' }), 'zh', 2)).toBe('whenStuck');
  });
  it('日本語UIは未設定なら初期OFF（ja）', () => {
    expect(effectiveSubtitleMode(settings(), 'ja', 2)).toBe('ja');
  });
  it('中国語UIは未設定ならレベルから導出（difficulty2 → ja_zh）', () => {
    expect(effectiveSubtitleMode(settings(), 'zh', 2)).toBe('ja_zh');
  });
  it('zhSupport none は明示設定 ja_zh でも 日本語のみへ強制（矛盾防止）', () => {
    expect(effectiveSubtitleMode(settings({ zhSupport: 'none', subtitleMode: 'ja_zh' }), 'zh', 1)).toBe('ja');
  });
});

describe('mode capabilities', () => {
  it('autoTranslateAll は ja_zh のみ true', () => {
    expect(autoTranslateAll('ja_zh')).toBe(true);
    expect(autoTranslateAll('whenStuck')).toBe(false);
    expect(autoTranslateAll('ja')).toBe(false);
  });
  it('zhAssistAvailable は ja のみ false（＝中国語を一切出さない）', () => {
    expect(zhAssistAvailable('ja')).toBe(false);
    expect(zhAssistAvailable('ja_zh')).toBe(true);
    expect(zhAssistAvailable('whenStuck')).toBe(true);
  });
});

describe('whenStuck auto-show triggers', () => {
  it('生徒が「分かりません」等を言ったら表示', () => {
    expect(studentIsStuck('すみません、分かりません')).toBe(true);
    expect(studentIsStuck('什么意思？')).toBe(true);
    expect(studentIsStuck('もう一度お願いします')).toBe(true);
    expect(studentIsStuck('はい、分かりました')).toBe(false);
    expect(studentIsStuck(null)).toBe(false);
  });
  it('ゆい先生が中国語で補助したら表示', () => {
    expect(tutorUsedChinese('这个的意思是……')).toBe(true);
    expect(tutorUsedChinese('では、写真を撮ってもいいですか、と言ってみましょう。')).toBe(false);
  });
  it('shouldAutoShowOnStuck は各トリガーで true、通常時は false', () => {
    expect(shouldAutoShowOnStuck({ tutorText: '普通の日本語です', prevStudentText: 'はい' })).toBe(false);
    expect(shouldAutoShowOnStuck({ tutorText: '普通の日本語です', prevStudentText: '分かりません' })).toBe(true);
    expect(shouldAutoShowOnStuck({ tutorText: '这个意思是可以吗', prevStudentText: 'はい' })).toBe(true);
    expect(shouldAutoShowOnStuck({ tutorText: 'ok', tutorRepeatedQuestion: true })).toBe(true);
    expect(shouldAutoShowOnStuck({ tutorText: 'ok', hintLevelReached: true })).toBe(true);
  });
});

describe('repeated tutor question detection', () => {
  it('直近の同じ質問を検知する', () => {
    const prev = ['今日はどこへ行きましたか？', 'うんうん', '今日はどこへ行きましたか。'];
    expect(isRepeatedTutorQuestion('今日はどこへ行きましたか？', prev)).toBe(true);
  });
  it('違う発話は繰り返しとみなさない', () => {
    const prev = ['お名前は？', 'いいですね'];
    expect(isRepeatedTutorQuestion('週末は何をしますか？', prev)).toBe(false);
  });
  it('短すぎる相槌は誤検知しない', () => {
    expect(isRepeatedTutorQuestion('はい', ['はい', 'はい'])).toBe(false);
  });
});

describe('translate cost estimate', () => {
  it('usage が無ければ 0', () => {
    expect(estimateTranslateCostUsd(null)).toBe(0);
    expect(estimateTranslateCostUsd(undefined)).toBe(0);
  });
  it('トークン数から概算する（gpt-4o-mini 単価）', () => {
    const c = estimateTranslateCostUsd({ prompt_tokens: 200, completion_tokens: 40 });
    // (200*0.15 + 40*0.6) / 1e6 = (30 + 24)/1e6
    expect(c).toBeCloseTo(54 / 1_000_000, 12);
    expect(c).toBeGreaterThan(0);
  });
});

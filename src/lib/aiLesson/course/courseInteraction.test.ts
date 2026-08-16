// 誤割り込み防止・開始案内（Feature 1 / 2）の純ロジック検証。
import { describe, it, expect } from 'vitest';
import {
  isMeaningfulUserTurn, shouldShowGreetingGuide, shouldNudgeGreeting,
  COURSE_TURN_DETECTION, MEANINGFUL_MIN_MS,
} from './courseInteraction';

describe('isMeaningfulUserTurn（咳・雑音で会話/ミッションを進めない）', () => {
  it('空・空白は無効', () => {
    expect(isMeaningfulUserTurn({ transcript: '' })).toBe(false);
    expect(isMeaningfulUserTurn({ transcript: '   ' })).toBe(false);
  });
  it('相づち・フィラー・咳のような短音だけは無効', () => {
    for (const t of ['あ', 'ん', 'えー', 'えっと', 'うーん', 'んー', '……']) {
      expect(isMeaningfulUserTurn({ transcript: t }), t).toBe(false);
    }
  });
  it('0.3秒の咳・0.8秒の物音相当（短時間＋短断片）は無効', () => {
    expect(isMeaningfulUserTurn({ transcript: 'ん', durationMs: 300 })).toBe(false);
    expect(isMeaningfulUserTurn({ transcript: 'あー', durationMs: 800 })).toBe(false);
  });
  it('「はい/いいえ」等の有効短答は短くても通す', () => {
    for (const t of ['はい', 'いいえ', 'うん', 'そうです', 'ちがいます', 'オーケー', '３つ']) {
      expect(isMeaningfulUserTurn({ transcript: t }), t).toBe(true);
    }
  });
  it('2秒以上の明確な発話は通す', () => {
    expect(isMeaningfulUserTurn({ transcript: '日本の大会に出たことがあります', durationMs: 2500 })).toBe(true);
  });
  it('意味のある文は継続時間が短めでも文字数で通す（短答期待時）', () => {
    expect(isMeaningfulUserTurn({ transcript: '疲れました', durationMs: 500, shortAnswerExpected: true })).toBe(true);
  });
  it('意味のある文でも極端に短い継続時間＋短答非期待なら雑音として無効', () => {
    expect(isMeaningfulUserTurn({ transcript: '疲れた', durationMs: 200, shortAnswerExpected: false })).toBe(false);
  });
  it('ラテン文字の極短断片（マイクノイズ）は無効', () => {
    expect(isMeaningfulUserTurn({ transcript: 'a' })).toBe(false);
  });
  it('継続時間不明(0/未指定)なら文字数で判定', () => {
    expect(isMeaningfulUserTurn({ transcript: '今日は疲れています' })).toBe(true);
    expect(isMeaningfulUserTurn({ transcript: 'ん' })).toBe(false);
  });
});

describe('VAD設定（短い音で即割り込みしない）', () => {
  it('server_vad の threshold と無音判定が緩すぎない', () => {
    expect(COURSE_TURN_DETECTION.type).toBe('server_vad');
    expect(COURSE_TURN_DETECTION.threshold).toBeGreaterThanOrEqual(0.5);
    expect(COURSE_TURN_DETECTION.silence_duration_ms).toBeGreaterThanOrEqual(600);
    expect(MEANINGFUL_MIN_MS).toBeGreaterThanOrEqual(500);
  });
});

describe('開始案内（Feature 2）', () => {
  it('接続直後・未発話・未終了なら案内を出す', () => {
    expect(shouldShowGreetingGuide({ connected: true, hasMeaningfulUserTurn: false, ended: false })).toBe(true);
  });
  it('有効発話が来たら消す（雑音では消えない＝呼び出し側が isMeaningful で判定）', () => {
    expect(shouldShowGreetingGuide({ connected: true, hasMeaningfulUserTurn: true, ended: false })).toBe(false);
  });
  it('未接続・終了後は出さない', () => {
    expect(shouldShowGreetingGuide({ connected: false, hasMeaningfulUserTurn: false, ended: false })).toBe(false);
    expect(shouldShowGreetingGuide({ connected: true, hasMeaningfulUserTurn: false, ended: true })).toBe(false);
  });
  it('数秒無発話で1回だけ促す（繰り返さない）', () => {
    const base = { connected: true, hasMeaningfulUserTurn: false, tutorHasSpoken: false, secondsSinceConnected: 9 };
    expect(shouldNudgeGreeting({ ...base, alreadyNudged: false })).toBe(true);
    expect(shouldNudgeGreeting({ ...base, alreadyNudged: true })).toBe(false);
    expect(shouldNudgeGreeting({ ...base, secondsSinceConnected: 3, alreadyNudged: false })).toBe(false);
  });
});

describe('外国語の幻聴文字起こしの除外（2026-08-16 サマーさん報告）', () => {
  it('キリル文字・ラテン文字だけの「発話」は無効（エコー幻聴の実例）', () => {
    for (const t of ['Учительница', 'Caitríona.', 'Ivar.', 'Uspêlo.', 'Hello there my friend']) {
      expect(isMeaningfulUserTurn({ transcript: t, durationMs: 2000, shortAnswerExpected: false })).toBe(false);
    }
  });

  it('日本語・中国語の発話と英語の有効短答は通る', () => {
    expect(isMeaningfulUserTurn({ transcript: 'バドミントンを始めたばかりです', durationMs: 2000, shortAnswerExpected: false })).toBe(true);
    expect(isMeaningfulUserTurn({ transcript: '这个用日语怎么说', durationMs: 2000, shortAnswerExpected: false })).toBe(true);
    expect(isMeaningfulUserTurn({ transcript: 'OK', durationMs: 500, shortAnswerExpected: true })).toBe(true);
  });
});

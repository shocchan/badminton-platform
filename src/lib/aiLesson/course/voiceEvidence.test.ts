// 会話成立の材料の数え方（2026-09-11 CEO指示「実質的な会話が成立していない回は回数を消費しない」）。
// 成立したかどうかはサーバーが決める。ここでは「正しく数えて送れるか」だけを固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createVoiceEvidenceTracker, VOICE_EVIDENCE_HEARTBEAT_MS } from './voiceEvidence';

describe('接続時間', () => {
  it('つながっている間だけ数える（切断中・エラー画面の時間は含めない）', () => {
    const t = createVoiceEvidenceTracker();
    t.onConnected(1_000);
    expect(t.onDisconnected(11_000)).toBe(true);   // 10秒つながって切れた＝送る合図
    expect(t.snapshot(200_000).connectedMs).toBe(10_000); // エラー画面で3分待っても増えない
    t.onConnected(200_000);                          // 再接続
    expect(t.snapshot(205_000).connectedMs).toBe(15_000);
  });

  it('connected が2回続いても二重に数えない', () => {
    const t = createVoiceEvidenceTracker();
    t.onConnected(0);
    t.onConnected(5_000);
    expect(t.snapshot(10_000).connectedMs).toBe(10_000);
  });

  it('つながる前に切れた回は 0。切断の合図も出さない（送るものが無い）', () => {
    const t = createVoiceEvidenceTracker();
    expect(t.onDisconnected(5_000)).toBe(false);
    expect(t.snapshot(9_000).connectedMs).toBe(0);
  });
});

describe('発話の数', () => {
  it('AI のあいさつだけでは「生徒への応答」にならない', () => {
    const t = createVoiceEvidenceTracker();
    expect(t.onTutorTurn()).toBe(false);
    expect(t.snapshot(0)).toMatchObject({ tutorTurns: 1, userTurns: 0, aiRepliesAfterUser: 0, userSpeechStarts: 0 });
  });

  it('生徒が話し終えたあとの AI の発話を「応答」として数え、そのたびに送る合図を出す', () => {
    const t = createVoiceEvidenceTracker();
    t.onTutorTurn();                                    // あいさつ
    t.onUserSpeechStarted(); t.onUserSpeechEnded(); t.onMeaningfulUserTurn();
    expect(t.onTutorTurn()).toBe(true);
    expect(t.onTutorTurn()).toBe(false);                // 続けて話しても応答は増えない
    t.onUserSpeechStarted(); t.onUserSpeechEnded(); t.onMeaningfulUserTurn();
    expect(t.onTutorTurn()).toBe(true);                 // 2回目の応答も送る（サーバーが成立と言うまで）
    expect(t.snapshot(0)).toMatchObject({ tutorTurns: 4, userTurns: 2, aiRepliesAfterUser: 2, userSpeechStarts: 2 });
  });

  it('生徒の文字起こしが AI の返事より後に届いても、応答として数える（声の順番で数える）', () => {
    const t = createVoiceEvidenceTracker();
    t.onUserSpeechStarted(); t.onUserSpeechEnded();
    expect(t.onTutorTurn()).toBe(true);                 // 返事の文字起こしが先に届いた
    t.onMeaningfulUserTurn();                           // 生徒の文字起こしが後から届いた
    expect(t.snapshot(0)).toMatchObject({ userTurns: 1, aiRepliesAfterUser: 1 });
  });

  it('返事が再生される前に生徒が続けて話した（返事は止められた）ときは、その返事を応答に数えない', () => {
    const t = createVoiceEvidenceTracker();
    t.onUserSpeechStarted(); t.onUserSpeechEnded(); t.onMeaningfulUserTurn();   // 「こんにちは」…（間）
    t.onUserSpeechStarted();                                                     // 「よろしくお願いします」
    expect(t.onTutorTurn()).toBe(false);                                         // 止められた返事の文字起こし
    t.onUserSpeechEnded(); t.onMeaningfulUserTurn();
    expect(t.onTutorTurn()).toBe(true);                                          // 実際に聞こえた返事（最初の質問）
    expect(t.snapshot(0)).toMatchObject({ userTurns: 2, aiRepliesAfterUser: 1 });
  });

  it('停止・エラーで届く「話していない」だけでは応答待ちにしない（先生の切り替え後のあいさつを応答と数えない）', () => {
    const t = createVoiceEvidenceTracker();
    t.onUserSpeechEnded();                              // stop() / fail() が送る
    expect(t.onTutorTurn()).toBe(false);
    expect(t.snapshot(0).aiRepliesAfterUser).toBe(0);
  });

  it('咳・物音（声は拾ったが有効な発話にならない）のあとの AI の発話は、応答には数えるが生徒の発話には数えない', () => {
    const t = createVoiceEvidenceTracker();
    t.onUserSpeechStarted(); t.onUserSpeechEnded();
    t.onTutorTurn();
    expect(t.snapshot(0)).toMatchObject({ userTurns: 0, aiRepliesAfterUser: 1, userSpeechStarts: 1 });
  });
});

describe('判定をクライアントに持たない（判定は DB の ai_voice_conversation_established だけ）', () => {
  const SRC = readFileSync(new URL('./voiceEvidence.ts', import.meta.url), 'utf8');
  const VOICE = readFileSync(new URL('../../../components/ai-course/CourseVoiceLesson.tsx', import.meta.url), 'utf8');
  const SESSION = readFileSync(new URL('../voiceSession.ts', import.meta.url), 'utf8');

  it('しきい値（90秒・90000ms・往復2回）を書いていない', () => {
    for (const s of [SRC, VOICE]) {
      expect(s).not.toMatch(/90_?000|\b90\s*\*\s*1000\b/);
      expect(s).not.toMatch(/(userTurns|aiRepliesAfterUser)\s*>=\s*\d/);
    }
  });

  it('音声レッスンは材料をサーバーへ送り、サーバーの答え（established）だけを見る', () => {
    expect(VOICE).toMatch(/createVoiceEvidenceTracker\(\)/);
    expect(VOICE).toMatch(/courseRepository\.reportVoiceEvidence\(/);
    expect(VOICE).toMatch(/VOICE_EVIDENCE_HEARTBEAT_MS/);
    expect(VOICE).toMatch(/if \(speaking\) evidenceRef\.current\.onUserSpeechStarted\(\); else evidenceRef\.current\.onUserSpeechEnded\(\);/);
    // 切れたら、そこまでの材料を送る（エラー画面のまま閉じられても残る）
    expect(VOICE).toMatch(/else if \(evidenceRef\.current\.onDisconnected\(Date\.now\(\)\)\) reportEvidence\(\);/);
    // 生徒の文字起こしが遅れて届いた時点でも送る／先生の切り替えでも送る
    expect(VOICE).toMatch(/evidenceRef\.current\.onMeaningfulUserTurn\(\);\s*\n\s*\/\/[^\n]*\n\s*reportEvidence\(\);/);
    expect(VOICE).toMatch(/if \(evidenceRef\.current\.onDisconnected\(Date\.now\(\)\)\) reportEvidenceRef\.current\(\);/);
  });

  it('材料を送る版の画面であることを、トークンを取るときに伝える（送らない版の回はこれまでどおり消費される）', () => {
    expect(VOICE).toMatch(/reportsEvidence: true,/);
    expect(SESSION).toMatch(/reportsEvidence: opts\.reportsEvidence === true \? true : undefined,/);
  });

  it('送る間隔は短すぎない（DB を叩きすぎない）', () => {
    expect(VOICE_EVIDENCE_HEARTBEAT_MS).toBeGreaterThanOrEqual(10_000);
  });
});

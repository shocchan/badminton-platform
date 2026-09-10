/*
 * AI会話の割り込み方針（2026-09-10 Phase 7）。
 *
 * 守りたいこと:
 *   ・本番の既定は半二重のまま（CEO 確認まで変えない）。adaptive は QA／staging／明示の旗だけ
 *   ・先生の発話中の「あ」「咳」（短い音）では止まらない。明確な発話（一定時間続く）では止まる
 *   ・エコーの疑いが短時間に重なったら、**そのセッションだけ**半二重へ戻す
 *   ・WeChat 内ブラウザ×スピーカーは半二重で始める。イヤホンなら adaptive
 *   ・VAD の形は GA 形式（server_vad・interrupt_response は adaptive では false）
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INTERRUPTION, DEFAULT_ADAPTIVE_VAD, detectAudioEnvironment, resolveInterruptionMode, interruptionRuntimeFor,
  interruptionOverrideFromSearch, interruptionOverrideFrom, interruptionDebugFrom, rolloutStageOf, initialInterruptionState, onTutorSpeaking, onSpeechStarted, onSpeechStopped,
  confirmInterruption, onUserTranscriptAfterInterrupt, textOverlap,
} from './interruptionPolicy';

const cfg = interruptionRuntimeFor({ env: { inWeChat: false, headphonesLikely: true }, rollout: 'qa' });

describe('どの方式で始めるか', () => {
  it('**production の既定は半二重**（旗が無い限り変えない）', () => {
    expect(resolveInterruptionMode({ env: { inWeChat: false, headphonesLikely: true }, rollout: 'production' }).mode).toBe('half_duplex');
    expect(resolveInterruptionMode({ env: { inWeChat: false, headphonesLikely: true }, rollout: 'production', override: 'adaptive' }).mode).toBe('adaptive');
  });
  it('QA／staging: イヤホンは adaptive、WeChat×スピーカーは半二重、それ以外は adaptive', () => {
    expect(resolveInterruptionMode({ env: { inWeChat: true, headphonesLikely: true }, rollout: 'staging' }).mode).toBe('adaptive');
    expect(resolveInterruptionMode({ env: { inWeChat: true, headphonesLikely: null }, rollout: 'staging' }).mode).toBe('half_duplex');
    expect(resolveInterruptionMode({ env: { inWeChat: true, headphonesLikely: false }, rollout: 'qa' }).mode).toBe('half_duplex');
    expect(resolveInterruptionMode({ env: { inWeChat: false, headphonesLikely: null }, rollout: 'qa' }).mode).toBe('adaptive');
  });
  it('環境の検出（WeChat の UA・イヤホンのデバイス名）', () => {
    const wx = detectAudioEnvironment('Mozilla/5.0 (iPhone) MicroMessenger/8.0', []);
    expect(wx).toEqual({ inWeChat: true, headphonesLikely: null });
    expect(detectAudioEnvironment('Chrome', ['AirPods Pro', 'MacBook Pro Microphone']).headphonesLikely).toBe(true);
    expect(detectAudioEnvironment('Chrome', ['MacBook Pro Microphone']).headphonesLikely).toBe(false);
  });
  it('旗はタブの間だけ覚える（転送でクエリが消えても効く）・off で忘れる', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
    expect(interruptionOverrideFrom('?interrupt=adaptive', store)).toBe('adaptive');
    expect(interruptionOverrideFrom('', store)).toBe('adaptive');
    expect(interruptionOverrideFrom('?interrupt=off', store)).toBeNull();
    expect(interruptionOverrideFrom('', store)).toBeNull();
    expect(interruptionOverrideFrom('?interrupt=nope', store)).toBeNull();
    expect(interruptionDebugFrom('?interruptDebug=1', store)).toBe(true);
    expect(interruptionDebugFrom('', store)).toBe(true);
    expect(interruptionDebugFrom('?interruptDebug=0', store)).toBe(false);
    // 保存できない環境では URL だけ
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(interruptionOverrideFrom('?interrupt=adaptive', broken)).toBe('adaptive');
    expect(interruptionOverrideFrom('', null)).toBeNull();
  });

  it('旗と段階', () => {
    expect(interruptionOverrideFromSearch('?interrupt=adaptive')).toBe('adaptive');
    expect(interruptionOverrideFromSearch('?interrupt=nope')).toBeNull();
    expect(rolloutStageOf('study.kawabado.com')).toBe('production');
    expect(rolloutStageOf('staging.badminton-platform.pages.dev')).toBe('staging');
    expect(rolloutStageOf('localhost')).toBe('staging');
    expect(rolloutStageOf('study.kawabado.com', 'qa')).toBe('qa');
  });
  it('VAD は GA 形式で、adaptive では interrupt_response=false（止めるかはクライアントが決める）', () => {
    for (const p of [DEFAULT_ADAPTIVE_VAD.idle, DEFAULT_ADAPTIVE_VAD.speaking]) {
      expect(p.type).toBe('server_vad');
      expect(p.interrupt_response).toBe(false);
    }
    // 生徒の番は VAD が返事を作る。先生の発話中は作らない（無視した「あ」に返事をさせない）
    expect(DEFAULT_ADAPTIVE_VAD.idle.create_response).toBe(true);
    expect(DEFAULT_ADAPTIVE_VAD.speaking.create_response).toBe(false);
    expect(DEFAULT_ADAPTIVE_VAD.speaking.threshold).toBeGreaterThan(DEFAULT_ADAPTIVE_VAD.idle.threshold);
    expect(DEFAULT_ADAPTIVE_VAD.speaking.prefix_padding_ms).toBeGreaterThanOrEqual(DEFAULT_ADAPTIVE_VAD.idle.prefix_padding_ms);
    expect(DEFAULT_INTERRUPTION.minSpeechMs).toBeGreaterThanOrEqual(400);
  });
});

describe('先生の発話中の割り込み判断', () => {
  it('**「あ」（短い音）では止まらない**', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    const a = onSpeechStarted(s, 1000, cfg); s = a.state;
    expect(a.decision).toEqual({ kind: 'arm', fireAtMs: 1000 + cfg.minSpeechMs });
    const b = onSpeechStopped(s, 1200, cfg); s = b.state;
    expect(b.decision).toEqual({ kind: 'ignore' });
    // 武装が解けているので、あとから confirm が来ても止めない
    expect(confirmInterruption(s, 1000 + cfg.minSpeechMs).decision).toEqual({ kind: 'none' });
    expect(s.counters.ignored).toBe(1);
  });

  it('**明確な発話（続く音）では止まる**', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    s = onSpeechStarted(s, 1000, cfg).state;
    const c = confirmInterruption(s, 1000 + cfg.minSpeechMs); s = c.state;
    expect(c.decision).toEqual({ kind: 'interrupt' });
    expect(s.counters.valid).toBe(1);
    expect(s.lastInterruptAt).toBe(1000 + cfg.minSpeechMs);
  });

  it('先生が話していないときは武装しない（生徒の番＝通常のターン）', () => {
    const s = initialInterruptionState('adaptive');
    expect(onSpeechStarted(s, 1000, cfg).decision).toEqual({ kind: 'none' });
  });

  it('半二重のときは何も判断しない（従来どおりマイクを止める側で処理）', () => {
    const s = onTutorSpeaking(initialInterruptionState('half_duplex'), true);
    expect(onSpeechStarted(s, 1000, cfg).decision).toEqual({ kind: 'none' });
  });
});

describe('エコーの検知と fallback', () => {
  const tutor = '今日は何を食べましたか。朝ごはんの話を聞かせてください。';

  it('文の重なり（2-gram Jaccard）', () => {
    expect(textOverlap(tutor, tutor)).toBe(1);
    expect(textOverlap('パンを食べました', tutor)).toBeLessThan(0.3);
    expect(textOverlap('', tutor)).toBe(0);
  });

  it('割り込み直後の文字起こしが先生の発話と同じなら疑い。2回重なったら**このセッションだけ**半二重へ', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    s = onSpeechStarted(s, 1000, cfg).state;
    s = confirmInterruption(s, 1600).state;
    const r1 = onUserTranscriptAfterInterrupt(s, tutor, tutor, 2000, cfg); s = r1.state;
    expect(r1.decision).toEqual({ kind: 'none' });
    expect(s.counters.echoSuspects).toBe(1);
    expect(s.mode).toBe('adaptive');
    // 2回目
    s = onTutorSpeaking(s, true);
    s = onSpeechStarted(s, 5000, cfg).state;
    s = confirmInterruption(s, 5600).state;
    const r2 = onUserTranscriptAfterInterrupt(s, '', tutor, 6000, cfg); s = r2.state;   // 空の文字起こしも疑い
    expect(r2.decision).toEqual({ kind: 'fallback', to: 'half_duplex' });
    expect(s.mode).toBe('half_duplex');
    expect(s.counters.fallback).toBe(1);
  });

  it('本物の発話（先生と違う内容）は疑いにしない', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    s = onSpeechStarted(s, 1000, cfg).state;
    s = confirmInterruption(s, 1600).state;
    const r = onUserTranscriptAfterInterrupt(s, 'ちょっと待ってください、それはどういう意味ですか', tutor, 2000, cfg);
    expect(r.decision).toEqual({ kind: 'none' });
    expect(r.state.counters.echoSuspects).toBe(0);
    expect(r.state.lastInterruptAt).toBeNull();
  });

  it('疑いは時間窓の外では数えない', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    s = onSpeechStarted(s, 1000, cfg).state; s = confirmInterruption(s, 1600).state;
    s = onUserTranscriptAfterInterrupt(s, tutor, tutor, 2000, cfg).state;
    const later = 2000 + cfg.echoFallback.windowMs + 1;
    s = onTutorSpeaking(s, true);
    s = onSpeechStarted(s, later, cfg).state; s = confirmInterruption(s, later + 600).state;
    const r = onUserTranscriptAfterInterrupt(s, tutor, tutor, later + 800, cfg);
    expect(r.decision).toEqual({ kind: 'none' });
    expect(r.state.mode).toBe('adaptive');
  });
});

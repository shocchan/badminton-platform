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
  interruptionOverrideFromSearch, interruptionOverrideFrom, interruptionDebugFrom, interruptionMinSpeechFrom, rolloutStageOf, initialInterruptionState, onTutorSpeaking, onSpeechStarted, onSpeechStopped,
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

  it('割り込みとみなす長さを QA で変えられる（600〜4000ms・範囲外は無視・off で忘れる）', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
    expect(interruptionMinSpeechFrom('', store)).toBeNull();
    expect(interruptionMinSpeechFrom('?interruptMinMs=1200', store)).toBe(1200);
    expect(interruptionMinSpeechFrom('', store)).toBe(1200);
    expect(interruptionMinSpeechFrom('?interruptMinMs=100', store)).toBe(1200);
    expect(interruptionMinSpeechFrom('?interruptMinMs=abc', store)).toBe(1200);
    expect(interruptionMinSpeechFrom('?interruptMinMs=off', store)).toBeNull();
    expect(interruptionMinSpeechFrom('', store)).toBeNull();
    expect(interruptionMinSpeechFrom('?interruptMinMs=4000', null)).toBe(4000);
    expect(interruptionMinSpeechFrom('?interruptMinMs=4001', null)).toBeNull();
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
  // サーバーの speech_stopped は無音が silence_duration_ms 続いてから届く。判定時刻はそのぶん後ろにずらす
  const silence = cfg.vad.speaking.silence_duration_ms;
  const fireAt = (start: number) => start + cfg.minSpeechMs + silence;

  it('既定では 2 秒続けて話したときだけ割り込む（CEO 実機報告 2026-09-11「うんうんで止まる」）', () => {
    expect(DEFAULT_INTERRUPTION.minSpeechMs).toBe(2000);
    expect(cfg.minSpeechMs).toBe(2000);
  });

  it('**「あ」（短い音）では止まらない**', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    const a = onSpeechStarted(s, 1000, cfg); s = a.state;
    expect(a.decision).toEqual({ kind: 'arm', fireAtMs: fireAt(1000) });
    // 0.2 秒の「あ」＋無音ぶん → 終わりの合図は 0.9 秒後に届く
    const b = onSpeechStopped(s, 1000 + 200 + silence, cfg); s = b.state;
    expect(b.decision).toEqual({ kind: 'ignore' });
    // 武装が解けているので、あとから confirm が来ても止めない
    expect(confirmInterruption(s, fireAt(1000)).decision).toEqual({ kind: 'none' });
    expect(s.counters.ignored).toBe(1);
  });

  it('**「うんうん」（約0.8秒）でも止まらない**：終わりの合図が無音ぶん遅れて届いても、判定時刻より前に来る', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    s = onSpeechStarted(s, 1000, cfg).state;
    const stopAt = 1000 + 800 + silence;
    expect(stopAt).toBeLessThan(fireAt(1000));
    const b = onSpeechStopped(s, stopAt, cfg); s = b.state;
    expect(b.decision).toEqual({ kind: 'ignore' });
    expect(s.counters.valid).toBe(0);
    expect(s.counters.ignored).toBe(1);
  });

  it('**明確な発話（2 秒以上続く音）では止まる**', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    s = onSpeechStarted(s, 1000, cfg).state;
    const c = confirmInterruption(s, fireAt(1000)); s = c.state;
    expect(c.decision).toEqual({ kind: 'interrupt' });
    expect(s.counters.valid).toBe(1);
    expect(s.lastInterruptAt).toBe(fireAt(1000));
  });

  it('サーバーの実測（audio_end_ms − audio_start_ms）があればそれで判定する', () => {
    let s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    s = onSpeechStarted(s, 1000, cfg).state;
    // 合図が判定時刻より早く届いても、実際に 2.5 秒話していれば割り込み（時計のずれで取りこぼさない）
    const long = onSpeechStopped(s, 1500, cfg, 2500);
    expect(long.decision).toEqual({ kind: 'interrupt' });
    expect(long.state.counters.valid).toBe(1);
    // 実測 0.6 秒なら、到着が遅くても無視
    s = onSpeechStarted(onTutorSpeaking(long.state, true), 5000, cfg).state;
    expect(onSpeechStopped(s, 9000, cfg, 600).decision).toEqual({ kind: 'ignore' });
  });

  it('QA で判定の長さを変えると、判定時刻もそれに合わせて動く', () => {
    const quick = interruptionRuntimeFor({ env: { inWeChat: false, headphonesLikely: true }, rollout: 'qa' }, { ...DEFAULT_INTERRUPTION, minSpeechMs: 1200 });
    const s = onTutorSpeaking(initialInterruptionState('adaptive'), true);
    expect(onSpeechStarted(s, 1000, quick).decision).toEqual({ kind: 'arm', fireAtMs: 1000 + 1200 + silence });
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

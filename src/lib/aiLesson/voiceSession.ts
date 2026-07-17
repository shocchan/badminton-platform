// 音声レッスンのWebRTC通信層（OpenAI Realtime API）
//
// 責務: マイク取得 / ephemeral secret取得 / WebRTC接続 / oai-eventsデータチャネル /
//       文字起こしイベントの中継 / 割り込み検知 / まとめ移行シグナル / 安全な切断
// ここには React・学習判定・XP・レポートのロジックを置かない（UI側の責務）。
//
// セキュリティ: 通常のOPENAI_API_KEYはEdge Function内のみ。ここで扱うのは
// 短命のclient secret（ek_...）だけで、メモリ内でのみ保持し永続保存しない。

import { fetchWithTimeout } from '../payment';

export type VoiceSessionStatus =
  | 'idle'
  | 'requesting-mic' // マイク許可待ち
  | 'connecting'     // トークン取得〜WebRTC接続中
  | 'connected'      // 会話中
  | 'ended'          // 正常終了
  | 'error';

export type VoiceErrorKind = 'mic-denied' | 'token' | 'webrtc' | 'disconnected';

export interface VoicePlanPayload {
  themeLabel: string;
  estimatedLevel: string;
  zhSupport: string;
  correction: string;
  target: { label: string; example: string; zhMeaning: string; zhExample: string };
}

export interface VoiceSessionCallbacks {
  onStatus: (status: VoiceSessionStatus) => void;
  /** 生徒の文字起こし（isFinal=false は途中経過） */
  onUserTranscript: (text: string, isFinal: boolean) => void;
  /** ゆい先生の文字起こし（isFinal=false は途中経過） */
  onTutorTranscript: (text: string, isFinal: boolean) => void;
  onTutorSpeaking: (speaking: boolean) => void;
  onUserSpeaking: (speaking: boolean) => void;
  onError: (kind: VoiceErrorKind, message?: string) => void;
}

export interface VoiceSessionHandle {
  /** 残り約35秒で呼ぶ: session.updateでまとめ移行を指示する */
  sendWrapUpSignal: () => void;
  /** 接続を確実に閉じる（マイクtrack停止・PeerConnection close含む）。何度呼んでも安全 */
  stop: () => void;
  isActive: () => boolean;
}

const OPENAI_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

// 同一ブラウザでの重複接続防止（モジュールスコープで1本だけ）
let activeSession: { stop: () => void } | null = null;

interface StartOptions {
  code: string;
  plan: VoicePlanPayload;
  callbacks: VoiceSessionCallbacks;
}

export const startVoiceSession = async (opts: StartOptions): Promise<VoiceSessionHandle> => {
  // 既存セッションがあれば必ず閉じてから開始（連打・再入場対策）
  if (activeSession) {
    activeSession.stop();
    activeSession = null;
  }

  const { callbacks } = opts;
  let stopped = false;
  let status: VoiceSessionStatus = 'idle';
  let micStream: MediaStream | null = null;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let wrapUpInstructions: string | null = null;
  let responding = false;    // AIが応答生成中か
  let userSpeaking = false;  // 生徒が発話中か
  let wrapUpSent = false;

  const setStatus = (s: VoiceSessionStatus) => {
    if (stopped && s !== 'ended') return;
    status = s;
    callbacks.onStatus(s);
  };

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    try { dc?.close(); } catch { /* noop */ }
    try {
      pc?.getSenders().forEach((s) => s.track?.stop());
      pc?.close();
    } catch { /* noop */ }
    micStream?.getTracks().forEach((t) => t.stop());
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
    }
    micStream = null;
    pc = null;
    dc = null;
    audioEl = null;
    if (activeSession === session) activeSession = null;
  };

  const stop = () => {
    if (stopped) return;
    cleanup();
    status = 'ended';
    callbacks.onStatus('ended');
  };

  const fail = (kind: VoiceErrorKind, message?: string) => {
    if (stopped) return;
    cleanup();
    status = 'error';
    callbacks.onStatus('error');
    callbacks.onError(kind, message);
  };

  const send = (event: Record<string, unknown>) => {
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(event));
    }
  };

  const session: VoiceSessionHandle = {
    sendWrapUpSignal: () => {
      if (wrapUpSent || stopped || !wrapUpInstructions) return;
      wrapUpSent = true;
      // 人格・ルールを保ったまま「まとめ移行を最優先」にしたinstructionsへ差し替え
      send({ type: 'session.update', session: { instructions: wrapUpInstructions } });
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: '残り時間は約35秒です。まとめへ移行してください。新しい質問はしないでください。' }],
        },
      });
      // AIが話しておらず生徒も話していなければ、まとめ発話を即時開始させる
      if (!responding && !userSpeaking) {
        send({ type: 'response.create' });
      }
    },
    stop,
    isActive: () => !stopped,
  };
  activeSession = session;

  // ── 1. マイク許可 ──
  setStatus('requesting-mic');
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    fail('mic-denied');
    return session;
  }
  if (stopped) { micStream.getTracks().forEach((t) => t.stop()); return session; }

  // ── 2. ephemeral client secret 取得（Edge Function経由） ──
  setStatus('connecting');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) {
    fail('token', 'supabase_url_missing');
    return session;
  }
  let clientSecret: string;
  let model: string;
  try {
    const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/ai-lesson-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: opts.code, plan: opts.plan }),
    }, 15000);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      fail('token', err.error ?? `http_${res.status}`);
      return session;
    }
    const data = (await res.json()) as {
      clientSecret: string; model: string; wrapUpInstructions?: string;
    };
    clientSecret = data.clientSecret;
    model = data.model;
    wrapUpInstructions = data.wrapUpInstructions ?? null;
  } catch {
    fail('token', 'network');
    return session;
  }
  if (stopped) return session;

  // ── 3. WebRTC接続 ──
  try {
    pc = new RTCPeerConnection();

    // AI音声の再生先（DOMに追加。iOS Safariはユーザー操作起点なので自動再生可）
    audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
    pc.ontrack = (e) => {
      if (audioEl) audioEl.srcObject = e.streams[0];
    };

    micStream.getTracks().forEach((track) => pc?.addTrack(track, micStream as MediaStream));

    pc.onconnectionstatechange = () => {
      const st = pc?.connectionState;
      if (st === 'failed' || st === 'disconnected' || st === 'closed') {
        if (!stopped && status === 'connected') fail('disconnected');
      }
    };

    // ── 4. イベント用データチャネル ──
    dc = pc.createDataChannel('oai-events');

    let tutorBuffer = '';
    dc.onmessage = (e) => {
      let ev: { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
      try {
        ev = JSON.parse(e.data as string);
      } catch {
        return;
      }
      switch (ev.type) {
        // 生徒の文字起こし
        case 'conversation.item.input_audio_transcription.delta':
          if (ev.delta) callbacks.onUserTranscript(ev.delta, false);
          break;
        case 'conversation.item.input_audio_transcription.completed':
          callbacks.onUserTranscript(ev.transcript ?? '', true);
          break;
        // ゆい先生の文字起こし
        case 'response.output_audio_transcript.delta':
          tutorBuffer += ev.delta ?? '';
          callbacks.onTutorTranscript(tutorBuffer, false);
          break;
        case 'response.output_audio_transcript.done':
          callbacks.onTutorTranscript(ev.transcript ?? tutorBuffer, true);
          tutorBuffer = '';
          break;
        // 発話状態（生徒の割り込みはOpenAI側の interrupt_response で自動処理される）
        case 'input_audio_buffer.speech_started':
          userSpeaking = true;
          callbacks.onUserSpeaking(true);
          break;
        case 'input_audio_buffer.speech_stopped':
          userSpeaking = false;
          callbacks.onUserSpeaking(false);
          break;
        case 'output_audio_buffer.started':
          callbacks.onTutorSpeaking(true);
          break;
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          callbacks.onTutorSpeaking(false);
          break;
        case 'response.created':
          responding = true;
          break;
        case 'response.done':
          responding = false;
          break;
        case 'error':
          // 内容はUI表示用の種別のみ。会話継続可能なエラーもあるため切断はしない
          console.warn('realtime event error:', ev.error?.message ?? 'unknown');
          break;
      }
    };
    dc.onopen = () => {
      if (!stopped) setStatus('connected');
    };
    dc.onclose = () => {
      if (!stopped && status === 'connected') fail('disconnected');
    };

    // ── 5. SDP offer → OpenAI → answer ──
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpRes = await fetchWithTimeout(`${OPENAI_CALLS_URL}?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    }, 15000);
    if (!sdpRes.ok) {
      fail('webrtc', `sdp_${sdpRes.status}`);
      return session;
    }
    const answerSdp = await sdpRes.text();
    if (stopped) return session;
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  } catch {
    fail('webrtc');
    return session;
  }

  return session;
};

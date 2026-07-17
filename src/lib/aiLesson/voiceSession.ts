// 音声レッスンのWebRTC通信層（OpenAI Realtime API）
//
// 責務: マイク取得 / ephemeral secret取得 / WebRTC接続 / oai-eventsデータチャネル /
//       文字起こしイベントの中継 / finish_lessonツール検知 / まとめ移行シグナル / 安全な切断
// ここには React・学習判定・XP・レポートのロジックを置かない（UI側の責務）。
//
// 設計上の要点:
// - startVoiceSession はハンドルを「同期的に」返す。接続処理は内部で非同期に進むため、
//   接続完了前でも stop() で確実に後片付けできる（マイク残留バグの原因だった非同期返却を廃止）
// - cleanup は冪等（何度呼ばれても安全）。全終了経路（正常終了/エラー/離脱/unmount/切替）で共通
// - 終了後は一切のイベント中継・送信を止める（stopped ガード）
//
// セキュリティ: 通常のOPENAI_API_KEYはEdge Function内のみ。ここで扱うのは
// 短命のclient secret（ek_...）だけで、メモリ内でのみ保持し永続保存しない。

import { fetchWithTimeout } from '../payment';

export type VoiceSessionStatus =
  | 'idle'
  | 'requesting-mic' // マイク許可待ち
  | 'connecting'     // トークン取得〜WebRTC接続中
  | 'connected'      // 会話中
  | 'ended'          // 終了
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
  onUserTranscript: (text: string, isFinal: boolean) => void;
  onTutorTranscript: (text: string, isFinal: boolean) => void;
  onTutorSpeaking: (speaking: boolean) => void;
  onUserSpeaking: (speaking: boolean) => void;
  onError: (kind: VoiceErrorKind, message?: string) => void;
  /** ゆい先生が finish_lesson ツールを呼び、最終音声の再生完了を検出した時に1回だけ発火 */
  onFinishLesson: (reason: string) => void;
}

export interface SendCueOptions {
  /** まとめ移行用instructionsへ session.update で差し替える */
  switchToWrapUp?: boolean;
  /** AIが応答中でなく生徒も話していなければ response.create で即時発話させる */
  respondIfIdle?: boolean;
}

export interface VoiceSessionHandle {
  /** システム指示（時間管理・まとめ移行・終了依頼）をAIへ送る */
  sendCue: (text: string, opts?: SendCueOptions) => void;
  /** 接続を確実に閉じる（マイクtrack停止・PeerConnection close含む）。冪等 */
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

export const startVoiceSession = (opts: StartOptions): VoiceSessionHandle => {
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
  let responding = false;      // AIが応答生成中か
  let userSpeaking = false;    // 生徒が発話中か
  let audioPlaying = false;    // AI音声を再生中か
  let finishReason: string | null = null; // finish_lesson 受信済みなら理由
  let finishFired = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };

  const setStatus = (s: VoiceSessionStatus) => {
    if (stopped && s !== 'ended') return;
    status = s;
    callbacks.onStatus(s);
  };

  // ページ離脱時も必ずマイクを解放する
  const onPageHide = () => cleanup();

  /** 冪等な後片付け。全終了経路がここを通る */
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearTimeout);
    timers.clear();
    window.removeEventListener('pagehide', onPageHide);
    if (dc) {
      dc.onmessage = null;
      dc.onopen = null;
      dc.onclose = null;
      try { dc.close(); } catch { /* noop */ }
    }
    if (pc) {
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.getSenders().forEach((s) => s.track?.stop());
        pc.close();
      } catch { /* noop */ }
    }
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
    responding = false;
    userSpeaking = false;
    audioPlaying = false;
    if (activeSession === session) activeSession = null;
  };

  const stop = () => {
    if (stopped) return;
    // UIへ状態を反映してから片付ける（speaking/listening 表示を確実に落とす）
    callbacks.onTutorSpeaking(false);
    callbacks.onUserSpeaking(false);
    cleanup();
    status = 'ended';
    callbacks.onStatus('ended');
  };

  const fail = (kind: VoiceErrorKind, message?: string) => {
    if (stopped) return;
    callbacks.onTutorSpeaking(false);
    callbacks.onUserSpeaking(false);
    cleanup();
    status = 'error';
    callbacks.onStatus('error');
    callbacks.onError(kind, message);
  };

  const send = (event: Record<string, unknown>) => {
    if (stopped) return;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(event));
    }
  };

  /** finish_lesson 受信後、最終音声の再生完了を待ってから発火する */
  const fireFinishIfReady = () => {
    if (stopped || finishFired || finishReason === null) return;
    if (audioPlaying) return; // output_audio_buffer.stopped 側で再度呼ばれる
    finishFired = true;
    callbacks.onFinishLesson(finishReason);
  };

  const requestFinish = (reason: string) => {
    if (stopped || finishReason !== null) return;
    finishReason = reason;
    // 音声がまだ始まっていない（or 既に終わっている）場合の短い猶予後チェック
    later(fireFinishIfReady, 1500);
    // 音声完了イベントを取りこぼした場合の安全弁
    later(() => {
      if (!finishFired && !stopped && finishReason !== null) {
        finishFired = true;
        callbacks.onFinishLesson(finishReason);
      }
    }, 20000);
  };

  const session: VoiceSessionHandle = {
    sendCue: (text, cueOpts) => {
      if (stopped) return;
      if (cueOpts?.switchToWrapUp && wrapUpInstructions) {
        send({ type: 'session.update', session: { instructions: wrapUpInstructions } });
      }
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text }],
        },
      });
      // 生徒の発話途中には音声をかぶせない
      if (cueOpts?.respondIfIdle && !responding && !userSpeaking && !audioPlaying) {
        send({ type: 'response.create' });
      }
    },
    stop,
    isActive: () => !stopped,
  };
  activeSession = session;
  window.addEventListener('pagehide', onPageHide);

  // ── 接続処理（非同期。ハンドルは既に返却済みなので、途中で stop されたら即中断） ──
  const connect = async () => {
    // 1. マイク許可
    setStatus('requesting-mic');
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail('mic-denied');
      return;
    }
    if (stopped) { micStream?.getTracks().forEach((t) => t.stop()); return; }

    // 2. ephemeral client secret 取得（Edge Function経由）
    setStatus('connecting');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!supabaseUrl) {
      fail('token', 'supabase_url_missing');
      return;
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
        return;
      }
      const data = (await res.json()) as {
        clientSecret: string; model: string; wrapUpInstructions?: string;
      };
      clientSecret = data.clientSecret;
      model = data.model;
      wrapUpInstructions = data.wrapUpInstructions ?? null;
    } catch {
      fail('token', 'network');
      return;
    }
    if (stopped) return;

    // 3. WebRTC接続
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

      // 4. イベント用データチャネル
      dc = pc.createDataChannel('oai-events');

      let tutorBuffer = '';
      dc.onmessage = (e) => {
        if (stopped) return; // 終了後は文字起こし・ログ追加を一切行わない
        let ev: {
          type?: string; delta?: string; transcript?: string;
          item?: { type?: string; name?: string; arguments?: string };
          error?: { message?: string };
        };
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
          // 発話状態（割り込みはOpenAI側の interrupt_response で処理される）
          case 'input_audio_buffer.speech_started':
            userSpeaking = true;
            callbacks.onUserSpeaking(true);
            break;
          case 'input_audio_buffer.speech_stopped':
            userSpeaking = false;
            callbacks.onUserSpeaking(false);
            break;
          case 'output_audio_buffer.started':
            audioPlaying = true;
            callbacks.onTutorSpeaking(true);
            break;
          case 'output_audio_buffer.stopped':
          case 'output_audio_buffer.cleared':
            audioPlaying = false;
            callbacks.onTutorSpeaking(false);
            fireFinishIfReady(); // finish_lesson 受信済みなら最終音声完了として発火
            break;
          case 'response.created':
            responding = true;
            break;
          case 'response.done':
            responding = false;
            break;
          // レッスン終了ツール（自然言語ではなく tool call で終了を明示させる）
          case 'response.output_item.done':
            if (ev.item?.type === 'function_call' && ev.item.name === 'finish_lesson') {
              let reason = 'completed';
              try {
                const args = JSON.parse(ev.item.arguments ?? '{}') as { reason?: string };
                if (args.reason) reason = args.reason;
              } catch { /* 引数不正でも completed 扱い */ }
              requestFinish(reason);
            }
            break;
          case 'error':
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

      // 5. SDP offer → OpenAI → answer
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
        return;
      }
      const answerSdp = await sdpRes.text();
      if (stopped) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch {
      fail('webrtc');
    }
  };

  void connect();
  return session;
};

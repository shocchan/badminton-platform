// 音声レッスンの「話している／聞いている」を落ち着いて可視化する。
// - 翔子先生が話す: ゆっくり広がる波紋（青）
// - 生徒が話している: 波紋（緑）
// - 接続中で待ち: 柔らかい呼吸のリング（緑）
// - 未接続: 静かなグレー
// アニメは index.css 側で prefers-reduced-motion により自動無効。

import { Mic, Volume2 } from 'lucide-react';

export type VoicePulseStatus = 'idle' | 'connecting' | 'tutorSpeaking' | 'userSpeaking' | 'listening';

interface Props {
  status: VoicePulseStatus;
  /** 大きめ表示（PC右パネル用） */
  big?: boolean;
}

export const VoicePulse = ({ status, big = false }: Props) => {
  const size = big ? 'w-14 h-14' : 'w-12 h-12';
  const icon = big ? 'w-6 h-6' : 'w-5 h-5';
  const tutor = status === 'tutorSpeaking';
  const user = status === 'userSpeaking';
  const listening = status === 'listening';
  const rippling = tutor || user;
  const ring = tutor ? 'bg-blue-400' : 'bg-emerald-400';
  const core = status === 'idle' || status === 'connecting'
    ? 'bg-gray-100 text-gray-400'
    : tutor ? 'bg-blue-100 text-blue-600' : 'bg-emerald-50 text-emerald-600';

  return (
    <div className={`relative ${size} shrink-0`}>
      {rippling && (
        <>
          <span className={`absolute inset-0 rounded-full ${ring} voice-ripple`} aria-hidden />
          <span className={`absolute inset-0 rounded-full ${ring} voice-ripple-2`} aria-hidden />
        </>
      )}
      <div className={`relative ${size} rounded-full flex items-center justify-center ${core} ${listening ? 'voice-breathe' : ''}`}>
        {tutor ? <Volume2 className={icon} /> : <Mic className={icon} />}
      </div>
    </div>
  );
};

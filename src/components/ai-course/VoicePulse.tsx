// 音声レッスンの「話している／聞いている」を翔子先生の顔で可視化する。
// - 翔子先生が話す: 話している表情＋ゆっくり広がる青い波紋
// - 生徒が話している: 穏やかな表情（聞いている）＋緑の波紋
// - 接続中で待ち: 穏やかな表情＋柔らかい呼吸
// - 未接続: 穏やかな表情（静止・やや淡く）
// アニメは index.css 側で prefers-reduced-motion により自動無効。

import { ShokoAvatar } from './ShokoAvatar';

export type VoicePulseStatus = 'idle' | 'connecting' | 'tutorSpeaking' | 'userSpeaking' | 'listening';

interface Props {
  status: VoicePulseStatus;
  /** 大きめ表示（PC右パネル用） */
  big?: boolean;
}

export const VoicePulse = ({ status, big = false }: Props) => {
  const px = big ? 56 : 48;
  const box = big ? 'w-14 h-14' : 'w-12 h-12';
  const tutor = status === 'tutorSpeaking';
  const user = status === 'userSpeaking';
  const listening = status === 'listening';
  const rippling = tutor || user;
  const ring = tutor ? 'bg-blue-400' : 'bg-emerald-400';
  const dim = status === 'idle';

  return (
    <div className={`relative ${box} shrink-0`}>
      {rippling && (
        <>
          <span className={`absolute inset-0 rounded-full ${ring} voice-ripple`} aria-hidden />
          <span className={`absolute inset-0 rounded-full ${ring} voice-ripple-2`} aria-hidden />
        </>
      )}
      <ShokoAvatar
        size={px}
        expression={tutor ? 'speaking' : 'neutral'}
        labeled={false}
        className={`relative ${listening ? 'voice-breathe' : ''} ${dim ? 'opacity-70' : ''} ${tutor ? 'ring-2 ring-blue-200' : ''}`}
      />
    </div>
  );
};

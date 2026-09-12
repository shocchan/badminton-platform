import { useState } from 'react';
import { Flag } from 'lucide-react';
import { ADV_AVATARS, avatarStyleOf, type AdvAvatarStyle } from '../../../lib/aiLesson/course/adventure/advAvatar';

/** Fixed CSS size stays inside the node hit target even on a narrow phone. */
export const AdvMapTraveler = ({ style, reaction }: { style?: AdvAvatarStyle; reaction?: string | null }) => {
  const selected = avatarStyleOf(style);
  const [failed, setFailed] = useState<string | null>(null);
  if (selected === 'flag') return null;
  if (failed === selected) return <Flag data-adv-traveler="flag" className="pointer-events-none h-6 w-6 text-blue-600" aria-hidden />;
  const a = ADV_AVATARS[selected].map;
  return <img key={`${selected}-${reaction ?? ''}`} data-adv-traveler={selected}
    src={a.webp1x} srcSet={`${a.webp1x} 1x, ${a.webp2x} 2x`} width={32} height={48}
    alt="" aria-hidden decoding="async" onError={() => setFailed(selected)}
    className="kb-map-traveler pointer-events-none absolute bottom-1 h-10 w-7 object-contain" />;
};

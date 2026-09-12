import { useState } from 'react';
import { LandmarkScene } from './AdvMapLandmarks';
import { HOME_HEROES } from '../../../lib/aiLesson/course/adventure/advHomeAssets';
import type { LandmarkKind, MapTone } from '../../../lib/aiLesson/course/adventure/advMapModel';

/** Reuse the established town artwork: same world, no extra image downloads per tone. */
const SCENE: Record<LandmarkKind, string> = {
  camp: 'minato', bridge: 'katari', ruins: 'katachi', gate: 'hataraki', tower: 'sorano',
  library: 'hinode', castle: 'hinode', village: 'hinode', road: 'omoide', hill: 'hinode',
  avenue: 'yukari', town: 'ichiba', plaza: 'toorimichi', mountain: 'sorano',
  crossroad: 'toorimichi', forest: 'yukari', city: 'hataraki',
};
export const AdvRegionScene = ({ kind, tone, fogged = false, className = '' }: {
  kind: LandmarkKind; tone: MapTone; fogged?: boolean; className?: string;
}) => {
  const a = HOME_HEROES[SCENE[kind]];
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === a.webp1x) return <LandmarkScene kind={kind} tone="meadow" fogged={fogged} className={className} />;
  return <span className={`relative block overflow-hidden bg-[#FBF5EC] ${className}`} aria-hidden data-region-scene={SCENE[kind]} data-tone={tone}>
    <img src={a.webp1x} srcSet={`${a.webp1x} 576w, ${a.webp2x} 1152w`} sizes="(max-width: 600px) 100vw, 544px"
      width={a.width} height={a.height} alt="" loading="lazy" decoding="async"
      onError={() => setFailed(a.webp1x)} className="h-full w-full object-cover object-[65%_center]" />
    {fogged && <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-100/75 to-white/20" />}
  </span>;
};

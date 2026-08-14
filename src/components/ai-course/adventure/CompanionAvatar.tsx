// 旅の相棒のアバター表示（共有）。
// 正式アセット（public/images/ai-course/companions/<id>.webp）を表示し、
// 未配置・読込失敗時はキャラ色のモノグラムSVGへfallbackする。
// 相棒の絵はすべてここを通す（参照をバラけさせない・保守のため）。
import { useState } from 'react';
import { companionById, companionImageSrc, companionSvg } from '../../../lib/aiLesson/course/adventure/advCompanion';
import type { AdvCompanionId } from '../../../lib/aiLesson/course/adventure/advTypes';

export function CompanionAvatar({ id, size = 48, className = '' }: {
  id: AdvCompanionId; size?: number; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const c = companionById(id);
  if (failed) {
    return (
      <span className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }}
        aria-label={c.nameJa} dangerouslySetInnerHTML={{ __html: companionSvg(id) }} />
    );
  }
  return (
    <img src={companionImageSrc(id)} alt={c.nameJa} width={size} height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => setFailed(true)} />
  );
}

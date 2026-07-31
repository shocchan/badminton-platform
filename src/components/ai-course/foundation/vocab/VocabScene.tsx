// Phase B-4: 語彙イラストの描画。specを受け取ってSVGを組み立てるだけの薄い層。
//
// 「文字を描かない」を機構として守るため、この描画器はテキスト要素を一切出さない。
// 意味は場所・人物のポーズ・小物・方向で表し、altは支援技術のためだけに使う。
import { Place, Figure, Prop, Arrow, SizePair, Bubble } from './vocabSceneKit';
import { SCENE_W, SCENE_H, C } from './vocabSceneTokens';
import type { PlaceKey, Pose, Mood, PropKey, Dir } from './vocabSceneTokens';

export interface VocabSceneSpec {
  itemId: string;
  place: PlaceKey;
  figures?: { x: number; y?: number; dir?: Dir; pose?: Pose; mood?: Mood; color?: string; scale?: number }[];
  props?: { kind: PropKey; x: number; y: number; scale?: number; dir?: Dir }[];
  arrows?: { x: number; y: number; dir: 'left' | 'right' | 'up' | 'down'; length?: number }[];
  sizePair?: { x: number; y: number; big: 'left' | 'right' };
  bubble?: { x: number; y: number; kind?: 'speech' | 'think'; prop?: PropKey };
  /** 支援技術向けの説明。正解そのものは書かない（§43） */
  altJa: string;
  altZh: string;
}

export const VocabScene = ({ spec, lang, className = '', decorative = false }: {
  spec: VocabSceneSpec; lang: 'ja' | 'zh'; className?: string; decorative?: boolean;
}) => {
  const alt = lang === 'zh' ? spec.altZh : spec.altJa;
  return (
    <svg
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      className={className}
      width="100%" height="100%"
      preserveAspectRatio="xMidYMid slice"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : alt}
    >
      <Place place={spec.place} />
      {spec.sizePair && <SizePair {...spec.sizePair} />}
      {spec.props?.map((p, i) => <Prop key={`p${i}`} {...p} />)}
      {spec.figures?.map((f, i) => <Figure key={`f${i}`} {...f} />)}
      {spec.arrows?.map((a, i) => <Arrow key={`a${i}`} {...a} />)}
      {spec.bubble && (
        <Bubble x={spec.bubble.x} y={spec.bubble.y} kind={spec.bubble.kind} fill={C.paper}>
          {spec.bubble.prop && <Prop kind={spec.bubble.prop} x={0} y={0} scale={0.55} />}
        </Bubble>
      )}
    </svg>
  );
};

export default VocabScene;

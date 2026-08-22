// 冒険の世界地図・画像素材のマニフェスト（2026-08-22・画像差し替えの土台）。
//
// - 画像は ChatGPT が生成し、`scripts/ai-course/optimize-map-images.mjs` で WebP/AVIF 化して
//   `public/ai-course/map/` に置く（手順: docs/ai-course/design/INTEGRATION.md）
// - ここは **パスと寸法だけ**。座標（ノード・道・旗）は advWorldSpine の viewBox 360×600 を使い続ける
// - 画像が無い/404 のときは AdvWorldMapImage が旧SVG（AdvWorldMap）へ自動フォールバックする
export interface WorldMapBackgroundAsset {
  /** 1x（CSS幅 ≤ 720px 想定） */
  webp1x: string;
  /** 2x（Retina。1440×2400） */
  webp2x: string;
  /** AVIF は任意。**両方そろったときだけ** <source type="image/avif"> を出す（片方欠けると対応ブラウザが 404 → SVG へ落ちるため） */
  avif1x?: string;
  avif2x?: string;
  /** <img width/height>（1x の実寸）。縦横比 3:5 を固定して CLS を防ぐ */
  width: number;
  height: number;
}

/** 背景 1 枚（3:5・非透過）。docs/ai-course/design/before/safe-area.md §5 #1 */
export const WORLD_MAP_BG: WorldMapBackgroundAsset = {
  webp1x: '/ai-course/map/world-bg@1x.webp',
  webp2x: '/ai-course/map/world-bg@2x.webp',
  // AVIF を置いたらコメントを外す（optimize-map-images.mjs --avif で生成される）
  // avif1x: '/ai-course/map/world-bg@1x.avif',
  // avif2x: '/ai-course/map/world-bg@2x.avif',
  width: 720,
  height: 1200,
};

/** 画像の論理縦横比（viewBox 360×600 と同じ 3:5）。会話クロップは下半分 = 6:5 */
export const WORLD_MAP_ASPECT = { full: '3 / 5', conversation: '6 / 5' } as const;

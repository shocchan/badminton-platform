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
  avif1x: '/ai-course/map/world-bg@1x.avif',
  avif2x: '/ai-course/map/world-bg@2x.avif',
  // 実寸（ChatGPT出力1024×1536を半分にした1x）。枠の比率は viewBox 3:5 が決め、画像は cover で中央トリミング
  width: 512,
  height: 768,
};

/** 画像の論理縦横比（viewBox 360×600 と同じ 3:5）。会話クロップは下半分 = 6:5 */
export const WORLD_MAP_ASPECT = { full: '3 / 5', conversation: '6 / 5' } as const;

/**
 * ランドマークタイル（透過 WebP・白地から切り抜き）。背景の上・道やノードの下に SVG <image> で置く。
 * anchor は viewBox 360×600 を 0〜1 に正規化した「タイル底辺中央」の位置（docs/ai-course/design/DESIGN_BRIEF.md §3-7）。
 * widthFrac は地図幅に対するタイル幅。高さは width/height の実比率から出す（切り抜き後の実寸を入れる）。
 * 画像が無い/404 のタイルはそのタイルだけ消える（地図全体は落とさない）。
 */
export interface WorldMapTileAsset {
  id: string;
  webp1x: string;
  webp2x: string;
  /** 2x の実寸（縦横比の計算に使う） */
  width: number;
  height: number;
  anchor: readonly [number, number];
  widthFrac: number;
}

export const WORLD_MAP_TILES: readonly WorldMapTileAsset[] = [
  // ②-1 ミナト（2026-08-22 採用 v1）。背景A-v3の港の出っ張り（画面下中央）に底辺を合わせる
  { id: 'minato', webp1x: '/ai-course/map/tile-minato@1x.webp', webp2x: '/ai-course/map/tile-minato@2x.webp',
    width: 1024, height: 517, anchor: [0.43, 0.955], widthFrac: 0.40 },
];

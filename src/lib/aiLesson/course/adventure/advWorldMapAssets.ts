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
  // 座標は背景A-v3（public/ai-course/map/world-bg）の地形に合わせて実測で決めた（ブリーフ§3-7 の初期値から調整）。
  // 背景を差し替えたら staging のスクショで必ず合わせ直す。
  // ②-1 ミナト（v1）。港の出っ張り（画面下中央）の先端に。出発ノードはこの正面に立つ
  { id: 'minato', webp1x: '/ai-course/map/tile-minato@1x.webp', webp2x: '/ai-course/map/tile-minato@2x.webp',
    width: 1024, height: 517, anchor: [0.53, 0.84], widthFrac: 0.24 },
  // ②-2 ヒノデ台（v1）。河口の右・線路の下の畑
  { id: 'hinode', webp1x: '/ai-course/map/tile-hinode@1x.webp', webp2x: '/ai-course/map/tile-hinode@2x.webp',
    width: 1024, height: 874, anchor: [0.69, 0.80], widthFrac: 0.16 },
  // ②-3 トオリミチ（v1）。右側の線路の上に駅を置く
  { id: 'toorimichi', webp1x: '/ai-course/map/tile-toorimichi@1x.webp', webp2x: '/ai-course/map/tile-toorimichi@2x.webp',
    width: 1024, height: 754, anchor: [0.84, 0.72], widthFrac: 0.16 },
  // ②-4 イチバ通り（v1）。川の左の平野（区画畑）の左寄り。霧ノード (0.34,0.52) の霧パフに隠れない位置
  { id: 'ichiba', webp1x: '/ai-course/map/tile-ichiba@1x.webp', webp2x: '/ai-course/map/tile-ichiba@2x.webp',
    width: 1024, height: 637, anchor: [0.20, 0.68], widthFrac: 0.17 },
  // ②-5 ユカリの森A（v1）。背景の左右にはもう森が描かれているので、道が通る中央の草地に1か所だけ置く
  { id: 'yukari-a', webp1x: '/ai-course/map/tile-yukari-a@1x.webp', webp2x: '/ai-course/map/tile-yukari-a@2x.webp',
    width: 1024, height: 810, anchor: [0.44, 0.52], widthFrac: 0.16 },
  // ②-7 ハタラキ街（v1・A/B の 2 案目＝低コントラストの方を採用）。高地の右、川の左。霧ノード (0.71,0.30) がこの上に乗る
  { id: 'hataraki', webp1x: '/ai-course/map/tile-hataraki@1x.webp', webp2x: '/ai-course/map/tile-hataraki@2x.webp',
    width: 1024, height: 843, anchor: [0.70, 0.36], widthFrac: 0.18 },
  // ②-8 カタチの遺跡（v1）。高地の左。霧ノード (0.32,0.22) がこの上に乗る（未解放のうちは霧に隠れる）
  { id: 'katachi', webp1x: '/ai-course/map/tile-katachi@1x.webp', webp2x: '/ai-course/map/tile-katachi@2x.webp',
    width: 1024, height: 697, anchor: [0.28, 0.28], widthFrac: 0.18 },
  // ②-9 ソラノ塔（v1・縦長）。世界の頂。塔だけは高さで見せるので widthFrac は小さく、縦に伸びる
  { id: 'sorano', webp1x: '/ai-course/map/tile-sorano@1x.webp', webp2x: '/ai-course/map/tile-sorano@2x.webp',
    width: 769, height: 1390, anchor: [0.60, 0.175], widthFrac: 0.13 },
];

/**
 * 現在地マーカー（③）。ノードの HTML ボタン（リング・バッジ・aria）はそのままで、その**下**に絵だけ敷く。
 * heightVb は viewBox 360×600 での表示高さ。旅人の足元がノード座標に来る。
 * CEO 未確認のため既定は traveler（3a）。flag（3b）は同じ形で差し替えられるように両方持つ。
 */
export interface WorldMapMarkerAsset {
  webp1x: string;
  webp2x: string;
  width: number;
  height: number;
  /** viewBox 単位の表示高さ */
  heightVb: number;
}

export const WORLD_MAP_MARKERS = {
  /** 3a 旅人の後ろ姿（顔なし） */
  traveler: { webp1x: '/ai-course/map/marker-traveler@1x.webp', webp2x: '/ai-course/map/marker-traveler@2x.webp',
    width: 256, height: 513, heightVb: 34 },
  /** 3b 青い旗（無地） */
  flag: { webp1x: '/ai-course/map/marker-flag@1x.webp', webp2x: '/ai-course/map/marker-flag@2x.webp',
    width: 256, height: 373, heightVb: 30 },
} as const satisfies Record<string, WorldMapMarkerAsset>;

/**
 * 状態台座（⑤完了・次・未着手／⑥ロック）。ノードの足元に敷く絵。
 * 状態の**意味**は今までどおり HTML 側（バッジ記号・aria-label）が持つ。ここは装飾。
 * 画像が無い状態では TileLayer 側が描かないだけで、地図も操作も変わらない。
 */
export const WORLD_MAP_PEDESTALS = {
  done: { webp1x: '/ai-course/map/ped-done@1x.webp', webp2x: '/ai-course/map/ped-done@2x.webp', width: 192, height: 176, heightVb: 0 },
  current: { webp1x: '/ai-course/map/ped-todo@1x.webp', webp2x: '/ai-course/map/ped-todo@2x.webp', width: 192, height: 98, heightVb: 0 },
  next: { webp1x: '/ai-course/map/ped-next@1x.webp', webp2x: '/ai-course/map/ped-next@2x.webp', width: 192, height: 118, heightVb: 0 },
  locked: { webp1x: '/ai-course/map/ped-locked@1x.webp', webp2x: '/ai-course/map/ped-locked@2x.webp', width: 192, height: 119, heightVb: 0 },
} as const satisfies Record<string, WorldMapMarkerAsset>;

/** 台座の表示幅（viewBox 360×600 単位）。44px のタップ領域より少し小さい */
export const PEDESTAL_WIDTH_VB = 26;

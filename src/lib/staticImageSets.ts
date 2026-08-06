// public/ 配下の事前生成済みWebP変種の定義。
// 変種ファイルは scripts/optimize-static-images.mjs が生成する（追加時は両方を更新）。
// width/height は元画像の実寸（CLS防止のための intrinsic size）。

export interface StaticImageSet {
  /** WebP非対応ブラウザ用フォールバック（元のJPEG/PNG） */
  src: string;
  /** WebP変種の srcset */
  srcSet: string;
  width: number;
  height: number;
}

export const HERO_IMAGE: StaticImageSet = {
  src: '/hero.jpg',
  srcSet: '/hero-768.webp 768w, /hero-1280.webp 1280w, /hero-1376.webp 1376w',
  width: 1376,
  height: 768,
};
export const HERO_SIZES = '100vw';

// 会場写真（キーは public/venues/ のファイル名ベース）
export const VENUE_IMAGE_SETS: Record<string, StaticImageSet> = {
  'shibaen-kouminkan': {
    src: '/venues/shibaen-kouminkan.jpg',
    srcSet:
      '/venues/shibaen-kouminkan-480.webp 480w, /venues/shibaen-kouminkan-768.webp 768w, /venues/shibaen-kouminkan-900.webp 900w',
    width: 900,
    height: 600,
  },
  'warabi-taiikukan': {
    src: '/venues/warabi-taiikukan.jpg',
    srcSet: '/venues/warabi-taiikukan-480.webp 480w, /venues/warabi-taiikukan-640.webp 640w',
    width: 640,
    height: 480,
  },
};

// 通常活動一覧のカード（max-w-5xl の右カラム、最大約628px幅で表示）
export const ACTIVITY_CARD_SIZES = '(min-width: 1024px) 628px, calc(100vw - 2rem)';
// 会場ガイド（max-w-4xl、最大約864px幅で表示）
export const VENUE_GUIDE_SIZES = '(min-width: 928px) 864px, calc(100vw - 2rem)';

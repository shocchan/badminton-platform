import type { StaticImageSet } from '../lib/staticImageSets';

interface OptimizedPictureProps {
  set: StaticImageSet;
  /** srcset用のsizes（表示幅のヒント） */
  sizes: string;
  alt: string;
  imgClassName?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  style?: React.CSSProperties;
}

// 事前生成済みWebP変種を <picture> で配信する共通コンポーネント。
// width/height を必ず出力してCLSを防ぐ（表示サイズはimgClassNameのCSSが決める）。
// <picture> は display:contents でlayoutから消し、h-full 等の既存CSSをそのまま効かせる。
export const OptimizedPicture = ({
  set,
  sizes,
  alt,
  imgClassName,
  loading,
  fetchPriority,
  style,
}: OptimizedPictureProps) => (
  <picture className="contents">
    <source type="image/webp" srcSet={set.srcSet} sizes={sizes} />
    <img
      src={set.src}
      alt={alt}
      width={set.width}
      height={set.height}
      className={imgClassName}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      style={style}
    />
  </picture>
);

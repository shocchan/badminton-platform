// 冒険の世界地図・画像背景版（2026-08-22・画像差し替えの土台）。
//
// CEO決定（2026-08-19）: 地図の絵は ChatGPT の画像生成が担当し、Claude は組み込みを担当する。
// このファイルは**画像がまだ無い状態**で書かれている。画像が届いたら
// public/ai-course/map/ に置くだけで、この版が有効になる（手順: docs/ai-course/design/INTEGRATION.md）。
//
// 設計:
// - 座標系は変えない。道・ノード・旗・雲海は AdvWorldMap（viewBox 360×600・%配置の HTML ボタン）をそのまま使い、
//   **風景（WorldScenery）だけを画像に差し替える**。固定ピクセル依存は現行どおり 44px タップ領域だけ
// - 画像は AdvWorldMap の backdrop（枠最下層の <picture>）。object-fit: cover で枠に敷き、
//   会話ルートは object-position 50% 100% で下半分（y 0.5〜1.0）＝現行の viewBox クロップと一致
// - CLS 防止: 枠の高さは SVG の viewBox が先に決める。<img> にも width/height と aspect-ratio を明示
// - 読込完了までは自作SVG風景を描き続け（プレースホルダ）、完了した瞬間に風景を消して画像を見せる
// - **画像が無い／404／デコード失敗 → 旧SVG版（AdvWorldMap）へ自動フォールバック**（<img> ごと外す）
// - 表示方式の切替（?map=image|svg・localStorage・既定 svg）は AdvWorldMapSwitch が担当
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdvWorldMap, type AdvWorldMapProps } from './AdvWorldMap';
import {
  WORLD_MAP_BG, WORLD_MAP_ASPECT, WORLD_MAP_TILES, type WorldMapBackgroundAsset, type WorldMapTileAsset,
} from '../../../lib/aiLesson/course/adventure/advWorldMapAssets';
import {
  readWorldMapVariantFromWindow, type WorldMapVariant,
} from '../../../lib/aiLesson/course/adventure/advWorldMapVariant';

type ImageState = 'loading' | 'loaded' | 'error';

export interface AdvWorldMapImageProps extends AdvWorldMapProps {
  /** 背景画像。null なら画像版を使わず即 SVG 版（検査・無効化用）。既定は WORLD_MAP_BG */
  asset?: WorldMapBackgroundAsset | null;
  /** ランドマークタイル。既定 WORLD_MAP_TILES。[] で無効化（テスト・比較用） */
  tileAssets?: readonly WorldMapTileAsset[];
}

/** viewBox 360×600 上のタイル配置（底辺中央が anchor）。Retina は 2x を選ぶ（SVG <image> に srcset は無い） */
const VB_W = 360, VB_H = 600;
const tileHref = (t: WorldMapTileAsset, dpr: number) => (dpr > 1.25 ? t.webp2x : t.webp1x);
const TileLayer = ({ tiles, dpr }: { tiles: readonly WorldMapTileAsset[]; dpr: number }) => (
  <g data-adv-tiles={tiles.length} aria-hidden>
    {tiles.map((t) => {
      const w = t.widthFrac * VB_W;
      const h = w * (t.height / t.width);
      return (
        <image key={t.id} href={tileHref(t, dpr)} x={t.anchor[0] * VB_W - w / 2} y={t.anchor[1] * VB_H - h}
          width={w} height={h} preserveAspectRatio="xMidYMax meet" data-adv-tile={t.id}
          // タイル単体の 404/失敗はそのタイルだけ消す（背景は残す）
          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.dataset.tileState = 'error'; }}
          onLoad={(e) => { e.currentTarget.dataset.tileState = 'loaded'; }} />
      );
    })}
  </g>
);

const ALT = {
  ja: '冒険の世界地図の風景。下の港ミナトから平野・森・高地を越えて、頂のソラノ塔へ続く',
  zh: '冒险世界地图的风景。从下方的港口Minato，越过平原、森林、高地，通往山顶的Sorano塔',
} as const;

export const AdvWorldMapImage = ({ asset = WORLD_MAP_BG, tileAssets = WORLD_MAP_TILES, ...props }: AdvWorldMapImageProps) => {
  const [state, setState] = useState<ImageState>(asset ? 'loading' : 'error');
  const imgRef = useRef<HTMLImageElement | null>(null);

  // キャッシュ済み画像は onLoad が React のハンドラ装着前に終わることがある → マウント後に complete を見て追いつく
  useEffect(() => {
    const el = imgRef.current;
    if (!el || state !== 'loading' || !el.complete) return;
    // jsdom は naturalWidth 0 のまま complete=true になることがあるので、src 未設定以外は「読込中」に留めて onLoad/onError を待つ
    if (el.naturalWidth > 0) setState('loaded');
  }, [state]);

  // 画像無し／失敗 → 旧SVG版そのもの（<img> を残さない）
  if (!asset || state === 'error') {
    return <AdvWorldMap {...props} variant="svg" imageState={asset ? 'error' : undefined} />;
  }

  const conversation = props.routeKind === 'conversation';
  const backdrop = (
    <picture className="pointer-events-none absolute inset-0 block" data-adv-scenery="image">
      {asset.avif1x && asset.avif2x && (
        <source type="image/avif" srcSet={`${asset.avif1x} 1x, ${asset.avif2x} 2x`} />
      )}
      <img
        ref={imgRef}
        src={asset.webp1x}
        srcSet={`${asset.webp1x} 1x, ${asset.webp2x} 2x`}
        width={asset.width}
        height={asset.height}
        alt={props.lang === 'zh' ? ALT.zh : ALT.ja}
        loading="lazy"
        decoding="async"
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        className="h-full w-full object-cover"
        style={{
          // 会話ルートは下半分（湾と環状路）だけ。viewBox「0 300 360 300」のクロップと同じ範囲
          objectPosition: conversation ? '50% 100%' : '50% 50%',
          aspectRatio: conversation ? WORLD_MAP_ASPECT.conversation : WORLD_MAP_ASPECT.full,
        }}
      />
    </picture>
  );

  // タイルは背景が見えてから（背景より先に建物だけ浮くのを防ぐ）
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const tiles = state === 'loaded' && tileAssets.length > 0 ? <TileLayer tiles={tileAssets} dpr={dpr} /> : undefined;

  return (
    <AdvWorldMap {...props} variant="image" imageState={state}
      backdrop={backdrop} hideScenery={state === 'loaded'} tiles={tiles} />
  );
};

export interface AdvWorldMapSwitchProps extends AdvWorldMapProps {
  /** 明示指定（テスト・将来のプロファイル設定用）。省略時は URL クエリ → localStorage → 既定 'svg' */
  variant?: WorldMapVariant;
  /** 画像版に渡す素材（省略時 WORLD_MAP_BG） */
  asset?: WorldMapBackgroundAsset | null;
}

/**
 * 表示方式フラグで新旧を出し分ける入口。AdvAdventureMap はこれを呼ぶ。
 * 既定は 'svg'（現行）。CEO 確認前に既定を 'image' にしない。
 */
export const AdvWorldMapSwitch = ({ variant, asset, ...props }: AdvWorldMapSwitchProps) => {
  // URL/localStorage は初回マウント時に 1 回だけ読む（再レンダーごとに保存しない）
  const auto = useMemo(() => readWorldMapVariantFromWindow(), []);
  const v = variant ?? auto;
  return v === 'image'
    ? <AdvWorldMapImage {...props} asset={asset} />
    : <AdvWorldMap {...props} variant="svg" />;
};

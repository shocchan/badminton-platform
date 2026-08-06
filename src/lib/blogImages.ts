// Supabase Storage（blog-images バケット）の画像を軽量配信するためのユーティリティ。
//
// 方針（Storage の画像変換APIは有料プランのため使わない）:
//   - アップロード時にクライアント側で WebP 3サイズ（480/960/1600w）を生成して保存する
//   - 既存画像は scripts/migrate-blog-images.mjs が同じ命名規約で変種を一括生成する
//   - 表示側は URL 規約（`{base}_w{width}.webp`）から srcset を導出する。DBは書き換えない
//   - 変種が無い場合（マイグレーション漏れ等）は error イベントで srcset を外し原本に戻す
import { supabase } from '../services/supabaseClient';

export const BLOG_VARIANT_WIDTHS = [480, 960, 1600] as const;

const BUCKET_PATH = '/storage/v1/object/public/blog-images/';
// HEIC/HEIFも対象に含める: 原本はChrome等で表示できないが、変種のWebPなら表示できる
const SOURCE_EXT_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
const VARIANT_RE = /_w(?:480|960|1600)\.webp$/;

// 一覧カード（max-w-6xl・3カラム）/ 詳細カバー（max-w-4xl）/ 本文内画像の表示幅ヒント
export const BLOG_CARD_SIZES = '(min-width: 1024px) 360px, (min-width: 640px) 50vw, calc(100vw - 2rem)';
export const BLOG_DETAIL_COVER_SIZES = '(min-width: 928px) 864px, calc(100vw - 2rem)';
export const BLOG_CONTENT_SIZES = '(min-width: 928px) 800px, calc(100vw - 4rem)';

/** 変種の命名規約に乗れるURLなら拡張子を除いたベースを返す */
function variantBase(url: string): string | null {
  if (!url.includes(BUCKET_PATH)) return null;
  if (VARIANT_RE.test(url)) return url.replace(VARIANT_RE, '');
  if (SOURCE_EXT_RE.test(url)) return url.replace(SOURCE_EXT_RE, '');
  return null;
}

/** blog-images のURLから WebP 変種の srcset を組み立てる（対象外URLは undefined） */
export function blogImageSrcSet(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const base = variantBase(url);
  if (!base) return undefined;
  return BLOG_VARIANT_WIDTHS.map(w => `${base}_w${w}.webp ${w}w`).join(', ');
}

/** 変種の読み込みに失敗した画像を原本（src）に戻す。多重発火はガードする */
export function fallbackToOriginal(img: HTMLImageElement): void {
  if (img.dataset.variantFallback === '1') return;
  img.dataset.variantFallback = '1';
  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
}

/**
 * ブログ本文HTML（TipTap出力）の <img> に loading/decoding/srcset/sizes を付与する。
 * eagerFirst: カバー画像が無い記事では先頭の画像がLCPになるため eager + 高優先度にする。
 */
export function enhanceBlogContentHtml(html: string, opts: { eagerFirst?: boolean } = {}): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('img').forEach((img, i) => {
    const eager = Boolean(opts.eagerFirst) && i === 0;
    img.setAttribute('loading', eager ? 'eager' : 'lazy');
    img.setAttribute('decoding', 'async');
    if (eager) img.setAttribute('fetchpriority', 'high');
    const srcSet = blogImageSrcSet(img.getAttribute('src'));
    if (srcSet && !img.hasAttribute('srcset')) {
      img.setAttribute('srcset', srcSet);
      // ResizableImage が width 属性（表示px）を持つ場合はそれを表示幅ヒントに使う
      const w = parseInt(img.getAttribute('width') ?? '', 10);
      img.setAttribute(
        'sizes',
        Number.isFinite(w) && w > 0 ? `min(${w}px, calc(100vw - 4rem))` : BLOG_CONTENT_SIZES,
      );
    }
  });
  return doc.body.innerHTML;
}

export interface BlogImageVariant {
  width: (typeof BLOG_VARIANT_WIDTHS)[number];
  blob: Blob;
}

/**
 * アップロード前にブラウザ内で WebP 変種を生成する。
 * 変換できない形式（GIF/SVG/HEIC等のデコード不可・WebPエンコード非対応ブラウザ）は
 * null を返し、呼び出し側は従来どおり原本をアップロードする。
 */
export async function makeBlogImageVariants(file: File): Promise<BlogImageVariant[] | null> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const out: BlogImageVariant[] = [];
    for (const w of BLOG_VARIANT_WIDTHS) {
      // 拡大はしない（名前の幅より実ピクセルが小さくなるのは許容）
      const scale = Math.min(1, w / bitmap.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.82));
      if (!blob || blob.type !== 'image/webp') return null;
      out.push({ width: w, blob });
    }
    return out;
  } finally {
    bitmap.close();
  }
}

/**
 * 変種一式をStorageへアップロードし、正準URL（最大幅=_w1600）を返す。
 * 変種を作れないファイルは null（呼び出し側で原本アップロードにフォールバック）。
 */
export async function uploadBlogImageWithVariants(file: File, baseName: string): Promise<string | null> {
  const variants = await makeBlogImageVariants(file);
  if (!variants) return null;
  let canonical: string | null = null;
  const maxWidth = Math.max(...BLOG_VARIANT_WIDTHS);
  for (const v of variants) {
    const path = `${baseName}_w${v.width}.webp`;
    const { data, error } = await supabase.storage.from('blog-images').upload(path, v.blob, {
      upsert: true,
      contentType: 'image/webp',
      cacheControl: '31536000',
    });
    if (error) throw error;
    if (v.width === maxWidth) {
      canonical = supabase.storage.from('blog-images').getPublicUrl(data.path).data.publicUrl;
    }
  }
  return canonical;
}

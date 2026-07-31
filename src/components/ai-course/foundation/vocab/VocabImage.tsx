// 語彙画像コンポーネント（Phase 2C+ §14/§30/§44/§45）。
// approved（一般）/draft（labPreview）以外・未生成・ロード失敗は中立プレースホルダー（抽象図形＋アイコン）。
// 「画像準備中」を大きく出し続けない。レイアウトシフト防止のためaspect比を固定。
import { useState } from 'react';
import { BookOpen, User, Utensils, TrainFront, Briefcase, ShoppingBag, HeartPulse, Clock3, Image as ImageIcon } from 'lucide-react';
import type { FoundationItem } from '../../../../lib/aiLesson/course/foundationTypes';
import type { VisualAsset } from '../../../../lib/aiLesson/course/visualAssetTypes';
import { isVisibleAsset } from '../../../../lib/aiLesson/course/visualAssetTypes';
import { illustrationFor } from '../../../../lib/aiLesson/course/vocabIllustrationManifest';
import { VocabScene } from './VocabScene';

const categoryIconEl = (item: FoundationItem, className: string) => {
  switch (item.sceneCategory) {
    case 'people': return <User className={className} aria-hidden />;
    case 'food': return <Utensils className={className} aria-hidden />;
    case 'transport': return <TrainFront className={className} aria-hidden />;
    case 'work_school': return <Briefcase className={className} aria-hidden />;
    case 'shopping': return <ShoppingBag className={className} aria-hidden />;
    case 'health': return <HeartPulse className={className} aria-hidden />;
    case 'time_money': return <Clock3 className={className} aria-hidden />;
    default: return item.partOfSpeech === 'verb' ? <ImageIcon className={className} aria-hidden /> : <BookOpen className={className} aria-hidden />;
  }
};

interface Props {
  item: FoundationItem;
  asset?: VisualAsset;
  labPreview: boolean;
  size?: 'thumb' | 'detail';
  className?: string;
  /** altの言語。学習者の表示言語に合わせる */
  lang?: 'ja' | 'zh';
  /**
   * 出題（image_to_word）では、altが答えのヒントになってしまうため装飾扱いにする。
   * 画面上の絵は同じでも、支援技術には説明を渡さない。
   */
  decorative?: boolean;
}

export const VocabImage = ({ item, asset, labPreview, size = 'thumb', className = '', lang = 'ja', decorative = false }: Props) => {
  const [failed, setFailed] = useState(false);
  const visible = !!asset && isVisibleAsset(asset, labPreview) && !failed;
  const src = visible ? (size === 'thumb' ? asset!.thumbnailPath ?? asset!.filePath : asset!.filePath) : null;
  // 承認済みのラスター画像が無いときは、自前SVGの場面図を出す（何も無い枠にしない）
  const scene = src ? null : illustrationFor(item.id)?.scene ?? null;
  return (
    <div className={`relative overflow-hidden rounded-xl bg-indigo-50/60 ${className}`} style={{ aspectRatio: '4 / 3' }}>
      {src ? (
        <img src={src} alt={asset!.altJa} loading="lazy" decoding="async"
          width={asset!.width ?? 400} height={asset!.height ?? 300}
          className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : scene ? (
        // 自前SVGの場面図（B-4）。人間の編集承認を待たずに出せる正式なassetとして扱う
        <VocabScene spec={scene} lang={lang} decorative={decorative} className="w-full h-full" />
      ) : (
        // 中立プレースホルダー: 学習を妨げない抽象図形＋カテゴリアイコン（§30）
        <div className="w-full h-full flex items-center justify-center" role="img"
          aria-label={visible === false && asset ? asset.altJa : ''}>
          <span className="absolute w-16 h-16 rounded-full bg-indigo-100/80 -translate-x-4 -translate-y-2" aria-hidden />
          <span className="absolute w-10 h-10 rounded-full bg-teal-100/70 translate-x-8 translate-y-5" aria-hidden />
          {categoryIconEl(item, 'relative w-8 h-8 text-indigo-400')}
        </div>
      )}
      {visible && asset!.reviewStatus !== 'approved' && labPreview && (
        <span className="absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded bg-amber-100/90 text-amber-800">draft</span>
      )}
    </div>
  );
};

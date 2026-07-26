// 語彙画像コンポーネント（Phase 2C+ §14/§30/§44/§45）。
// approved（一般）/draft（labPreview）以外・未生成・ロード失敗は中立プレースホルダー（抽象図形＋アイコン）。
// 「画像準備中」を大きく出し続けない。レイアウトシフト防止のためaspect比を固定。
import { useState } from 'react';
import { BookOpen, User, Utensils, TrainFront, Briefcase, ShoppingBag, HeartPulse, Clock3, Image as ImageIcon } from 'lucide-react';
import type { FoundationItem } from '../../../../lib/aiLesson/course/foundationTypes';
import type { VisualAsset } from '../../../../lib/aiLesson/course/visualAssetTypes';
import { isVisibleAsset } from '../../../../lib/aiLesson/course/visualAssetTypes';

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
}

export const VocabImage = ({ item, asset, labPreview, size = 'thumb', className = '' }: Props) => {
  const [failed, setFailed] = useState(false);
  const visible = !!asset && isVisibleAsset(asset, labPreview) && !failed;
  const src = visible ? (size === 'thumb' ? asset!.thumbnailPath ?? asset!.filePath : asset!.filePath) : null;
  return (
    <div className={`relative overflow-hidden rounded-xl bg-indigo-50/60 ${className}`} style={{ aspectRatio: '4 / 3' }}>
      {src ? (
        <img src={src} alt={asset!.altJa} loading="lazy" decoding="async"
          width={asset!.width ?? 400} height={asset!.height ?? 300}
          className="w-full h-full object-cover" onError={() => setFailed(true)} />
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

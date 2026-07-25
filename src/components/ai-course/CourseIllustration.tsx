// コースの場面イラスト共通コンポーネント。
// 「slot（用途）→ 画像ファイル」の対応を1か所に集約し、新画像が出来たら SLOT_MAP を
// 1行差し替えるだけで全画面に反映される。画像が無い slot は何も描画しない
// （＝イラストなしでもUIとして完成している状態を維持する・§7）。
//
// アニメーションは控えめなフェードインのみ（motion-safe ＝ prefers-reduced-motion では動かない）。
// 会話中画面では使わないこと（集中を妨げない・§9）。

export type IllustrationSlot =
  | 'complete'      // レッスン/会話 完了（達成感）
  | 'emptyReview'   // 今日の復習ゼロ（休んでOKの空状態）
  | 'welcome'       // 会話開始前・あいさつ
  | 'error'         // 接続失敗などのエラー（今後: 困り顔で案内する新画像）
  | 'roadmapGoal'   // ロードマップのゴール提示
  | 'growth';       // 成長画面

/**
 * slot → 既存アセットの対応。null は「専用画像が未作成」＝描画しない。
 * 新画像を /public/images/ai-course/ に置いたら、ここを差し替えるだけでよい。
 */
const SLOT_MAP: Record<IllustrationSlot, { src: string; alt: { ja: string; zh: string } } | null> = {
  complete: {
    src: '/images/ai-course/shoko-sensei-cheer.webp',
    alt: { ja: '翔子先生が拍手して喜んでいる', zh: '翔子老师在鼓掌庆祝' },
  },
  emptyReview: {
    src: '/images/ai-course/shoko-sensei-base.webp',
    alt: { ja: '翔子先生がにこやかに休憩をすすめている', zh: '翔子老师微笑着建议休息' },
  },
  welcome: {
    src: '/images/ai-course/shoko-sensei-wave.webp',
    alt: { ja: '翔子先生が手をふって迎えている', zh: '翔子老师挥手欢迎' },
  },
  error: null,        // 専用画像（困り顔）ができるまで描画しない（アイコン表示のまま）
  roadmapGoal: {
    src: '/images/ai-course/shoko-sensei-teaching.webp',
    alt: { ja: '翔子先生がタブレットで説明している', zh: '翔子老师用平板讲解' },
  },
  growth: null,       // 専用画像（望遠鏡/地図）ができるまで描画しない
};

interface Props {
  slot: IllustrationSlot;
  /** 表示幅px（高さは自動）。モバイルでは画面の1/3を超えない値を推奨 */
  width?: number;
  lang?: 'ja' | 'zh';
  className?: string;
  /** 純装飾（隣に同内容のテキストがある）なら true で alt を空にする */
  decorative?: boolean;
}

export const CourseIllustration = ({ slot, width = 120, lang = 'ja', className = '', decorative = false }: Props) => {
  const entry = SLOT_MAP[slot];
  if (!entry) return null; // 画像なしでも成立するUIを維持
  return (
    <img
      src={entry.src}
      width={width}
      alt={decorative ? '' : entry.alt[lang]}
      aria-hidden={decorative ? true : undefined}
      loading="lazy"
      decoding="async"
      className={`h-auto select-none motion-safe:animate-[report-in_0.5s_ease-out] ${className}`}
      style={{ width }}
    />
  );
};

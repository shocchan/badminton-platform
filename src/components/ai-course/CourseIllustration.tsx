// コースの場面イラスト共通コンポーネント。
// 「slot（用途）→ 画像ファイル」の対応を1か所に集約し、新画像が出来たら SLOT_MAP を
// 1行差し替えるだけで全画面に反映される。画像が無い slot は何も描画しない
// （＝イラストなしでもUIとして完成している状態を維持する・§7）。
//
// アニメーションは控えめなフェードインのみ（motion-safe ＝ prefers-reduced-motion では動かない）。
// 会話中画面では使わないこと（集中を妨げない・§9）。
import {
  teacherAsset, teacherName, DEFAULT_TEACHER_ID, type TeacherExpression,
} from '../../lib/aiLesson/course/adventure/advTeacher';
import { useTeacher } from './teacherContext';

export type IllustrationSlot =
  | 'complete'      // レッスン/会話 完了（達成感）
  | 'emptyReview'   // 今日の復習ゼロ（休んでOKの空状態）
  | 'welcome'       // 会話開始前・あいさつ
  | 'error'         // 接続失敗などのエラー（今後: 困り顔で案内する新画像）
  | 'roadmapGoal'   // ロードマップのゴール提示
  | 'growth';       // 成長画面

/**
 * slot → 先生の表情。null は「この用途の絵をまだ作っていない」＝描画しない。
 *
 * **選んだ先生の絵を出す。** 学習者が悠斗先生を選んでいるのに翔子先生の絵が出ると、
 * 「案内している人が誰なのか」がぶれる（§18）。表情のアセットが無い先生は
 * `teacherAsset()` が base へ落とすので、無い絵をでっち上げることにはならない。
 */
const SLOT_EXPRESSION: Record<IllustrationSlot, TeacherExpression | null> = {
  complete: 'smile',
  emptyReview: 'neutral',
  welcome: 'neutral',
  error: null,        // 専用画像（困り顔）ができるまで描画しない（アイコン表示のまま）
  roadmapGoal: 'teaching',
  growth: null,       // 専用画像（望遠鏡/地図）ができるまで描画しない
};

/** 翔子先生だけが持つ専用ポーズ。他の先生は SLOT_EXPRESSION 側へ落ちる */
const SHOKO_ONLY_SRC: Partial<Record<IllustrationSlot, string>> = {
  complete: '/images/ai-course/shoko-sensei-cheer.webp',
  welcome: '/images/ai-course/shoko-sensei-wave.webp',
};

/** alt文。先生名だけを差し替える（絵の内容そのものは変わらない） */
const SLOT_ALT: Record<IllustrationSlot, { ja: (n: string) => string; zh: (n: string) => string }> = {
  complete: { ja: (n) => `${n}が拍手して喜んでいる`, zh: (n) => `${n}在鼓掌庆祝` },
  emptyReview: { ja: (n) => `${n}がにこやかに休憩をすすめている`, zh: (n) => `${n}微笑着建议休息` },
  welcome: { ja: (n) => `${n}が手をふって迎えている`, zh: (n) => `${n}挥手欢迎` },
  error: { ja: (n) => `${n}`, zh: (n) => `${n}` },
  roadmapGoal: { ja: (n) => `${n}がタブレットで説明している`, zh: (n) => `${n}用平板讲解` },
  growth: { ja: (n) => `${n}`, zh: (n) => `${n}` },
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
  const teacher = useTeacher();
  const expression = SLOT_EXPRESSION[slot];
  if (!expression) return null; // 画像なしでも成立するUIを維持
  const src = (teacher.id === DEFAULT_TEACHER_ID && SHOKO_ONLY_SRC[slot])
    || teacherAsset(teacher, expression);
  return (
    <img
      src={src}
      width={width}
      alt={decorative ? '' : SLOT_ALT[slot][lang](teacherName(teacher, lang))}
      aria-hidden={decorative ? true : undefined}
      loading="lazy"
      decoding="async"
      className={`h-auto select-none motion-safe:animate-[report-in_0.5s_ease-out] ${className}`}
      style={{ width }}
    />
  );
};

// 翔子先生のアバター（丸）。用途・状態に応じて表情を切り替える。
// 画像は円形ポートレート（顔が中心に来るよう object-position を上寄せ）。
// ※ 旧 /shoko-avatar.png は存在せず空表示だったため、実イラスト(public/images/ai-course)へ差し替え。

export type ShokoExpression = 'neutral' | 'speaking' | 'smile';

interface Props {
  size?: number;               // px
  expression?: ShokoExpression;
  className?: string;
  /** 装飾用途で読み上げ不要なら false */
  labeled?: boolean;
}

const srcFor = (e: ShokoExpression) =>
  e === 'smile'
    ? '/images/ai-course/shoko-sensei-cheer.webp'
    : '/images/ai-course/shoko-sensei-base.webp';

export const ShokoAvatar = ({ size = 40, expression = 'neutral', className = '', labeled = true }: Props) => {
  return (
    <img
      src={srcFor(expression)}
      width={size}
      height={size}
      alt={labeled ? '翔子先生' : ''}
      aria-hidden={labeled ? undefined : true}
      loading="lazy"
      decoding="async"
      className={`rounded-full object-cover bg-lp-coral-soft ${className}`}
      style={{ width: size, height: size, objectPosition: 'center 12%' }}
    />
  );
};

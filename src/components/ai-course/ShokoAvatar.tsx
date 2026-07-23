// 翔子先生のアバター（丸）。用途・状態に応じて表情を切り替える。
// neutral=穏やか（聞いている/待ち） / speaking=話している / smile=笑顔（ごほうび）
// 小さい時は軽い256px版を出し分け。画像は円形ポートレート。

export type ShokoExpression = 'neutral' | 'speaking' | 'smile';

interface Props {
  size?: number;               // px
  expression?: ShokoExpression;
  className?: string;
  /** 装飾用途で読み上げ不要なら false */
  labeled?: boolean;
}

const baseName = (e: ShokoExpression) =>
  e === 'speaking' ? 'shoko-avatar-speaking' : e === 'smile' ? 'shoko-avatar-smile' : 'shoko-avatar';

export const ShokoAvatar = ({ size = 40, expression = 'neutral', className = '', labeled = true }: Props) => {
  const base = baseName(expression);
  return (
    <img
      src={size <= 160 ? `/${base}-256.png` : `/${base}.png`}
      width={size}
      height={size}
      alt={labeled ? '翔子先生' : ''}
      aria-hidden={labeled ? undefined : true}
      loading="lazy"
      decoding="async"
      className={`rounded-full object-cover bg-slate-100 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

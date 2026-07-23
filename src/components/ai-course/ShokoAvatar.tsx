// 翔子先生のアバター（丸）。用途に応じてサイズ違い（小さい時は軽い256px版）。
// 画像は円形ポートレート。rounded-full で正方形PNGを丸く切り抜く。

interface Props {
  size?: number;       // px
  className?: string;
  /** 装飾用途で読み上げ不要なら false */
  labeled?: boolean;
}

export const ShokoAvatar = ({ size = 40, className = '', labeled = true }: Props) => (
  <img
    src={size <= 160 ? '/shoko-avatar-256.png' : '/shoko-avatar.png'}
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

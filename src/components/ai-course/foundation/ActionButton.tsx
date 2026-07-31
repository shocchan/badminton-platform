// AIコース共通アクションボタン（Interaction Design System・§14-§15）。
// 押せる要素にだけ立体感を与える。情報カードにはこのスタイルを使わない。
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';

export type ActionVariant = 'primary' | 'secondary' | 'choice' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
  selected?: boolean;      // choice用（aria-pressedと押し込み表現）
  showCheck?: boolean;     // 選択済みチェック（色以外の手掛かり・§24）
  fullWidth?: boolean;
  children: ReactNode;
}

// focus ring（CEO承認・2026-07-28）: indigo-400は白地2.98:1で3:1未達だった。
// indigo-500（白地4.47:1・薄い藍地3.99:1）＋offset 2で、色とすき間の両方で見分けられるようにする。
// outlineはtransparentで重ねる: 通常は見えず、forced-colors環境ではOSが塗り直すので消えない。
const base = 'action-raised inline-flex items-center justify-center gap-1.5 rounded-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-45 disabled:shadow-none disabled:transform-none';

const variantClass: Record<ActionVariant, string> = {
  primary: 'action-primary bg-indigo-600 text-white min-h-12 px-4 py-3 text-base',
  secondary: 'action-secondary bg-white text-gray-700 border border-gray-200 min-h-11 px-4 py-2.5 text-sm',
  choice: 'action-choice bg-white text-gray-800 border-2 border-gray-200 min-h-12 px-4 py-3 text-base text-left',
  ghost: 'text-gray-500 min-h-11 px-3 py-2 text-sm hover:text-gray-700',
};

export const ActionButton = ({ variant = 'primary', selected, showCheck, fullWidth, className = '', children, ...rest }: Props) => (
  <button
    type="button"
    aria-pressed={variant === 'choice' ? !!selected : undefined}
    className={`${base} ${variantClass[variant]} ${selected ? 'is-selected border-indigo-400 bg-indigo-50' : ''} ${fullWidth ? 'w-full' : ''} ${className}`}
    {...rest}
  >
    {children}
    {showCheck && selected && <Check className="w-4 h-4 shrink-0" aria-hidden />}
  </button>
);

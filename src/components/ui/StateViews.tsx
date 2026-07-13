// 空状態・エラー状態・スケルトンの共通ビュー。
// 「真っ白画面」を出さないための最低ラインをここで揃える。

import type { LucideIcon } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

/** データ取得失敗時の再読み込み付きエラー表示 */
export const ErrorState = ({
  message = 'データの読み込みに失敗しました',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
      <RefreshCw className="h-6 w-6 text-red-400" />
    </div>
    <p className="mt-4 text-sm font-medium text-gray-700">{message}</p>
    <p className="mt-1 text-xs text-gray-400">通信環境をご確認のうえ、再読み込みしてください</p>
    <button
      type="button"
      onClick={onRetry ?? (() => window.location.reload())}
      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-gray-700 active:scale-[0.98]"
    >
      <RefreshCw className="h-4 w-4" />
      再読み込み
    </button>
  </div>
);

/** データゼロ件時の前向き空状態 */
export const EmptyState = ({
  icon: Icon,
  emoji,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
    {Icon ? (
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
        <Icon className="h-6 w-6 text-blue-400" />
      </div>
    ) : (
      <span className="text-4xl">{emoji ?? '🏸'}</span>
    )}
    <p className="mt-4 text-sm font-bold text-gray-800">{title}</p>
    {description && (
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-gray-500">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/** 汎用スケルトン行（.skeleton は index.css のシマー） */
export const SkeletonBlock = ({ className = '' }: { className?: string }) => (
  <div className={`skeleton ${className}`} />
);

/** カード形状のスケルトン（一覧ページ汎用） */
export const CardSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="skeleton mb-3 h-5 w-2/3 rounded-lg" />
    {[...Array(lines)].map((_, i) => (
      <div key={i} className={`skeleton mb-2 h-3.5 rounded ${i % 2 ? 'w-4/5' : 'w-full'}`} />
    ))}
    <div className="skeleton mt-4 h-10 w-full rounded-xl" />
  </div>
);

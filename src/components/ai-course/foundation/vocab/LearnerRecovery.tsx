// 学習者向けRecovery UI／Error Boundary（Phase 2E-1.11 §7-§8）。
// 技術詳細（stack trace・internal ID）は学習者へ出さない。開発者向けはlabPreviewの折りたたみ内のみ。
// 危険操作（すべての進捗を削除）は提示しない。同じ失敗をループさせない。
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { ActionButton } from '../ActionButton';

interface RecoveryProps {
  t: AiCourseDict;
  kind: 'load_fail' | 'empty_pool' | 'corrupted' | 'render_error';
  onRetry?: () => void;
  onHome: () => void;
  /** 代替の練習へ（問題不足時・学習を完全停止させない・§7） */
  onAlternative?: () => void;
  /** 壊れた初回状態だけを作り直す（学習記録は消さない・§7） */
  onResetOnboarding?: () => void;
  /** labPreviewでのみ表示する開発者向け詳細 */
  devDetail?: string;
  labPreview?: boolean;
}

/** 学習者向けの復帰カード。第一CTAは一つ・補助は最大2つ（§11） */
export const LearnerRecovery = ({
  t, kind, onRetry, onHome, onAlternative, onResetOnboarding, devDetail, labPreview,
}: RecoveryProps) => {
  const tv = t.vocab;
  const copy = {
    load_fail: { heading: tv.recLoadFailHeading, body: tv.recLoadFailBody },
    empty_pool: { heading: tv.recEmptyHeading, body: tv.recEmptyBody },
    corrupted: { heading: tv.recCorruptHeading, body: tv.recCorruptBody },
    render_error: { heading: tv.recErrorHeading, body: tv.recErrorBody },
  }[kind];
  // 第一CTA: 再試行があれば再試行・なければ代替・どちらも無ければホーム
  const primary = onRetry
    ? { label: tv.recRetry, action: onRetry }
    : onAlternative
      ? { label: tv.recEmptyAlt, action: onAlternative }
      : { label: tv.frGoHome, action: onHome };
  const secondaries = [
    onRetry && onAlternative ? { label: tv.recEmptyAlt, action: onAlternative } : null,
    onResetOnboarding ? { label: tv.recCorruptCta, action: onResetOnboarding } : null,
    primary.label !== tv.frGoHome ? { label: tv.frGoHome, action: onHome } : null,
  ].filter(Boolean).slice(0, 2) as { label: string; action: () => void }[];

  return (
    <div role="alert" className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="text-base font-bold text-gray-900 mb-1">{copy.heading}</h3>
      <p className="text-sm text-gray-600 mb-4">{copy.body}</p>
      <ActionButton variant="primary" fullWidth onClick={primary.action}>{primary.label}</ActionButton>
      {secondaries.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {secondaries.map((s) => (
            <button key={s.label} type="button" onClick={s.action}
              className="flex-1 min-h-10 px-3 text-xs text-gray-600 border border-gray-200 rounded-xl">{s.label}</button>
          ))}
        </div>
      )}
      {/* 開発者向け詳細はlabPreviewの折りたたみ内だけ（学習者には出さない・§7） */}
      {labPreview && devDetail && (
        <details className="mt-3">
          <summary className="text-[11px] text-gray-400 cursor-pointer min-h-8 flex items-center">developer detail</summary>
          <pre className="text-[10px] text-gray-500 whitespace-pre-wrap break-all mt-1">{devDetail}</pre>
        </details>
      )}
    </div>
  );
};

interface BoundaryProps { t: AiCourseDict; onHome: () => void; labPreview?: boolean; children: ReactNode }
interface BoundaryState { error: Error | null; retryCount: number }

/**
 * 学習Journey範囲のError Boundary（§8）。
 * 内部レビュー・管理画面のエラーとは分離し、学習者にはホームへ戻る導線だけを見せる。
 * 再試行は上限付き（無限エラーループを防ぐ・§8）。
 */
export class LearnerErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  static MAX_RETRY = 2;
  state: BoundaryState = { error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // consoleには開発用情報を残してよい（学習者には出さない）
    console.error('[ai-course] learner journey error', error, info.componentStack);
  }

  render() {
    const { t, onHome, labPreview, children } = this.props;
    const { error, retryCount } = this.state;
    if (!error) return children;
    const canRetry = retryCount < LearnerErrorBoundary.MAX_RETRY;
    return (
      <LearnerRecovery
        t={t} kind="render_error" onHome={onHome} labPreview={labPreview}
        devDetail={`${error.name}: ${error.message}`}
        onRetry={canRetry ? () => this.setState({ error: null, retryCount: retryCount + 1 }) : undefined}
      />
    );
  }
}

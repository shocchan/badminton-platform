// N2文法トラックの遅延読込ラッパ（bundle分離）。
// 通常のAIコース初期表示では180文法データ・UIを読み込まず、開いた時だけ別チャンクを取得する。
// ローディング表示・読み込み失敗時の再試行つき（ja/zh）。将来の聴解/読解教材も同様に分離できる。

import { Component, lazy, Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';

const CourseN2Grammar = lazy(() =>
  import('./CourseN2Grammar').then((m) => ({ default: m.CourseN2Grammar })));

const Loading = ({ t }: { t: AiCourseDict }) => (
  <div className="py-16 text-center text-gray-500 text-sm">{t.common.loading}</div>
);

const Retry = ({ t, onRetry }: { t: AiCourseDict; onRetry: () => void }) => (
  <div className="py-16 text-center">
    <p className="text-sm text-gray-600 mb-3">{t.common.error}</p>
    <button type="button" onClick={onRetry}
      className="min-h-11 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl inline-flex items-center gap-1.5">
      <RefreshCw className="w-4 h-4" />{t.common.retry}
    </button>
  </div>
);

class LazyBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export const N2GrammarLazy = ({ t, onBack, learnerId }: { t: AiCourseDict; onBack: () => void; learnerId?: string }) => {
  const [key, setKey] = useState(0);
  return (
    <LazyBoundary key={key} fallback={<Retry t={t} onRetry={() => setKey((k) => k + 1)} />}>
      <Suspense fallback={<Loading t={t} />}>
        <CourseN2Grammar t={t} onBack={onBack} learnerId={learnerId} />
      </Suspense>
    </LazyBoundary>
  );
};

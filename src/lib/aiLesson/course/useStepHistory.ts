// 端末の「戻る」を、コース内の画面移動に効かせる。
//
// このコースは1つのURL（/:lang/ai-course）の中で画面を切り替える作りなので、
// 何もしないと「戻る」がコースの外へ出てしまう。
// 実際に起きていたこと: 初回の「はじめる前に」から別の画面へ移ると、
// 戻ってもその案内へは帰れず、ホームに着地する。
//
// step を URL には出さない（`?s=lesson` のようなURLを直接開かれると、
// 利用権の確認より先に画面だけ進んでしまうため）。代わりに履歴エントリの
// state にだけ覚えさせる。react-router の history を使うので、
// 既存のルーティングと喧嘩しない。

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * その画面を履歴のどの画面として覚えるか。
 * `null` を返すと履歴に触れない（認証前など）。
 * 別の画面を返すと「戻る」でそこへ着地する（レッスン中へは戻さない、など）。
 */
export type HistoryStepFor<S extends string> = (step: S) => S | null;

interface CourseHistoryState { courseStep?: string }

/**
 * `step` と履歴を同期する。**module scope の関数を `historyStepFor` に渡すこと**
 * （render ごとに作ると effect が毎回走る）。
 */
export const useStepHistory = <S extends string>(
  step: S,
  setStep: (next: S) => void,
  historyStepFor: HistoryStepFor<S>,
): void => {
  const location = useLocation();
  const navigate = useNavigate();
  const stateStep = (location.state as CourseHistoryState | null)?.courseStep as S | undefined;

  // 最後に履歴と突き合わせた画面。「画面が動いた」のか
  // 「履歴が動いた（戻る／進む）」のかを見分けるために持つ
  const synced = useRef<S | null>(null);

  useEffect(() => {
    const target = historyStepFor(step);

    // ① 画面が動いた → 履歴へ積む
    if (target !== null && synced.current !== step) {
      synced.current = step;
      if (stateStep !== target) {
        const base = (location.state ?? {}) as Record<string, unknown>;
        navigate(`${location.pathname}${location.search}`, {
          // このURLで最初に見せる画面は、履歴を増やさず置き換える
          // （コースに入っていきなり「戻る」でコース外へ出せるように）
          replace: stateStep === undefined,
          state: { ...base, courseStep: target },
        });
      }
      return;
    }

    // ② 履歴が動いた（戻る／進む）→ 画面を合わせる
    if (stateStep && stateStep !== target) {
      synced.current = stateStep;
      setStep(stateStep);
    }
  }, [step, stateStep, location, navigate, setStep, historyStepFor]);
};

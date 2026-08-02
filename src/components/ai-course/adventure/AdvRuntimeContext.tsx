// 学習ランタイムの配線（P0/Phase 3）。
// 認証トークンとサーバー発行のセッションを runner へ渡す唯一の口。
// これが無い場所では教材アクティビティを開始できない（=生fetchの抜け道を作らない）。
import { createContext, useContext } from 'react';
import type { RuntimeAuth } from '../../../lib/aiLesson/course/adventure/activityClient';

export interface AdvRuntime {
  auth: RuntimeAuth;
  /** セッション失効（session_stale等）時に再発行してもらう */
  refreshSession: () => Promise<void>;
  /** 現在の累計アクティブ秒（表示用） */
  consumedSeconds: () => number;
  /** このタブが学習してよいか（二重タブ制御） */
  tabActive: () => boolean;
}

const Ctx = createContext<AdvRuntime | null>(null);

export const AdvRuntimeProvider = Ctx.Provider;

export const useAdvRuntime = (): AdvRuntime => {
  const v = useContext(Ctx);
  if (!v) {
    // provider の外で学習画面を出すのは配線ミス。教材が取れない旨を即座に表面化させる
    throw new Error('AdvRuntimeProvider の外で学習画面を描画しています');
  }
  return v;
};

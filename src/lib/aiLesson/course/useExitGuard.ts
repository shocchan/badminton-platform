/**
 * ブラウザの「戻る」でアプリごと出ていかないようにする（2026-09-10 CEO報告）。
 *
 * 【何が起きていたか】
 *   画面の切り替え（今日の冒険 → ほかの学習 → AI会話…）を React の state だけでやっていて、
 *   履歴を1つも積んでいなかった。だから画面の中で何段深く入っていても、
 *   ブラウザの戻るは**アプリの外**へ出る。
 *   個人専用URL（/learn/:code）から来た人はさらに悪く、そのタブの履歴が1件しかないので
 *   **タブごと閉じる**。学習の途中で消えるので、戻ってくる手段も無い。
 *
 * 【直し方】
 *   ホーム以外の画面に入ったら履歴を1つ積み、戻るが来たらホームへ戻す。
 *   これでブラウザの戻るが「画面の戻る」と同じ意味になる。
 *
 * 【あえてしていないこと】
 *   画面ごとにURLを分けることはしない。学習画面は state が多く、URLで復元できない画面が
 *   あるので、URLだけ変わって中身が戻らない方がたちが悪い。
 *   ここは**出ていかせない**ことだけを目的にする。
 */
import { useEffect, useRef } from 'react';

export interface ExitGuardOptions {
  /** いまホーム（いちばん外側）にいるか。ホームでは何もしない＝本当に出たい人を邪魔しない */
  atHome: boolean;
  /** 戻るが押されたときにホームへ戻す処理 */
  onBack: () => void;
  /** false にすると何もしない（テスト・SSR用） */
  enabled?: boolean;
}

export const useExitGuard = ({ atHome, onBack, enabled = true }: ExitGuardOptions): void => {
  /*
   * onBack は毎レンダー作り直される。依存配列に入れると履歴を積み直してしまい、
   * 戻るを1回押すたびに1段しか戻らない（＝出られない）状態になる。
   * だから ref で最新を持ち、効果そのものは atHome の変化だけで動かす。
   */
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  useEffect(() => {
    if (!enabled || atHome) return;
    if (typeof window === 'undefined' || !window.history) return;

    // この画面ぶんの履歴を1つ積む（URLは変えない。中身が復元できないURLを作らない）
    window.history.pushState({ aiCourseGuard: true }, '');
    const onPop = () => onBackRef.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [atHome, enabled]);
};

// src/pages/TacticsBoardPage.tsx
// kawabado.com 非公開ページ: /ja/tactics-board
// ルーター例: <Route path="/:locale/tactics-board" element={<TacticsBoardPage />} />
// ※ 認証ガード（PrivateRoute等）で囲んでください
//
// このルートは App.tsx の chromeless 判定でヘッダー/フッターを外している。
// TacticsBoard 本体が position:fixed + 100dvh で全画面を占めるため、
// ここでは高さを持たせない（余計な箱を挟むとスクロールが生まれる）。

import TacticsBoard from "../components/TacticsBoard";

export default function TacticsBoardPage() {
  return (
    <main aria-label="戦術ボード">
      <TacticsBoard />
    </main>
  );
}

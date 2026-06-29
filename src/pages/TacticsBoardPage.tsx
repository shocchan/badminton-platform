// src/pages/TacticsBoardPage.tsx
// kawabado.com 非公開ページ: /ja/tactics-board
// ルーター例: <Route path="/:locale/tactics-board" element={<TacticsBoardPage />} />
// ※ 認証ガード（PrivateRoute等）で囲んでください

import TacticsBoard from "../components/TacticsBoard";

export default function TacticsBoardPage() {
  return <TacticsBoard />;
}

# しくみラボ Lazy Loading（Phase 2B §17 実装記録）

## chunk構造（vite/rolldownの動的import分割・実測 2026-07-26）
| chunk | サイズ | ロード契機 |
|---|---|---|
| index（メイン） | 576K（Phase 2A: 574K, +2K=lazy配線+i18n辞書+レジストリメタ） | 通常アプリ |
| FoundationLabShell | 32K | ラボ入口を開いたとき（labPreview確認後） |
| foundationItemBank | 8K | 単元チャンクの共有依存 |
| foundationUnit1〜6 | 7〜12K/単元 | 各単元 or ことば/しくみ等の全単元ビュー |

- 教材本文はメインbundleに含まれない（Phase 2Aで+5.3KBだった単元データを分離）
- メイン+2Kの内訳はSuspense配線・単元メタ（タイトル等最小情報）・lab用i18n辞書。教材・問題・正答は含まない
- 単元を追加してもメインbundleは単元メタ1行分しか増えない

## アクセス制御との順序
1. AiCoursePage: step==='lab' の描画前に adminOverrides.labPreview===true を確認（不許可はchunk取得前にホームへ）
2. FoundationLabShell内: 未知の単元IDは isKnownFoundationUnit で拒否しラボトップへ案内（console連続エラーなし）
3. ラボはルーティングを持たない（step state方式）ため、URL直アクセスでchunkが届くことはない。
   chunk自体は静的アセットとして取得可能だが、UI表示・進捗作成・analytics送信は労Preview無しでは到達不能

## ロード中・失敗UI
- Suspense fallback（ローディング表示）／単元・全単元ビューのロード失敗時はエラーメッセージ＋再試行ボタン

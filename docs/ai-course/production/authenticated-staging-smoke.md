# 認証済み staging smoke（2026-07-31）

前セッションで「未実施」と報告した項目。今回実施した。

- 対象: https://staging.badminton-platform.pages.dev （deploy alias / build は RC と同一）
- 使用アカウント: 合成fixture 1件のみ（`.invalid` ドメイン＝実在メールへ配信され得ない）
- **既存learner・Andyさんのデータには一切触れていない**

## fixture の出入り（前後で完全一致）

| 指標 | 作成前 | 撤去後 |
|---|---|---|
| auth.users | 5 | **5** |
| ai_learners | 1 | **1** |
| ai_item_progress | 12 | **12** |
| ai_learning_sessions | 24 | **24** |
| `%.invalid` 残存 | 0 | **0** |

撤去コマンド: `node scripts/ai-course/stage-verify-session.mjs --cleanup <userId>`（実行済み）
セッションJSON・注入用スニペットはローカルから削除済み。

## 確認結果

| # | 項目 | 結果 | 実測値 |
|---|---|---|---|
| 1 | ログイン（セッション復元） | PASS | 学習ホームが描画 |
| 2 | World Map | PASS | ミナモ列島・10エリアすべて表示・現在地ミナト |
| 3 | 今日のミッション | PASS | 「名前を伝える」「〜といいます」・AI会話1回・今日あと10回 |
| 4 | ロードマップ | PASS | Week1〜6 が定着数つきで表示 |
| 5 | ことば図鑑（一覧） | PASS | 動詞56語が表示 |
| 6 | **語彙イラスト** | PASS | `svg[viewBox="0 0 120 90"]` が **56枚**描画。`role="img"`・語ごとに固有のalt |
| 7 | 方向語の描き分け | PASS | 行く=右向き矢印 / 来る=左向き矢印 を実画面で確認 |
| 8 | 語の詳細 | PASS | 「行く」で読み・意味・使う場所（ヒノデ台/オウライ街道）を表示 |
| 9 | **会話文脈のruntime** | PASS | 「行く」でテーマ「よく行く場所について話す」・最初の質問「週末、よくどこに行きますか？」＝`fi-iku` 固有データ。genericに落ちていない |
| 10 | zh 切替 | PASS | 同画面が「聊聊你常去的地方」「周末你常去哪里？」へ。UIも全面中国語 |
| 11 | 法務16ページ（ja8+zh8） | PASS | 全URL **HTTP 200**・404なし |
| 12 | 法務ページ zh | PASS | `/zh/ai-course/privacy` の h1 が「隐私政策」・footerリンク8本 |
| 13 | 法務ページ noindex | PASS | 未公開のため `noindex,nofollow` が入る |
| 14 | LP footer 法務リンク | PASS | **8本**（従来0本） |
| 15 | console error（未認証・新規タブ） | PASS | **0件** |

## console error について（正直な記載）

fixtureでログインした状態では
`AuthApiError: Invalid Refresh Token: Refresh Token Not Found` が出た。
原因は**検証ツールが合成の refresh_token を発行するため**で、製品側の不具合ではない
（`stage-verify-session.mjs` はアクセストークンだけを作り、refresh は成立しない）。

実利用と同じ経路（セッションなしの新規タブでLPを開く）では console error **0件** を確認した。
実learnerのログイン往復でのconsole確認は、実機チェック（Gate②）に含める。

## 未実施（この方法では確認できないもの）

- AI音声会話（マイク許可が要る）→ 実機チェックへ
- 中国語IME入力 → 実機チェックへ
- cross-device resume（別端末での再開）→ 実機チェックへ

# 本人アバター＆オンボーディング 仕様書（Group G・未コミット承認待ち）

基準: `c627378` ／ **実装なし**。画像アップロード・生成API接続・Storage変更は明示承認まで行わない。

## 1. 現状監査の結論（Group F）
| 項目 | 現状 | 判断 |
|---|---|---|
| ニックネーム | `ai_learners.display_name` 既存（初回ヒアリングで入力済み） | **DB変更なしで対応済み**。変更UIを設定に追加するだけ |
| アバターURL | `settings jsonb` に **`avatarObjectPath`（private Storage内オブジェクトパス）** を保存（signed URLは期限切れするため**URLを永続保存しない**。表示時=パス→本人所有権確認→短時間signed URL発行） | **DB変更なし**（practiceAgainIds等と同方式・複数端末同期済み） |
| Auth metadata | 未使用 | 使わない（settingsが既存同期・削除フローに内包され適切） |
| Storage | **コースでは未使用**（AdminPageのみ利用歴）。private bucket・signed URL運用実績なし | Phase Avatar 3で新設が必要（bucket+RLS=**承認事項**） |
| 画像生成API | OpenAI images系の利用なし（chat/tts/realtimeのみ） | 新規接続=承認事項 |
| EXIF除去/圧縮 | なし | Phase 3でクライアント側canvas再エンコード（EXIF自然消滅）を採用予定 |
| 退会削除 | 発話削除(ai_delete_my_utterances)あり・learnersはuser cascade | アバターはsettings内=learner削除で消える。Storage画像はPhase 3設計に削除含める |
| プライバシーポリシー | **専用ページなし** | Phase 3前に必須（写真取扱いの明文化） |

## 2. 段階計画（推奨: 0→1→2→…）
- **Phase 0（完了=本書）**: 監査・API比較・同意文言・コスト
- **Phase 1（次の実装候補・DB変更なし）**: ニックネーム変更UI（設定）＋ホームに小さなプロフィール（イニシャル円 or 既存キャラ）＋わたしの日本語ノートMVP＋思い出カード最小版
- **Phase 2（手動運用）**: 受講開始時に写真をWeChatで受領→**人間がChatGPTでアバター生成→管理画面でsettings.avatarObjectPathに登録（配信は短時間signed URL発行）**（画像はpublic/images/avatars/ではなく**署名なし推測不能ファイル名のprivate配信が必要→暫定はCloudflare Pagesの推測不能パス+robots除外は不十分のため、Supabase Storage private+signed URLを承認後に新設**）。元写真はアプリに保存しない
- **Phase 3（アプリ内即時生成）**: 写真選択→同意→一時アップロード（private・24h自動削除設計）→gpt-image-1 images/edits→プレビュー→再生成（上限3回）→確定→元写真即削除。新Edge Function `ai-avatar-generate`（JWT+レート制限+多重排他）=**承認事項**
- **Phase 4/5**: アルバム拡張・ポーズ差分（確定アバターをseedに編集APIで生成）

## 3. API比較（Phase 3用）
| 案 | 特徴保持 | 費用/回 | 透過 | 備考 |
|---|---|---|---|---|
| A: OpenAI gpt-image-1 images/edits | ○（入力画像編集） | 約$0.02-0.07（品質設定次第）・再生成同額 | ○(background=transparent) | 既存OPENAI_API_KEY・Edge経由可・入力画像はOpenAI側で保持されない設定を規約確認要 |
| B: 手動運用（ChatGPT+人間） | ◎（人間が品質確認） | ChatGPT Plus内 | ◎ | **MVP推奨**。受講生2-10名規模では最安・最高品質・元写真をシステムに入れない |
| C: 選択式アバター（写真なし） | —（本人特徴は選択制） | ¥0 | ◎ | 髪型/メガネ/服色の組合せSVG。写真不安層向け。P2 |
**推奨: MVP=B（+写真なしはイニシャル円）、完成版=A+C併設**。

## 4. オンボーディング（Step 1-8要点）
- Step1 名前: 既存display_nameを「ニックネームでOK・後から変更可」と再説明（1-20字・絵文字可・HTML注入はReact描画で無害化・空ならスキップ可）
- Step2-3 案内と選択: 「写真から作る/写真を使わずに始める/今はスキップ」— **未実装の選択式を存在するように見せない**（Phase 2では「写真から作る=コーチへWeChatで送る」導線）
- Step4 同意: 目的限定・外部処理（ChatGPT/OpenAI）明示・元写真の保存期間（Phase2=アプリ非保存/Phase3=生成後即削除）・非公開・削除方法・本人写真のみ・書類/他人NG。チェックは2つまで（利用同意+本人写真確認）
- Step6-7 生成と確認: 進行表示・二重送信防止・失敗時は学習開始をブロックしない・「このキャラクターで始める/もう一度/別の写真/今は使わない」— 自動確定しない
- 保持データ: nickname・avatarObjectPath・作成日時・同意バージョン（settings jsonb・DB変更なし）

## 5. プライバシー原則（§12全項目を採用）
写真は任意・写真なしで全機能利用可・public bucket禁止・推測不能URL+signed URL・EXIF除去・画像形式/サイズ制限（jpeg/png/webp・5MB・SVG拒否）・MIME実体検査・rate limit・元写真デフォルト非保存・退会時削除・ログ/エラー監視へ画像を送らない・実写真でのテスト禁止。

## 6. 最初の1コミット候補
**Phase Avatar 1の「ニックネーム変更UI＋ホーム小プロフィール」**（settings.jsonbのみ・リスク最小・世界観の入口）。

## 7. テスト方針
ニックネーム: 長さ/空/注入/ja/zh。ノート: 実データのみ/学習なし日にページなし/褒め言葉ローテ。アルバム: 節目判定の決定性/架空達成なし。アバター: Phase 2以降で追加（画像なしfallback=イニシャル円を先行テスト）。

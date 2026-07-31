# Phase 2E-1.9 依頼文（ChatGPT「AI日本語学習監督」生成・NEXT_PHASE_PROMPTマーカー間の抽出・2026-07-27）

あなたはClaude Codeです。以下の条件でPhase 2E-1.9「Learning Connectivity Audit & Lab Inspector」を実施してください。

## 0. Phaseの位置づけ
教材や学習ロジックを変更するPhaseではない。現在のコードと静的教材データから、語彙／語彙の意味・例文・cognate・role／診断問題／レベル・トラック／会話目標・会話教材／復習候補・復習ルール／learner-facing画面 の接続状況を**read-onlyで監査**する。接続されていないものを自動接続しない。不明を推測で「接続済み」と判定しない。

## 1. 作業条件
ブランチ: feature/ai-course-learning-polish。labPreview限定・stagingまで。
禁止: mainマージ／本番デプロイ／共有Supabase変更／migration適用／RLS変更／Secrets・APIキー変更／認証・OTP変更／料金・決済変更／learnerデータ変更／Andyさん接触／current_week・masteryState・XP・会話履歴変更／Realtime prompt全面変更／Edge Function本番変更／外部有料サービス／教材本文・meaningZh・exJa/exZh・cognate・role変更／human_reviewed・approved変更／診断問題本文変更／会話ロジック変更／復習ロジック変更／Decision Console判断の教材反映／AIによる人間判断／自動教材接続。必要になったらSTOP_FOR_HUMAN。

## 2. 目的（3つ）
A: 学習要素の接続グラフをread-onlyで導出（コード・静的データ・route・import参照から決定的に）。
B: 接続状態をlabPreview Inspectorで可視化（connected/partial/orphaned/unverified/intentionally-isolated・名称は既存設計に合わせ可）。
C: 参照整合性とカバレッジを恒等式・テストで固定（総数だけでなくレベル・role・接続タイプ別）。

## 3. 事前調査（コードベース根拠・推測禁止・短いdocsへ）
140語のデータソース／基礎78・N3 62の区別／role保存構造／診断16問のソースと語彙・文法参照／語彙学習画面で使うfield／会話画面・会話目標の教材参照／復習候補・予定生成コード／current_week・masteryState非変更で確認できる静的ルール／false friend・cognateの実参照箇所／meaningZh・exJa/exZh表示route／roleが出題選択に使われる場所／learner-facing routeとlabPreview route／文字列一致接続の箇所／安定ID接続の箇所／未使用export・未参照教材データ／circular import・重複データ定義。

## 4. 接続ノード（read-only派生モデル・正式DBモデル変更禁止）
vocabulary（wordId/word/level group/role/cognate/human review status/source file）・diagnostic（ID/target dimension/参照wordIds/文法概念/level/source file）・learning surface（vocabulary card/detail/diagnostic/conversation/lesson・track/review/report）・connection（from/to/type/source evidence/current status/verification level=direct・derived/learner-facingかlab-onlyか）。

## 5. 接続タイプ（最低限）
語彙→語彙学習画面（140語の表示可否・meaningZh/exJa/exZh/cognate/roleの表示・利用）／語彙→診断（参照語彙・数・基礎N3内訳・FF対象・重複参照・参照切れ・存在しないwordId・文字列参照の不安定箇所）／語彙→会話（**明示参照のみconnected**: wordId参照・topic/goal参照・prompt素材・固定語彙リスト・lesson target。AIが自由に使える可能性だけならunverified/future candidate）／語彙→復習（静的復習ルール参照・失敗語の復習候補コード・wordId保持・翌日/3日/7日予定生成への接続。実learnerデータは読まない）／診断→学習トラック（設計・実装済みか・UI表示のみか・出題制御か）／会話→復習（訂正項目の復習候補コード・語彙ID保持か自由テキストか）。

## 6. 接続状態の定義（コード上で定義・各状態にreasonとevidence必須）
connected=安定IDまたは明示コードパスでlearner-facing機能へ到達／partial=一部到達するが期待する次工程まで接続されない（例: roleは保存されるが出題頻度に未使用・診断結果は表示のみ）／orphaned=存在するが参照されない／unverified=文字列生成・AI自由生成・動的promptで静的保証不可／intentionally-isolated=labPreviewのみ・draftのみ・human review待ち等の意図的隔離。

## 7. 恒等式と集計（コードから算出・実データ正）
教材全体: 総語数140・基礎78・N3 62・role別・cognate分類別・human review状態別。接続別: 各surface connected数・orphaned/partial/unverified/intentionally-isolated数。レベル別・role別の状態内訳。診断: 問題総数・語彙参照数・ユニーク語彙数・文法次元数・存在しないwordId数・重複参照数・FF probe数・N3語彙カバレッジ。複数の接続軸を単純合算して140にしない（各軸ごとに恒等式）。

## 8. Learning Connectivity Inspector（labPreview限定・推奨 vview=connectivity・一般受講生非表示）
サマリー（教材総数・状態別・接続タイプ別・レベル別・role別）／フィルター（level/role/cognate/connection type/status/human review status/word検索）／一覧（word・level・role・語彙画面/診断/会話/復習・総合状態・色だけに依存しない）／詳細（node情報・接続先・source evidence=file/export/関数・direct/derived・learner-facing/lab-only・未接続理由・将来候補・Decision Consoleリンク・語彙詳細リンク）。行番号は必須にしない（パス・export名・関数名優先）。

## 9. orphanの扱い
自動修正しない。likely bug/expected draft isolation/human review pending/future feature/unknownに分類（明確な根拠がある場合のみ・曖昧はunknown）。教材削除禁止・role変更禁止。

## 10. Decision Console連携
Inspector→語彙詳細・該当語のDecision Console itemsへ移動可能に。Console側にも可能なら接続状態の小さな要約（折りたたみ・情報密度を増やしすぎない）。

## 11. 語彙詳細anchor（前Phase未完成分）
meaning/examples/cognate/role/review decisions/connectivityへhashまたはqueryで移動・focus移動・keyboard可能・既存routeを壊さない・labPreview専用sectionは一般受講生非表示。

## 12. アクセシビリティとモバイル（Inspector範囲）
keyboard・visible focus・heading hierarchy・table headers・モバイルはカード/縦積み・色非依存status・filter label・count更新のaria-live・detail dialogのfocus管理・lang属性・320pxで重大overflowなし・長いfile pathは折返し/省略＋全文確認・200% zoomで主要操作可能・可能ならcontrastの簡易自動確認。新しい大型依存・外部有料サービス禁止。

## 13. 性能
Inspectorはlazy load・main bundle増加を抑える・graph可視化ライブラリ導入しない・SVGネットワーク図不要（一覧・集計・詳細で十分）・filter体感遅延なし・console error 0・unhandled rejection 0。

## 14. テスト
データ完全性: 総語数・基礎/N3内訳・role別・invalid/duplicate wordId・diagnostic参照切れ・edge重複・deterministic edge ID・source順序非依存・status恒等式。
接続判定: 5状態・role未接続・diagnostic参照・conversation明示参照（推測禁止）・review静的コードパス・learnerデータ非利用。
UI: labPreviewのみ・一般受講生非表示・サマリー件数・filter・word検索・status表示・詳細evidence・各リンク・anchor・keyboard・aria-live・mobile overflow。
回帰: 既存604テスト・Decision Console・localStorage v3・stale検出・export/import・語彙詳細・診断16問・tsc・lint・build・staging console・画像404・network 4xx。

## 15. 推奨コミット（2〜6件・推奨4件）
feat(audit): derive deterministic learning connectivity graph ／ feat(audit): add lab-only connectivity inspector ／ feat(vocabulary): add deep links and connectivity context ／ test(audit): lock connectivity coverage and regressions

## 16. 完了条件
140語の接続モデル導出・基礎/N3内訳・各surface集計・5状態区別・reason/evidence保持・invalid wordId検出・duplicate edge検出・deterministic edge ID・恒等式テスト・labPreview Inspector・一般受講生非表示・Decision Console/語彙詳細リンク・詳細anchor・モバイル主要幅overflowなし・基本a11y・全テスト成功・tsc 0・lint増分0・build成功・main bundle増加を報告・lazy chunk報告・staging console error 0・4xx 0・画像404 0・教材本体/meaningZh/example/cognate/role/human_reviewed/approved/Supabase/migration/RLS/認証/OTP/learnerデータ/masteryState/XP/current_week/会話履歴/本番/main 変更なし。

## 17. STOP_FOR_HUMAN条件
learner実データ参照／Supabase schema変更／RLS変更／migration適用／認証変更／current_week・masteryState・XP・会話履歴変更／教材値変更／role変更／診断問題変更／会話prompt変更／復習ロジック変更／orphan自動修正／教材の正式承認／本番／main。

## 18. 完了報告形式
実数付き: 変更ファイル・コミット・教材総語数/基礎/N3/role別/cognate別/human review状態別・node総数・edge総数・duplicate edge・invalid wordId・各surface connected数・5状態総数・基礎/N3/role別の状態内訳・診断問題総数/参照ユニーク語彙数/FF probe数/N3カバレッジ・会話接続の根拠・復習接続の根拠・role未接続の詳細・orphan分類・Inspector表示確認・一般受講生非表示・各リンク・anchor・モバイル・a11y・contrast・テスト総数・tsc/lint/build・bundle増減・staging console・4xx・404・各未変更確認・未完成・人間判断事項・次Phase候補。

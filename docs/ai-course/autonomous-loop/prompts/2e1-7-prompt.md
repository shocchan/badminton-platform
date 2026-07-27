# Phase 2E-1.7 依頼文（ChatGPT「AI日本語学習監督」生成・NEXT_PHASE_PROMPTマーカー間の抽出・2026-07-27）

あなたはClaude Codeです。以下の条件でPhase 2E-1.7「Human Decision Console & Proposal Triage」を実装してください。

## 0. 役割と基本方針
このPhaseの目的は、人間判断を代行することではありません。Phase 2E-1.5で発生した人間判断待ち項目を、CEOが安全に確認・比較・保留・判断ドラフト化できるlabPreview限定UIへ統合してください。このPhaseで記録する判断は、あくまで「ローカル判断ドラフト」です。以下の状態とは絶対に同一視しないでください: human_reviewed／approved／教材本体への正式反映／Supabaseへの正式保存／本番公開承認。AIの多数決やconfidenceを根拠に、人間判断を自動確定しないでください。

## 1. 作業ブランチと対象環境
作業ブランチ: feature/ai-course-learning-polish。対象: labPreview限定・staging確認まで・開発者アカウント向け既存導線のみ。
禁止: mainへのマージ／本番デプロイ／本番環境変更／共有Supabase変更／migration適用／RLS変更／Secrets・APIキー変更／認証・OTP変更／料金・決済変更／learnerデータ変更／Andyさんへの接触／current_week変更／masteryState変更／XP変更／会話履歴変更／Realtime prompt全面変更／Edge Function本番変更／外部有料サービス導入／教材のhuman_reviewed自動更新／教材のapproved自動更新／AIによる人間判断の代行。
上記が必要になった場合は実装せず、完了報告でSTOP_FOR_HUMANとして明示してください。migration draftやRLS設計docsの作成は可能ですが、このPhaseでは原則不要です。適用は絶対にしないでください。

## 2. Phaseの目的（3つに限定）
- 目的A: 人間判断待ち項目の統合。fi-namaeのP0判断・cognate不一致11語・human required 15語・meaningZh未採用提案・role提案・その他既存監査データ内で明示的にhuman decisionが必要な項目を一つのDecision Consoleで確認可能に。同じ語に複数の判断事項がある場合、語単位で潰さず判断事項単位で分ける（例: fi-kyoumi/cognate判断・fi-kyoumi/meaningZh判断・fi-kyoumi/role判断を別decision item）。
- 目的B: 正式承認と分離された判断ドラフト管理。localStorage v3として判断ドラフトを保存。状態候補: pending／needs_context／keep_current／accept_proposal_as_draft／reject_proposal／deferred／superseded。accept_proposal_as_draftは教材の正式採用ではない。UI内で必ず「判断ドラフトであり、教材には未反映」と分かる表示。判断項目には最低限: decisionId・wordId・decisionType・priority・currentValue・proposedValue・proposalSource・reason・evidence・impactAreas・status・reviewerNote・createdAt・updatedAt・decidedAt・schemaVersion・sourceDatasetVersion（既存データ構造に合わせた名称変更可・意味を失わない）。
- 目的C: 判断中心のレビューUX。一覧は優先度・語彙・判断対象・現在状態・提案元・判断ステータスを優先。詳細では現在値・Claude提案・ChatGPT提案・差分・根拠・confidence参考表示・教材上の影響範囲・判断選択肢・CEOメモ・更新履歴。confidenceは補助情報に留め「高confidenceだから採用」の誘導をしない。

## 3. 事前調査
labPreview判定方法／レビュー画面のroute・component構成／localStorage v2 schema／2E-1.5監査結果の保存場所／Claude・ChatGPT比較データ形式／meaningZh未採用提案の保存形式と件数／human required 15語の正確な一覧／cognate不一致11語の正確な一覧／role提案の正確な件数／同じ語に複数判断事項があるケース／fi-namaeのP0内容／既存のdeveloper・CEO識別情報がフロントで安全に再利用可能か。調査結果は実装前メモまたはdocsに短く残す。数値を推測しない。報告値と実データが異なる場合は実データを正として差異を完了報告に記載。

## 4. CEO限定操作の扱い
新しい認証方式を実装してはいけません。既存のlabPreview・developer account制御内で再利用可能なCEO識別が存在する場合のみ再利用。存在しない場合: client-sideの仮判定を正式なセキュリティ制御として実装しない／UIをlabPreview限定にする／判断操作を「CEO用ローカル判断ドラフト」と明記／完了報告に「正式なCEO権限制御ではない」と記載。URLパラメータ・localStorageフラグ・隠し操作だけでCEO権限を保証したことにしない。正式な権限保証に認証・RLS・共有DB変更が必要ならSTOP_FOR_HUMAN。

## 5. localStorage v3
v2の既存状態を壊さない。要件: v2からv3への安全な読み替えまたは移行／失敗時は既存データを破壊しない／schema version保持／unknown fieldを可能な範囲で保持／不正データ時に画面全体をクラッシュさせない／parse errorを分かる形で表示／clear操作に確認／1件単位でreopen可能／判断変更履歴を最低限保持／教材データへの自動書き込み禁止。キー名は既存命名規則に合わせる。

## 6. JSON export／import
exportに: exportedAt・schemaVersion・sourceDatasetVersion・decision items・summary counts。importは無条件に信用しない: JSON parse／schema validation／schemaVersion確認／decisionId重複確認／wordId存在確認／decisionType確認／status確認／import前プレビュー／replace・mergeの区別／破壊的replace時の確認／エラー内容表示。新しい大型ライブラリは導入しない。importした内容を教材本体へ反映しない。

## 7. フィルターと集計
絞り込み: priority／decisionType／status／proposalSource／AI一致・不一致／human required／wordIdまたは語彙検索。集計: 全decision item数・pending・needs_context・decided draft・deferred・P0・P1・decisionType別件数。「語数」と「判断事項数」を分けて表示。

## 8. UX要件（行き止まり防止）
判断後に次の項目へ移動できる／判断を取り消してpendingへ戻せる／一覧へ戻ってもフィルター状態維持／保存済みか未保存か分かる／判断対象が常に表示／P0は目立つが自動採用を誘導しない／根拠不足はneeds_context／AI提案のどちらも採用しない選択肢／current value維持の選択肢／reviewer note任意入力／accidental clickで即確定しない。詳細drawer・dialog・専用detail routeいずれか可。140件規模に過剰なvirtualization不要。

## 9. モバイル要件
320px／375px／390px／768px／desktopで確認。横スクロール必須にしない／Claude・ChatGPT比較はモバイル縦積み可／長い中国語文が切れない／fixed footerとbottom sheet競合なし／textarea入力中に主要操作が隠れない／タップ領域確保／バッジが本文を圧迫しない／filter panelが閉じられる／detailから一覧へ戻れる。実機不可の場合はresponsive viewport確認まで行い未実機と報告。

## 10. アクセシビリティ（Decision Console範囲のみ）
form label関連付け／keyboard操作／visible focus／色だけに依存しない状態表示／icon-only buttonのaccessible name／dialog・sheetのfocus管理／Escape close／trigger focus return／保存完了のaria-live通知／disabled状態の視覚+属性表現／heading hierarchy／必要に応じたlang属性／error messageと入力欄の関連付け。可能な範囲で自動a11yテスト追加。大型外部サービス不使用。

## 11. 性能要件
初期表示で全詳細カード展開しない／140件規模でフィルター体感遅延なし／比較詳細は必要時描画／画像追加なし／main bundle増加を計測／不要な新規依存回避／console error 0／unhandled rejection 0。bundle増加時は増加量と理由を報告。

## 12. 教材への影響禁止
語彙本文・meaningZh・exJa・exZh・cognate確定値・role確定値・human_reviewed・approved・learner向け出題・診断結果ロジック・会話接続・復習接続・masteryState・XPを変更しない。表示用の読み取り・派生データ作成は可。判断ドラフトから教材ファイルを自動patchする処理は作らない。

## 13. fi-namaeの扱い
P0だがこのPhaseでは修正しない。Decision Consoleの先頭またはP0キューに表示し、現在の例文・問題点・Claude提案・ChatGPT提案・human required理由・影響範囲・判断ドラフト状態が分かるように。P0を理由に自動採用しない。

## 14. meaningZh未採用提案
未採用提案を消さず判断対象として整理。現在のmeaningZh・提案meaningZh・提案元・提案理由・自然さ・意味範囲・語義追加か置換か・例文との整合性・cognate判断への影響・learner-facing表示への影響を可能な範囲で表示。同一語の複数提案は上書きせず別提案として保持。AI同士が一致していても人間判断指定があるものは自動採用しない。

## 15. role提案
optional→diagnostic等の提案を人間判断事項として表示。このPhaseではroleを変更しない。current role・proposed role・proposal reason・対象トラック・出題頻度/診断/learner体験への想定影響を表示。約40語という報告値をそのまま信用せず実データから正確な件数を算出。

## 16. テスト
単体: decision item生成／同一語の複数decision type／集計／語数と判断事項数の区別／filter／sort／localStorage v2→v3／invalid localStorage／history追加／reopen／export／import validation（duplicate decisionId・unknown wordId・invalid status・merge・replace confirmation）。
UI: pending→判断ドラフト化／keep_current／reject／needs_context／deferred／note入力／reopen／filter維持／P0表示／教材未反映表示／export／import preview／import error／keyboard操作／dialog focus／aria-live。
回帰: 既存577テスト・tsc・lint・build・既存レビュー画面・labPreview以外からの非表示・一般受講生向け既存機能・画像404・staging console error。テスト件数は実数を報告。

## 17. staging確認（stagingのみ）
labPreviewでDecision Console表示／一般受講生導線に非表示／P0・P1フィルター／human required／decision type／meaningZh提案／role提案／fi-namae詳細／localStorage再読込／export／import preview／mobile viewport／keyboard操作／console error 0／network error 0／画像404 0。本番デプロイ禁止。

## 18. 論理コミット
2〜6件（推奨4件）。無関係な変更を混ぜない。

## 19. 完了条件
判断待ちがdecision item単位で統合／fi-namaeがP0表示／cognate不一致・human required・meaningZh提案・role提案の表示／語数と判断事項数の区別／localStorage v3安全動作・v2非破壊／「正式承認ではない」UI明示／教材本体への自動反映なし／human_reviewed・approved未変更／Supabase・migration・RLS・認証・learnerデータ変更なし／一般受講生に影響なし／export・import validation動作／モバイル主要幅でレイアウト破綻なし／基本アクセシビリティ／全テスト成功／tsc 0／lint増分0／build成功／staging console error 0／画像404 0／本番変更なし／main未マージ。

## 20. 完了報告形式
変更ファイル・コミット一覧・decision item総数・対象語数・decisionType別/priority別/status別件数・human required件数・cognate不一致件数・meaningZh提案件数・role提案件数・複数判断がある語数・fi-namae表示確認・v2→v3結果・export/import結果・モバイルviewport結果・アクセシビリティ結果・テスト総数・tsc/lint/build/bundle・staging console・404・一般受講生非影響・Supabase/migration/RLS/認証/教材本体/human_reviewed/approved/本番/main未変更確認・未完成事項・人間判断が必要な事項・次Phase候補。報告と実データに数値差異があった場合は差異を隠さず記載。

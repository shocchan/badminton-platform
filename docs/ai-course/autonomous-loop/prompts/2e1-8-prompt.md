# Phase 2E-1.8 依頼文（ChatGPT「AI日本語学習監督」生成・NEXT_PHASE_PROMPTマーカー間の抽出・2026-07-27）

あなたはClaude Codeです。以下の条件でPhase 2E-1.8「Decision Integrity & Review Readiness」を実施してください。

## 0. Phaseの目的
このPhaseではHuman Decision Consoleへ新しい教材判断を追加したり、AIが判断を代行したりしません。目的は次の3つ: ①decision queue 91件の完全性・priority由来・重複・除外条件を検証 ②Decision Consoleと語彙詳細を双方向接続し、判断時に必要な教材文脈と影響範囲を確認可能に ③実ブラウザでモバイル表示とDecision Console範囲のアクセシビリティを検証・修正。教材の内容変更、正式承認、共有保存は行いません。

## 1. 作業条件
ブランチ: feature/ai-course-learning-polish。labPreview限定・stagingまで・feature branch内のみ。
禁止: mainマージ／本番デプロイ／共有Supabase変更／migration適用／RLS変更／Secrets・APIキー変更／認証・OTP変更／料金・決済変更／learnerデータ変更／Andyさんへの接触／current_week・masteryState・XP・会話履歴変更／Realtime prompt全面変更／Edge Function本番変更／外部有料サービス導入／教材本文変更／meaningZh変更／exJa・exZh変更／cognate確定値変更／role確定値変更／human_reviewed・approved変更／Decision Consoleから教材への自動反映／AIによる人間判断／複数decision itemの一括採用。必要になった場合は実装せずSTOP_FOR_HUMANとして報告。

## 2. 最初に行う完全性監査
2.1 件数: 報告値（91項目・72語・example1・cognate11・meaning_zh17・role60・sense2）を実データから再計算し差異を報告。件数をハードコードせず、テスト期待値として固定する場合は元データ更新時に意図的更新が必要と分かる構造に。
2.2 網羅性: 元のClaude/ChatGPTレビュー・統合監査データから、human required・role_mismatch・meaningZh未採用提案・cognate不一致・sense判断の漏れなし／採用済み提案の混入なし／重複なし／同一語の異type別item化／decisionIdの決定性（元データ順序が変わっても不変）／表示順序の決定性を確認。
2.3 除外理由: source candidate総数・queue採用数・adopted除外数・invalid/incomplete除外数・duplicate除外数・type別除外数を、labPreview内監査情報またはテスト/docsで確認可能に（learner向けUI表示不要）。

## 3. P0=3の監査
fi-namaeがP0=3（example/meaning_zh/role）となった理由を特定: priorityがword単位かdecision item単位か／同一語の最大priorityを全itemへ継承しているか／元レビューで3件すべて独立P0か／fallbackか／導出後の上書きか。docsまたは完了報告に明記。
3.1 勝手にP0を変更しない: 独立P0でない場合も仕様判断で直接priorityを変更せず、sourcePriorityとdecisionPriorityの分離 または priorityInheritedFromWordフラグ表示のどちらかを実装。UI上で「独立してP0／語のP0を継承／元レビューpriority不明」を区別。元データが明確な単純実装バグの場合のみ修正可（変更前後の件数を報告）。人間の教材判断が必要ならSTOP_FOR_HUMAN。

## 4. decision itemのprovenance
各itemに source review／source record ID／source field／source priority／source reason／source confidence／current dataset version／derivation rule／inherited priorityの有無 を可能な範囲で追跡可能に。存在しない情報を生成・推測しない。UIは「監査情報」折りたたみセクション。

## 5. stale decision検出
localStorage v3の判断ドラフトが現在のqueueと食い違う場合を検出: decisionId不存在／wordId不存在／currentValue変化／proposedValue変化／decisionType変化／sourceDatasetVersion差異／同一decisionIdの意味変化。状態例: current/stale/orphaned/incompatible（名称は既存設計に合わせ可）。要件: staleを自動的に正式判断へ移行しない／通常pendingと混同しない／import previewで警告／merge・replace前に件数表示／staleのメモ・履歴を失わない／自動削除しない／教材へ反映しない。supersededの自動生成は新旧対応が決定的な場合のみ・曖昧ならstale/orphanedで残す。

## 6. 語彙詳細との双方向リンク
6.1 Console→語彙詳細: 各itemから対象語の既存詳細画面へ。可能ならquery/hashで関連セクション指定（example→例文、meaning_zh→中国語意味、cognate→cognate、role→track/role、sense→意味範囲）。既存route設計を壊さない。
6.2 語彙詳細→Console: 未処理itemがある語のみlabPreview限定でリンク/バッジ表示（例: 未判断3件・P0 1件・deferred 1件）。一般受講生には非表示。
6.3 戻り文脈: filter・search・selected item・scroll位置・detail open状態を可能な範囲で維持（URL/session state可・新しい共有保存は禁止）。

## 7. 影響範囲表示
decision typeごとに静的または既存データから導出可能な影響範囲を表示（example: learner-facing例文・訳整合・診断/復習再利用可能性 等）。接続されていない機能を「影響する」と断定せず「現在接続済み／将来影響候補／未確認」を区別。

## 8. role判断の説明強化
role decision 60件向けに: current role・proposed role・対象レベル/トラック・required/optional/diagnosticの意味・learner-facing出題への現在の影響・提案理由・source review・他roleとの重複を表示。role定義は既存仕様docs/実装を根拠に。存在しない仕様を推測で書かない。不明確なら「仕様未定義」と表示し人間判断事項として報告。

## 9. 実ブラウザ・モバイル確認
CEOのChromeがリサイズ不可なことを理由に未確認のままにしない。既存テスト環境の範囲でPlaywright・ブラウザ自動化・responsive screenshot・既存E2E基盤等を使い実ブラウザ確認（新しい大型依存は不要・既存最小手段優先）。幅: 320×568／375×667／390×844／768×1024／desktop。対象: 一覧・filter・detail・比較・長い中国語文・CEOメモ・radio・保存・import preview・stale warning・双方向リンク・バナー・P0表示。スクリーンショットは一時生成し不要ならコミットしない。

## 10. モバイル受入条件
320pxで横スクロール必須にならない／中国語文が切れない／radio label全体タップ可能／保存ボタン到達可能（ソフトキーボード想定）／filter閉じられる／detailから戻れる／バナーが画面の大半を占有しない／priority・status・typeが潰れない／import preview表が横幅を破壊しない／sticky header/footerが内容を隠さない／44px操作領域／画面回転を必須にしない。

## 11. アクセシビリティ監査（Decision Console範囲）
heading hierarchy／landmark／keyboardのみで全操作／visible focus／radioのfieldset・legend／input・filterのlabel／error関連付け／aria-live（保存確認・stale warning読み上げ）／dialog・drawerのfocus trap・Escape・focus return／icon-only buttonのaccessible name／色非依存のpriority・status／disabled属性／lang="ja"・lang="zh-CN"／contrast／reduced motion／import file input説明。既存自動a11y基盤があれば利用。外部有料サービス禁止。

## 12. バナーの情報階層
安全メッセージは削除禁止。情報過多なら階層化: 主=「判断ドラフトであり教材未反映」、補足=「正式承認ではない・正式なCEO権限制御ではない・localStorageのみ」（補足は展開可能でも可）。安全性を弱める変更禁止。

## 13. export/import追加検証
既存validation維持の上で: sourceDatasetVersion差異・stale件数・orphaned件数・currentValue/proposedValue差異・item総数差異・対象語数差異・import元exportedAt表示。previewでsafe merge/overwrite/stale/orphaned/invalid/unchangedを区別。replace確認は維持。

## 14. テスト
14.1 queue: 91件/72語/type別の期待値またはスナップショット・採用済み除外・duplicate除外・decisionId安定性（source順序変更時含む）・同一語複数item・provenance・inherited priority・P0由来。
14.2 stale: missing decisionId/wordId・changed current/proposed/datasetVersion・orphaned・compatible merge・stale merge・history/note維持・自動削除されない。
14.3 リンク: Console→詳細・type別anchor・詳細の未判断件数・labPreviewのみ・一般受講生非表示・filter/selected復元。
14.4 UI/a11y: keyboard・fieldset/legend・focus・aria-live・stale warning・mobile layout・長い中国語・import preview・banner階層・320px overflowなし。
14.5 回帰: 既存589テスト・tsc・lint・build・labPreview gate・一般受講生既存機能・localStorage v3・export/import・console error・4xx・画像404。

## 15. 性能
大規模最適化不要。main bundle増加・decision lazy chunk増減・初期ロード・filter反応・detail open・詳細遷移・mobile jank・console error 0・unhandled rejection 0 を確認。新規依存追加時は理由を報告。

## 16. 推奨論理コミット（2〜6件・推奨4件）
test(review): verify decision queue integrity and priority provenance ／ feat(review): detect stale drafts and expose audit provenance ／ feat(review): connect decision console with vocabulary details ／ fix(review): harden mobile and accessibility behavior（実変更に合わせ調整可・無関係な変更を混ぜない）

## 17. 完了条件
queue総数・対象語数・type別件数の再検証／除外数の可視化またはテスト／duplicateなし／decisionId安定／P0=3の理由特定／独立P0と継承P0の区別／人間判断なしにpriority意味を変更していない／provenance確認可能／stale・orphaned検出／import previewでstale表示／双方向リンク／labPreview限定・一般受講生非表示／filter・選択文脈の復元／role定義と影響範囲表示／モバイル5幅の実ブラウザ確認／320pxで重大なoverflowなし／基本a11y確認／全テスト成功／tsc 0／lint増分0／build成功／console error 0／4xx 0／画像404 0／教材本体・human_reviewed・approved・Supabase・migration・RLS・認証・OTP・learnerデータ・本番・main 変更なし。

## 18. STOP_FOR_HUMAN条件
P0定義に教材責任者の判断が必要／role定義が既存仕様から特定できない／正式CEO権限制御／Supabase共有保存／RLS変更／migration適用／認証変更／教材値変更／human_reviewed・approved変更／判断結果の教材自動反映／learnerデータ変更／本番変更／mainマージ。

## 19. 完了報告
数値付きで: 変更ファイル・コミット・item総数・対象語数・type別件数・source candidate総数・adopted/invalid/duplicate除外数・P0件数（独立/継承別）・fi-namae P0=3の理由・priorityモデル変更内容・provenance追加内容・stale/orphaned検出件数・双方向リンク確認・filter/selected復元・role影響説明・320/375/390/768/desktop確認・a11y結果・テスト総数・tsc/lint/build・main bundle増減・lazy chunk増減・staging console・network 4xx・画像404・一般受講生非影響・教材本体/human_reviewed/approved/Supabase/migration/RLS/認証/OTP/learnerデータ/本番/main未変更確認・未完成・人間判断事項・次Phase候補。

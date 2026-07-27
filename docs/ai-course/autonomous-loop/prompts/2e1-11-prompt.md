# Phase 2E-1.11 依頼文（ChatGPT「AI日本語学習監督」生成・NEXT_PHASE_PROMPTマーカー間の抽出・2026-07-27夜）

あなたはClaude Codeです。以下の条件でPhase 2E-1.11「First-Run Guided Journey & Learner Recovery UX」を実装してください。

## 0. Phaseの目的
内部監査ツールや管理画面を増やすPhaseではない。成人中国語母語者の初回利用者が、説明書を読まなくても「何を目指すか理解する→短い診断を受ける→最初の語彙・会話練習を行う→今日できたことと次回復習を確認する」まで迷わず進めるlearner-facing Journeyを完成させる。同時に、中断・再読込・問題データ不備・壊れたlocalStorage等から安全に復帰できる画面を整える。

## 1. 作業条件
ブランチ: feature/ai-course-learning-polish。labPreview限定・stagingまで・learner-facing画面を優先。
禁止: mainマージ／本番デプロイ／共有Supabase変更／migration適用／RLS変更／Secrets・APIキー変更／認証・OTP変更／料金・決済変更／learner正式データ変更／Andyさん接触／current_week・masteryState・XP・会話履歴変更／Realtime prompt全面変更／Edge Function本番変更／外部有料サービス／教材本文・meaningZh・exJa/exZh・cognate・role確定値変更／human_reviewed・approved変更／root P0・P1の自動判断／Decision Console判断の教材反映／admin_overrides変更／学習結果のSupabase正式保存／大型アニメーションライブラリ追加。必要になったらSTOP_FOR_HUMAN。

## 2. 目的（3つ）
A: 初回4ステップJourney（最初の診断から学習完了まで導く）
B: 中断・失敗からのRecovery（離脱・再読込・データ破損・問題不足から安全に戻る）
C: 学習者向け品質（モバイル・アクセシビリティ・文言・第一CTA・情報密度）

## 3. 初回判定
既存のlabPreviewローカル状態のみを利用（正式DB・learnerデータは使わない）。初回候補: onboarding完了フラグなし／有効な学習履歴なし／有効な復習状態なし／初回診断未完了。既存状態がある利用者を勝手に初回Journeyへ戻さない。判定ロジックは一箇所へ集約し決定的に。区別する状態: true first run／onboarding in progress／onboarding completed／returning learner／corrupted onboarding state／incompatible schema state。内部状態名は学習者画面へ表示しない。

## 4. 初回Journeyの4ステップ
**Step 1 学習の目的**: 既存の目標データが安全に再利用できれば利用。初回負荷を下げるため最大3〜4択（例: 日常会話／日本での生活／JLPT N3／仕事）。既存仕様の選択肢を優先し新しい正式トラックを追加しない。自由入力は必須にしない。選択結果はローカルJourney内の推薦理由にのみ利用し正式learnerデータへ保存しない。
**Step 2 短い確認**: 既存の開始診断を利用。問題数上限を増やさない／全140語を測ったと誤解させない／「試験」ではなく現在の練習を選ぶための短い確認と説明／正解数のみでレベルを断定しない／間違えても不利益がないと明示／途中で中断・再開可能／問題データ不足時に落ちない／同一問題の意図しない重複を避ける／決定的ローテーション維持。
**Step 3 最初の練習**: 診断結果と目的から既存推薦エンジンで1つの短い練習へ。第一CTAは一つ。推薦理由は学習者向けに簡潔に（良い例:「さっき少し迷った言葉を練習します」「日常会話でよく使う言葉から始めます」「N3で大切な使い分けを確認します」）。避ける表現: remedial／diagnostic role／effectiveSeverity／retained_preview／masteryState／roleDriven／generic・contextual・verified。可能なら会話コア11語または既存の安全な語彙から選ぶ。
**Step 4 完了と次回**: 既存の学習完了画面を再利用・拡張。今日できたこと／練習した語数／次に確認する語／次回予定日／明日の復習予定数／第一CTA一つ／補助CTA最大2つ。新規利用者には復習の仕組みを一文で（例:「今日迷った言葉は、忘れかける頃にもう一度出てきます。」）。定着を断定しない。

## 5. Progress表示
4ステップであることを視覚・読み上げの両方で。現在のステップ／全4ステップ／ステップ名／色だけに依存しない／aria-current="step"等／戻れるステップと戻れないステップの明確化／戻った時に回答を不必要に消さない／診断回答済み問題を勝手に再採点しない。派手なアニメーション不要。

## 6. 中断と再開
再読込テスト地点: Step1選択前／選択後／診断開始前／診断途中／診断完了後／最初の練習開始前／練習途中／完了画面表示後。
要件: 最後に安全に確定した地点から再開／不完全データでクラッシュしない／古いschemaは互換判定／incompatible時は安全な再スタートを提示／既存の通常学習進捗を消さない／復習予定を重複作成しない／同じ初回完了を複数回記録しない／localStorage clearを自動実行しない。

## 7. Recovery状態（learner-facing専用UI）
- **問題を読み込めない**: 簡潔な説明・再試行・ホームへ戻る（stack traceやinternal IDを出さない）
- **利用可能な問題が不足**: 学習を完全停止させない・安全な代替練習へ・代替もなければホームへ・同じ失敗をループしない
- **ローカル状態が壊れている**: 既存の正常な学習状態まで削除しない・オンボーディング状態だけ安全に再構築・「すべての進捗を削除」のような危険操作を出さない・開発者向け詳細はlabPreviewの折りたたみ内だけ
- **保存できない**: quota/write failureを安全に扱う・即クラッシュさせない・簡潔に通知・再試行・可能なら現在セッション継続・保存成功を偽らない

## 8. エラー境界
learner-facing Journey範囲へ専用Error Boundaryまたは同等の復帰機構。予期しないrender error／問題component error／完了画面error／route state不整合。importや管理画面エラーとは分離。ホームへ戻れる・再試行できる・無限再発しない。consoleには開発用情報を残してよいが学習者には技術詳細を出さない。既存の全アプリ構造を大規模変更しない。

## 9. 推薦と復習の重複防止
同じ診断結果で同じ推薦が決定的／期限超過復習があるreturning learnerを初回練習で上書きしない／初回診断の誤答から復習予定が重複生成されない／診断と練習で同じ語を誤答した場合の重複／Sense別状態を維持／同日再正解で段階進行しない／timezone日付ずれなし／完了画面を再表示しても予定重複なし／ブラウザbackで完了処理が再実行されない。

## 10. 学習者向け文言
成人中国語母語者向け。やさしく、幼児向けにしない。一文を短く／内部用語を出さない／不正解を責めない／過度な称賛を避ける／何ができたかを具体的に／次に何をするかを明確に／復習理由を短く。中国語補助は可だが密度を上げすぎない。既存の言語切替方針を優先し新しい翻訳基盤を導入しない。

## 11. 第一CTA
各画面の第一CTAは一つ。Step1=次へ／診断=回答する・次の問題／診断完了=最初の練習を始める／練習=回答する・次へ／完了=既存優先順位（今日の期限復習／ホーム／次の短い練習）から最優先を一つだけ。補助CTAは最大2つ。同じ視覚強度のCTAを並べない。

## 12. 通常利用者への影響
初回JourneyはlabPreview限定。一般受講生の既存導線を変更しない。returning learnerには既存ホームと今日の復習を優先。初回完了後は通常ホームへ自然に移行。毎回オンボーディングを表示しない。開発者用reset機能を追加する場合はlabPreview内のみ・明確な確認付き・一般学習者には非表示。

## 13. モバイル（実レイアウトエンジンで確認）
320×568／375×667／390×844／430×932／768×1024／desktop。
確認項目: progress表示・選択カード・診断問題・長い選択肢・中国語補助・練習画面・完了画面・Recovery画面・ソフトキーボード想定の入力欄・第一CTA・補助CTA・safe-area下部余白・browser back後の表示。
要件: 横overflowなし／44px未満の主要タップ領域なし／CTAが画面外へ固定されない／200% zoomで主要操作可能／landscape必須にしない。実スマートフォン確認はCEOの人間確認事項として残してよい。

## 14. アクセシビリティ
semantic heading／landmark／progressの読み上げ／aria-current／form label／fieldset・legend／visible focus／keyboardのみで完走可能／errorをrole="alert"で通知／保存失敗通知／focusをエラー見出しへ移動／retry後に適切な位置へfocus／色だけに依存しない正誤／lang属性／disabled状態／prefers-reduced-motion／200% zoom／CTA順序／back操作後のfocus復元。既存基盤で可能ならcontrastの自動または半自動確認。大型a11y依存を追加しない。

## 15. Performance
onboardingはlazy load／main bundle増加を抑える／新規画像・グラフ・animation library不要／初回判定で重い全教材走査を毎render行わない／推薦導出を不要に再計算しない／console error 0／unhandled rejection 0／storage errorで無限retryしない。

## 16. テスト
初回判定: true first run／in progress／completed／returning／corrupted／incompatible／既存進捗保持。
4ステップ: Step1選択・戻る／Step2診断・中断再開／Step3推薦／Step4完了／通常ホームへの移行／第一CTA一つ／補助CTA最大2つ。
復習統合: 診断誤答の予定／練習誤答との重複防止／Sense別／LearningClock／同日再正解／完了再表示／browser back／returning learnerの期限復習優先。
Recovery: question load failure／empty pool／corrupted onboarding storage／write failure／error boundary／retry／home fallback／infinite loop防止／正常進捗非削除。
UI・a11y: keyboard完走／progress読み上げ／focus／error alert／320px overflow／200% zoom相当／long Chinese text／CTA tap target／reduced motion。
回帰: 既存644テスト・今日の復習・完了画面・role推薦・LearningClock・Decision Console・Connectivity Inspector・語彙詳細・診断140接続・復習140接続・tsc・lint・build・staging console・network 4xx・画像404。

## 17. 推奨コミット（2〜6件・推奨4件）
feat(onboarding): add deterministic first-run journey state ／ feat(onboarding): guide learners through diagnosis and first practice ／ feat(learning): add learner recovery and error states ／ test(onboarding): cover resume mobile accessibility and regressions。無関係な内部管理ツール変更を混ぜない。

## 18. 完了条件
初回判定が決定的／returning learnerを誤判定しない／4ステップJourney完成／診断問題数上限維持／最初の練習へ到達／完了画面へ到達／次回復習表示／第一CTA一つ／中断・再開／storage破損Recovery／write failure Recovery／問題不足Recovery／Error Boundary／無限エラーループなし／復習予定重複なし／同日段階進行なし／既存進捗非破壊／一般受講生非影響／labPreview限定／モバイル主要幅でoverflowなし／44px未満主要操作なし／keyboard完走／基本a11y／全テスト成功／tsc 0／lint増分0／build成功／main bundle増減報告／lazy chunk報告／staging console error 0／network 4xx 0／画像404 0／教材本体・human_reviewed・approved・Supabase・migration・RLS・認証・OTP・learner正式データ・masteryState・XP・current_week・会話履歴・admin_overrides・本番・main 変更なし。

## 19. STOP_FOR_HUMAN条件
onboarding状態のSupabase保存／語彙進捗・復習スケジュールの正式保存／RLS変更／admin_overrides変更／migration適用／認証変更／learner正式データ変更／masteryState・XP・current_week変更／会話履歴変更／教材値変更／human_reviewed・approved変更／root P0・P1判断／本番／mainマージ。

## 20. 完了報告形式
実数付きで: 変更ファイル・コミット・初回判定状態数・判定条件・corrupted/incompatible処理・4ステップ各画面・Step1選択肢数・診断問題上限・中断再開結果・最初の推薦理由・練習到達・完了画面到達・次回復習表示・第一CTA確認・補助CTA数・誤答予定重複防止・Sense別管理・同日進行防止・完了再表示の重複防止・browser back結果・question load failure・empty pool・storage corruption・write failure・Error Boundary・retry・home fallback・infinite loop防止・既存進捗非破壊・一般受講生非影響・labPreview限定・320/375/390/430/768/desktop・44px tap target・200% zoom・keyboard完走・focus管理・progress読み上げ・error alert・contrast・reduced motion・テスト総数・tsc・lint・build・bundle増減・lazy chunk・staging Journey完走・console・4xx・404・各未変更確認・未完成・人間判断事項・次Phase候補。

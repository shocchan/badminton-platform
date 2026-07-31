# Phase 2E-1.12 依頼文（ChatGPT「AI日本語学習監督」生成・NEXT_PHASE_PROMPTマーカー間の抽出・2026-07-28）

あなたはClaude Codeです。以下の条件でPhase 2E-1.12「Guided Journey Continuity & Safe Local State Isolation」を実装してください。

## 0. Phaseの目的
内部管理ツールを増やすものではない。初回学習者が「目的を選ぶ→短い診断を実際に完了する→推薦された最初の練習を実際に完了する→実際の結果を反映した完了画面へ戻る」まで、一度も導線を失わずに完走できるlearner-facing Journeyを完成させる。同時に、Journey用状態と既存の語彙進捗・復習予定・試作状態をコード上で分離し、検証・reset・Recoveryによる進捗消失を防ぐ。

## 1. 作業条件
ブランチ: feature/ai-course-learning-polish。labPreview限定・stagingまで。
禁止: mainマージ／本番デプロイ／共有Supabase変更／migration適用／RLS変更／Secrets・APIキー変更／認証・OTP変更／料金・決済変更／learner正式データ変更／Andyさん接触／current_week・masteryState・XP・会話履歴変更／Realtime prompt全面変更／Edge Function本番変更／admin_overrides変更／教材本文・meaningZh・exJa/exZh・cognate・role確定値変更／human_reviewed・approved変更／root P0・P1の自動判断／Decision Console判断の教材反映／学習結果のSupabase正式保存／**消失した試作進捗の推測復元**／**wildcardによるstorage削除**／**sessionStorage.clear()またはlocalStorage.clear()**／**window変数のみへの退避**／大型state管理ライブラリ導入／外部有料サービス。必要になったらSTOP_FOR_HUMAN。

## 2. 目的（3つ）
A: 診断・練習との往復契約（完了・中断・失敗の結果をJourneyへ安全に戻す）
B: 実結果を反映したStep 4
C: ローカル状態の安全分離（JourneyのresetやRecoveryが他状態へ触れないことを固定）

## 3. 現状調査（実装前）
Journey route／診断route／語彙練習route／診断完了と練習完了を確認できる状態・callback・route／中断再開状態／復習予定を作る地点／完了処理の冪等性キー／browser back時の処理／session・localStorageの全関連キー（Journey・語彙進捗・復習予定・Decision Console・Inspector）／既存reset・debug・preview操作／進捗を削除し得るコード／key列挙・部分一致削除しているコード／window変数へ退避する検証コード。結果は短いdocsまたはrisk-register追記へ。

## 4. Journey Task Contract
Journeyと診断・練習の間の明示的なローカル契約: journeyId／journeySchemaVersion／currentStep／activeTaskType／activeTaskId／activeTaskStatus／taskStartedAt／taskCompletedAt／returnRoute／returnStep／completionTokenまたはnonce／lastSafeCheckpoint／completedTaskIds／completionSnapshot／journeyCompletedAt（名称は既存設計に合わせ可）。
activeTaskStatus: not_started／in_progress／completed／interrupted／failed／recovered。内部状態名は学習者へ表示しない。

## 5. 完了の信頼条件
query parameterやroute遷移だけで完了扱いにしない。
診断: session ID一致／完了イベントまたは確定済み結果が存在／activeTaskIdと一致／completion token未使用／問題上限と完了条件を満たす／中断状態ではない。
練習: session・word・sense一致／完了イベント発生／activeTaskId一致／token未使用／完了処理が一度だけ／復習予定の重複生成がない。
URL書換えやbrowser backだけで完了扱いにしない。

## 6. 診断終了後の自動復帰
結果を既存安全形式から読み取る／契約をcompletedへ／完了チェックポイント保存／**Step 3へ戻す**／focusをStep 3見出しへ／短い完了通知／推薦理由を再導出／同じ完了を二重処理しない。
表示例:「確認が終わりました。次は、今の結果に合う練習をします。」技術的な点数や内部roleを表示しない。結果が取得できない場合は完了を偽らずRecoveryへ。

## 7. 練習終了後の自動復帰
完了イベント確認／契約をcompletedへ／復習予定生成の冪等性確認／completion snapshot保存／**Step 4へ戻す**／focusを結果見出しへ／Journey完了を一度だけ記録／returning learnerへ遷移可能に。
練習画面からホームへ直接戻った場合: 完了済みならStep 4への復帰案内、未完了なら「続きから」または「いったんホームへ」。

## 8. Step 4の実結果
一般文ではなく実際に確定した結果から安全に導出: 今日確認した項目数／練習した語またはsense／自力でできた項目数／ヒントがあった項目数／もう一度確認する項目数／次回予定日／明日の復習予定数／推薦理由の短い振り返り。
内部state名・priority・role・masteryState・retained_preview等は出さない。結果が一部欠けている場合は0と断定せず、確認できた範囲のみ表示し「一部の結果を表示できませんでした」と簡潔に示す。Journey完了を偽らない。

## 9. 中断と復帰
診断途中でJourneyへ戻る→「確認の続きがあります」続きから／ホームへ。診断完了済みだがStep 3未表示→自動的にStep 3へ復元。
練習途中→「最初の練習の続きがあります」。練習完了済みだがStep 4未表示→自動的にStep 4へ復元。完了処理は再実行しない。
Journey完了後: onboardingを再表示しない／通常ホームを表示／初回結果を見直す導線は任意だが第一CTAにしない。

## 10. Browser Back／Forward
テスト: Step2→Step1／診断中back／診断完了直後back／Step3から診断routeへ／練習中back／練習完了直後back／Step4から練習routeへ／完了後forward／reload／bfcache相当。
要件: 完了イベント二重処理なし／復習予定二重生成なし／progress巻戻りなし／回答消失なし／無限redirectなし／staleなcompletion token再利用なし。

## 11. Storage Namespace
用途別にキーを明確に定義（Journey state／Journey task contract／vocabulary trial progress／review schedule／Decision Console／inspector UI state／developer-only preview state）。既存命名規則を優先。
最低限: prefixまたは明示的なkey定数／key registry／owner／storage type／schema version／reset policy／learner impact／lab-onlyか、をコードまたはdocsで確認可能に。

## 12. Safe Reset Allowlist
Journeyのreset／RecoveryはJourney用キーだけを対象に。
禁止: storage全消去／prefixの曖昧な部分一致削除／正規表現による広範囲削除／語彙進捗キー削除／復習予定キー削除／Decision Consoleキー削除／inspectorキー削除。
reset前に対象キーをコード上のallowlistから取得。テストで「Journeyキーのみ削除・vocabulary progress保持・review schedule保持・Decision Console保持・unrelated key保持」を固定。

## 13. 検証用の安全な空状態
**CEO端末の実データを削除して初回状態を作らない。**
優先順: route-scoped preview namespace／別の明示的なJourney sandbox storage namespace／新しいタブ内でのみ有効なisolated session state。
要件: 通常の語彙進捗と復習予定を読まない／通常キーへ書かない／UIで「検証用」と分かる／一般学習者非表示／sandbox終了時にsandboxキーのみ削除／通常状態へ戻れる／正式な認証・DB変更なし。内部管理画面を新設せず、labPreviewの初回Journey開始導線に限定。

## 14. Snapshotと退避
**window変数だけへ退避しない。** snapshotが必要な場合はsessionStorage内の専用snapshot key＋schemaVersion＋createdAt＋source keys＋checksum相当＋restore済みフラグ＋自動期限＋restore前preview。
ただし通常の初回Journeyでは既存進捗のsnapshot自体を不要にする設計を優先。sandbox namespaceで分離できるなら通常進捗の退避・削除を行わない。

## 15. Storage Failure
契約の保存に失敗した場合: 完了を成功保存したと偽らない／現在セッション内で表示できる場合は表示／再試行可能／ホームへ戻れる／同じ完了処理を無限再試行しない／復習予定を重複作成しない／技術詳細はlabPreview折りたたみのみ。

## 16. learner-facing文言
例:「続きから始めます」「確認が終わりました」「次は、今の結果に合う練習です」「練習が終わりました」「今日の結果をまとめました」「保存できませんでした。もう一度試してください」。
避ける: callback／return route／token／nonce／checkpoint／storage／hydration／stale／task contract／schema。

## 17. モバイル・アクセシビリティ
幅: 320×568／375×667／390×844／430×932／768×1024／desktop。
対象: 診断から戻ったStep3／練習から戻ったStep4／中断復帰カード／Recovery／browser back後／sandbox表示／第一CTA／結果内訳／長い中国語補助。
a11y: route復帰時のfocus／Step3・4見出しへのfocus／完了通知aria-live／中断状態alert／keyboardのみで完走／browser back後のfocus／色だけに依存しない状態／200% zoom／prefers-reduced-motion／44px以上。実スマートフォン確認は人間判断事項として残してよい。

## 18. テスト
Task Contract: journeyId一致／taskId一致／wrong task拒否／used token拒否／completion二重処理防止／interrupted／failed／recovered／schema incompatibility。
診断往復: Journey→診断／診断途中／診断完了／自動Step3復帰／reload／browser back／結果欠損／二重完了防止。
練習往復: Journey→練習／練習途中／練習完了／自動Step4復帰／復習予定重複防止／Sense一致／reload／browser back／二重完了防止。
Step 4: 実結果表示／一部結果欠損／次回予定／明日件数／第一CTA一つ／Journey完了一度のみ／returning learner移行。
Storage Isolation: key registry／Journey allowlist reset／vocabulary progress保持／review schedule保持／Decision Console保持／unrelated key保持／storage clear未使用／wildcard削除未使用／sandbox namespace／sandbox終了／通常状態非影響／window-only snapshot未使用。
**Incident Regression（R9再発防止）**: onboarding reset never deletes vocabulary progress／onboarding reset never deletes review schedule／preview journey uses isolated namespace／navigation never loses required snapshot／no storage clear operations。
UI・a11y: Step3復帰focus／Step4復帰focus／aria-live／interrupted card／Recovery／keyboard完走／320px overflow／200% zoom／tap target／reduced motion。
回帰: 既存669テスト・初回6状態・今日の復習・LearningClock・role推薦・Error Boundary・Decision Console・Connectivity Inspector・tsc・lint・build・staging console・network 4xx・画像404。

## 19. 推奨コミット
feat(onboarding): complete result-driven first-run journey ／ fix(storage): isolate journey state and harden safe reset ／ test(onboarding): cover continuity isolation and incident regressions。無関係な内部管理機能を追加しない。

## 20. 完了条件
Journeyから診断へ遷移／診断完了後Step3へ自動復帰／Journeyから練習へ遷移／練習完了後Step4へ自動復帰／実結果をStep4へ表示／完了イベント二重処理なし／復習予定重複なし／browser back安全／reload安全／interrupted復帰／failed復帰／result欠損Recovery／Journey完了一度のみ／returning learnerへ移行／onboarding再表示なし／Journey storage namespace分離／safe reset allowlist／vocabulary progress・review schedule・Decision Console・unrelated key 非削除／storage clear未使用／wildcard削除未使用／window-only退避未使用／isolated preview namespace／sandboxが通常状態へ非影響／R9回帰テスト／learner-facing内部用語なし／モバイル主要幅でoverflowなし／44px未満主要操作なし／keyboard完走／focus管理／基本a11y／全テスト成功／tsc 0／lint増分0／build成功／main bundle増減報告／lazy chunk報告／staging Journey完全完走／staging console error 0／network 4xx 0／画像404 0／教材本体・human_reviewed・approved・Supabase・migration・RLS・認証・learner正式データ・本番・main 変更なし。

## 21. STOP_FOR_HUMAN条件
診断・練習結果のSupabase保存／learner正式データ参照／current_week・masteryState・XP・会話履歴変更／RLS変更／admin_overrides変更／migration適用／認証変更／教材値変更／human_reviewed・approved変更／root P0・P1判断／**消失した試作進捗の推測復元**／本番／mainマージ。

## 22. 完了報告形式
実数付きで: 変更ファイル・コミット・Journey task状態数・Journey storage key数・key registry内容・reset allowlist内容・診断activeTask生成・診断完了検証・診断からStep3復帰・診断中断復帰・診断結果欠損Recovery・練習activeTask生成・練習完了検証・練習からStep4復帰・練習中断復帰・練習結果欠損Recovery・completion token再利用防止・二重完了防止・復習予定重複防止・browser back/forward/reload結果・Journey完了一度のみ・returning learner移行・Step4実結果項目・次回予定表示・第一CTA確認・vocabulary progress保持・review schedule保持・Decision Console保持・unrelated key保持・storage clear未使用・wildcard削除未使用・window-only snapshot未使用・isolated preview namespace・sandbox終了時削除対象・通常状態非影響・R9回帰テスト・320/375/390/430/768/desktop・44px tap target・200% zoom・keyboard完走・focus管理・aria-live・reduced motion・テスト総数・tsc・lint・build・bundle・staging・console・4xx・404・各未変更確認・未完成・人間判断事項・次Phase候補。

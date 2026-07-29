# Whole Product Completion Matrix（FOREST FIRST・最終評価）

評価値: complete / usable_with_rough_edges / broken / not_connected / deferred_to_hardening
（partialは使わない・§22）

**Whole Product Complete on Staging: YES**
**Production Ready: NO**（Production GO MatrixはNO-GOのまま維持。虚偽GOなし）

判定根拠（§22の条件）:
- broken = 0 / not_connected = 0
- 主要Journeyのdeferred_to_hardeningは DB同期・法務・実機・remote・本番 のみ
- 全主要入口が動く・全主要出口はHomeまたは次の学習へ戻る
- coming soon 0・placeholder文字 0・dead end 0（機械検査: worldAtlasテスト＋blocker manifest devラベルスキャン）

## 2026-07-29 session-12: staging実画面での全数確認（本matrixの実測裏取り）

72fd19dをstagingへ再deploy（2a1ef76f）し、認証済みlearner実画面でJourney A〜I・
全10エリア・N3 12単元接続・N2 12単元（173+7=180実データ検証）・404/破損復元/reload再開を確認。
実画面で発見したP1 3件は同日修正しredeploy（61864808）・実画面で修正確認済み:

1. 学習メニュー等の「試作」バッジ・文言が全learnerに表示 → ja「ベータ/ベータ版」zh「测试版」へ統一（N2辞書の既存表記に合わせた。labPreview限定の内部レビュー画面は対象外）
2. N3診断の「まだ習っていない（最初から学ぶ）」が誤答扱いで同一問題が無限再出題（行き止まり） → `markDiagnosticNotLearned`（診断のみ消化・wrong加算なし・復習行きなし・Stage1導入は必ず通る・Stage2出題は失わない）。テスト3件追加（計1068）
3. Chapter 1見出しの「（仮称）」が全learnerに表示 → 除去（名称の確定はCEO承認キューのまま）

| # | 領域 | 最終評価 | 根拠 |
|---|---|---|---|
| 1 | ログイン後RPG World Home | complete | Home＝ミナモ列島（IslandsMap 10エリアクリック可・現在地・霧・第一CTA一つ） |
| 2 | 初回ヒアリング | complete | CourseHearing（既存） |
| 3 | 主人公・現在地・学習ルート | complete | 現在地はlocalStorageからread only導出（deriveCurrentAreaId）・地図上に主人公 |
| 4 | 今日のQuest | complete | todayAction（会話の広場・目標表現・残回数） |
| 5 | 語彙学習（記憶の書庫） | complete | labPreviewゲート解除。今日の3語・カテゴリ・練習・診断が全learnerで動作 |
| 6 | 文法学習（文法の工房） | complete | しくみラボ全learner開放（today/units/records） |
| 7 | N3攻略（12単元） | complete | エリア1〜7→N3AreaPanel→N3UnitPanel。12単元完走テスト＋UIテスト |
| 8 | N2文法攻略（ソラノ塔） | complete | 180/180項目（draft173＋pre-draft7）。詳細/確認問題/使用練習/Result。Unit lazy chunk |
| 9 | AIテキスト会話 | complete | 既存（エンジン非変更） |
| 10 | AI音声会話 | complete | 既存（実機マイク品質はhardening） |
| 11 | 会話後レポート | complete | 既存＋worldLineJa（世界の変化） |
| 12 | 言い直し | complete | CourseRetryCard（既存） |
| 13 | 復習（オモイデ庭園） | complete | 統合入口: ことば再会/会話の思い出/N3復習予定/塔の読み直し/再会クエスト |
| 14 | 期限復習 | complete | 庭園に件数表示（会話due＋語彙due）・0件でも次の行動を提示 |
| 15 | 冒険・物語進行（Chapter 1） | complete | learner導線（エリア1・施設）から到達。devToolsは管理者のみ |
| 16 | XP・成長 | complete | AdventureRecordCard（冒険の進み）とGrowth（実力）を分離表示 |
| 17 | 学習履歴 | complete | CourseHistory（既存・庭園から導線） |
| 18 | 設定 | complete | CourseSettings（既存） |
| 19 | 問い合わせ | complete | SupportReportButtonをSettingsへ実装。送信先未設定は正直表示 |
| 20 | Loading | usable_with_rough_edges | 全stepにあり。世界観演出は一部簡素（P3） |
| 21 | Empty | complete | 庭園0件・quickreview空・成長データ少でも次の行動を提示 |
| 22 | Error | complete | 全lazy stepをLearnerErrorBoundaryで保護・errorCodes 16種 |
| 23 | Recovery | complete | 会話recovery＋Unit復元（corrupted/schema_newer）＋壊れたJSONは未学習扱い |
| 24 | mobile responsive | complete | 実測: 7画面で横overflow 0・42px未満ボタン0（320/390）。session-12でharness15画面×320/390/430/768/1280のheadless実測もoverflow 0・小ボタン0 |
| 25 | 日本語／中国語切替 | complete | uiLang切替（remountなし）。N2/N3は中文説明併記 |

## deferred_to_hardening（Whole Product Completeを妨げない項目）

- 学習進捗の正式DB同期（現在はlocalStorage/sessionStorage。「この端末に保存」と正直表示）
- RLS/entitlementのlocal実証・cross-device実DB実証・rollback/backup実行（Docker）
- 実機iPhone/Android・VoiceOver/TalkBack
- 利用規約・プライバシー（法務）・LP文言・support送信先確定
- CEO教材承認・ビジュアル承認（human_reviewed/approvedは自動昇格していない）
- 本番反映（APPROVE_AI_COURSE_PRODUCTION_RELEASE）

## Journey検証（§24）

- Journey A（初心者）: Home→エリア1→Chapter 1（E2E 14件）→語彙/文法/問題→会話（旅立ちカード→既存エンジン）→レポート＋世界の変化→庭園→Growth→Home
- Journey B（N3）: エリア→Unit Intro→診断→Stage1-3→Mission→Result→Review→次Unit（runtime 12単元完走＋UI 6件）
- Journey C（N2）: 塔→単元→詳細→確認問題→使用練習→Result→Review（UI 7件）
- Journey D（Recovery）: reload復元・corrupted→safe recovery・schema_newer（テスト済み）
- Journey E（Error）: 保存失敗の正直表示・chunk失敗retry・boundary→Home（テスト済み）

### session-12 staging実画面での完走記録（2026-07-29・認証済みlearner画面）

- Chapter 1: Quest 2を実完走（語彙2語→文法→産出→冒険値+20→霧が晴れ主人公移動）。進行は検証用保存領域
- N3 Unit 1（自己紹介と身分）: 診断10問→Stage1→Stage2→Stage3→場面ミッション3問→Result（12/12語・正答率95%・復習1語）→世界へもどる→エリア霧晴れ→次エリア解放を実完走
- N3 代表Unit: 変化と継続（エリア7・74問構成）・人と関係（エリア5・cognate語表示）でIntro/診断の実表示確認
- N2: 塔一覧12単元→第1単元15文型→〜あげく詳細→確認問題正解→使用練習入力→記録→会話導線を実完走。第6・第12単元のlazy chunkも実表示
- AI会話: テキスト（目標表現使用検知→レポート）と音声（実接続→字幕→まとめ終了→レポート）の両方で「カタリ港の霧が晴れました」＋次回復習日を実確認
- 庭園: 今日の再会件数・5入口すべて実遷移（当日の学習が正確に反映）
- 成長/履歴/設定: 晴れたエリア1/7・N3 1/12・N2 1/180の正確な集計・復習期日一覧・字幕3モードを実確認
- Recovery/Error: 破損state注入→安全復旧バナー→最初から、reload→続き（残り9問）から再開、存在しないroute→404ページ（復帰導線つき）を実確認
- 全10エリア: 実画面でIntro・相手・実用ミッション・攻略単元リスト（合計12単元）を確認。カタリ港は旅立ちカード（相手/目的/ことば/所要/残回数）

# 完了報告: 中国語ローカライズ漏れ修正＋ことば図鑑の目的・レベル・ゴール可視化（2026-07-30）

ブランチ: feature/ai-course-learning-polish ／ commits: a684768（A: zh配線）→ 8d91fbf（B: 図鑑正準化）→ 本報告commit（fogClearedToday修正含む）
staging: https://staging.badminton-platform.pages.dev（index-a8ZPu6gs.js 反映・実画面確認済み）
テスト: **1120件 PASS**（開始時1078→+42）／ tsc 0エラー ／ lint 新規エラー0（既存ベースラインのみ）

## A. 中国語ローカライズ（設計→実装→実画面）

### 設計
- 方針: 操作UI（ボタン・リンク・見出し・placeholder・状態・エラー・aria）はzhへ、**学習対象の日本語（単語・文型・例文・ふりがな・産出対象・RPG固有名詞）は日本語のまま**。
- 辞書: `src/locales/aiCourse.ts` に world / n3a / n3u / n2q / garden / advRec / katari / ch1 / vocabScope をja/zh対で追加（型は `AiCourseDict = typeof ja` でzhの欠落をコンパイル時検出）。
- データ層: worldAtlas 10エリアに storyPurposeZh/learningThemeZh/characterZh/practicalMissionZh、n3UnitSpecs 12単元に situationZh/goalZh、unitRuntime に unlockZh。

### 実装（配線9コンポーネント＋1修正）
1. N3UnitPanel／2. N3AreaPanel／3. N2GrammarQuestPanel／4. WorldHomeShell／5. IslandsMap（aria）／6. OmoideGardenPanel／7. AdventureRecordCard／8. KatariPortIntro／9. Chapter1AdventurePanel（devToolsは対象外＝日本語のまま）
追加修正: 会話結果画面の world line「カタリ港の霧が…」→ t.katari.fogClearedToday（zh: カタリ港（会话之港）的雾，散去了今天的一份。）

### 実画面（staging・CEO Chrome・zh locale）
- CEO報告の5文字列すべてzh化を確認: 返回第1单元列表／使用练习／请使用「〜あげく」写一句话／检查我的句子／今天先只阅读（スクリーンショット取得済み）
- World Home: 当前位置・雾状態・前往会话广场・前方的路（第N周）・本周前进天数・施設fn/body zh化、RPG固有名詞（記憶の書庫等）は日本語維持
- ソラノ塔: 塔説明・第N单元・学习第N层的句型・draft注記 zh
- N3: エリアパネル（学ぶこと・ミッション・攻略0/3）・単元イントロ（題量参考74题・完成条件・unlockZh）zh
- オモイデ庭園: 5行すべてzh＋件数バッジ
- ja回帰: ja画面にzh混入なし（現在地:・この先の道・記憶の書庫 等を確認）

## B. ことば図鑑の可視化（設計→実装→実画面）

### 設計（単一情報源: `vocabCanonical.ts`）
- 正準再計算（scripts/ai-course/vocab-canonical-stats.ts）: **過去報告と完全一致** — 140語＝基礎78＋N3準備62、required 95・diagnostic 37・optional 7・enrichment 1、cognate: transparent 54/mostly 2/partial 46/false friend 9/日本語特有 13/no_cognate 16/unreviewed 0、高リスク12、orphan 0・重複0・12単元で140語全カバー（encounter 31）
- 「全部終えた」の定義: カードを開いた数ではなく ①必須語の確認 ②注意語（同形語）の確認 ③使う練習 ④復習への接続 の4条件（テストで「全カード閲覧でも0」「自己申告でも0」を機械検証）
- 学習状態: 未学習/学習中/復習中/定着候補（定着候補は検証済み状態のみ。自己申告・本人レベルから習得を自動判定しない）
- レベル別表示: estimatedLevel→beginner/n3/advanced の表示切替のみ（上級=「基礎語彙は短い診断で確認し、使い分け・誤用・会話練習を優先」＋N2塔/AI会話/ミッション導線）
- スコープの正直さ: 「このコースで使うコア語彙 基礎からN3準備までの140語」＋「この140語だけでJLPT N3の全語彙を網羅するものではありません」（ja/zh）。N1偽装なし（文言ガードテスト付き）

### 実装
- `VocabularyHubHeader`（純表示・storage非依存→390pxハーネス単体レンダリング可能）: タイトル→スコープ→内訳→進捗（学習を始めた語）→状態チップ→全部終えると（4条件数値）→レベル別案内→免責→記憶の書庫の位置づけ
- 図鑑トップ: ヘッダー＋**11フィルター**（すべて/基礎/N3準備/必須/診断/覚えた(自己申告)/復習したい/未学習/同形語注意/意味範囲注意/日本語特有）×検索併用（触るまで一覧非表示でトップを長大化させない）
- 詳細画面: 「この語を使う場所」= n3UnitSpecs/worldAtlasの実関係のみ（ここで学ぶ/再登場/ミッションで使う）
- AiCoursePage→learnerLevel（estimatedLevel）を図鑑へ供給

### 実画面
- zh: 本课程使用的核心词汇／140个词／基础78・N3准备62／未学习140→（操作後）ライブ更新／高级学习模式（CEOアカウントの実レベルN2で発火）／同形词注意=9词（実数一致: 出身・勉強する・安い・上手・先生・情報・都合・約束・大変）／大変詳細に「使用这个词的地方: カタチの遺跡・状况与评价 在这里学习」
- ja: ヘッダー・フィルター・免責すべて表示（スクリーンショット取得済み）。状態カウントが実操作で 1/140（学習中1）へライブ更新することを確認
- モバイル390px: headlessハーネスで ja/zh 両方を実測（チップ3行折返し・横スクロールなし・検索欄全幅）

## テスト追加（+42）
- `vocabCanonical.test.ts`: 正準数の恒等式・role合計・ID重複0・フィルター実数一致・検索併用・状態遷移・自己申告≠習得・完了4条件・レベルティア・RPG接続全140語・文言ガード（ja/zh）
- `vocabularyHubScope.test.tsx`: ヘッダー表示・ティア切替・11チップ・絞り込み実数・空結果・selfKnown注記・learnerLevel供給・zh表示・詳細のRPG接続（ja/zh）
- 既存テストは配線に伴うt注入のみ（挙動変更なし）

## 正直な開示
1. **検証中に会話セッションを1回消費**: zh実画面確認でホームCTA「开始今天的会话」をクリックしたところ、カタリ港イントロを経由せず即セッションが開始された（イントロはhasResume時のみ）。約30秒・発話なしで「总结并结束」で終了。CEOアカウントに 会話+1回（22→23）・当日残-1・「〜をしています」ミッションの完了記録・復習予定(8/1) が付いた。以後、記録を書くボタン（markProduced等）は一切押していない。
2. 図鑑の語彙進捗はsessionStorage準拠のため、私の閲覧で付いた「学習中1」はタブを閉じれば消える。
3. エリア名の表記: 地図ラベルは日本語固有名詞（ミナト等）、エリア詳細見出しはデータのnameZh（形之遗迹等）。データ設計由来の混在で、正式名称は human review 対象（名称はすべて仮称）。

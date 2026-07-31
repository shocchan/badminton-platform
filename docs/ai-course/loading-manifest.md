# 待ち時間表示（Loading）manifest — Phase B-3

学習者に見える非同期・復元・遅延読み込みの全数と、その待ち時間表示の状態。
実装は `src/components/ai-course/CourseLoading.tsx` に集約。要件テストは
`src/components/ai-course/courseLoading.test.tsx`（14件）。

## 共通componentが満たす要件

| 要件 | 実装 |
|---|---|
| 200ms未満はちらつかせない | `delayMs=200`。未表示中は高さだけ確保し `aria-hidden` |
| layout shiftなし | `minHeightClass` を表示前後で同じに保つ |
| 処理中だと分かる | 表示時のみ `role="status" aria-live="polite"` |
| 終了後に読み続けない | 親のunmountで status ごと消える（テストで固定） |
| ja / zh | 文言はすべて `t.common.*`。zhに日本語が混ざらないことをテスト |
| reduced motion | アニメは `motion-safe:` のみ。素の `animate-` を使わないことをテスト |
| offline | `navigator.onLine` を監視し、待ちではなくオフラインと正直に表示。復帰も検知 |
| timeout | 既定10秒で「時間がかかっています」＋やり直し導線 |
| retry | `onRetry` があれば「もう一度」、無ければ「再読み込み」 |
| 演出を読ませない | 装飾は `aria-hidden`。状態は文言だけで伝える |

場面の一言（generic spinnerの一律表示をやめるため）:
`mist`=ことばの霧が晴れる / `grains`=記憶の粒が集まる / `map`=地図の光が進む / `step`=一歩進む。

## 対象一覧（learner-visible）

| # | 領域 | route / 位置 | async source | 表示 | 状態 |
|---|---|---|---|---|---|
| 1 | アプリ全体のルート切替 | `App.tsx` Suspense | lazy route chunk | localized spinner + sr-only status | ✅ 対応（ja/zh修正済み） |
| 2 | コース入口の振り分け | `AiCourseEntry` | `getSession()` 認証確認 | localized spinner + sr-only status | ✅ 対応（ja/zh修正済み） |
| 3 | コース入口 → 学習アプリ | `AiCourseEntry` Suspense | `AiCoursePage` chunk | 同上 | ✅ 対応 |
| 4 | セッション復元 | `AiCoursePage` step='loading' | 認証・learner復元 | `CourseLoading scene=mist` | ✅ 対応 |
| 5 | learner未取得 | `AiCoursePage` | 同上 | `CourseLoading scene=mist` | ✅ 対応 |
| 6 | 成長（Growth） | `AiCoursePage` growth | `courseGrowth` 計算 chunk | `CourseLoading scene=mist` | ✅ 対応 |
| 7 | しくみラボ | `AiCoursePage` step='lab' | `FoundationLabShell` chunk | `CourseChunkLoading scene=map` | ✅ 対応 |
| 8 | ことば図鑑 | `AiCoursePage` step='vocab' | `VocabularyHub` chunk | `CourseChunkLoading scene=map` | ✅ 対応 |
| 9 | 章（Chapter） | `AiCoursePage` | `Chapter1AdventurePanel` chunk | `CourseChunkLoading scene=map` | ✅ 対応 |
| 10 | N3エリア | `AiCoursePage` | `N3AreaPanel` chunk | `CourseChunkLoading scene=map` | ✅ 対応 |
| 11 | N2クエスト | `AiCoursePage` | `N2GrammarQuestPanel` chunk | `CourseChunkLoading scene=map` | ✅ 対応 |
| 12 | 単元bundle読込 | `FoundationLabShell` | `loadFoundationUnit()` | `CourseLoading scene=grains` + onRetry | ✅ 対応 |
| 13 | 単元一覧の全件読込 | `FoundationLabShell` | 全unit読込 | `CourseLoading scene=grains` | ✅ 対応 |
| 14 | 図鑑内の復習パネル | `VocabularyHub` | `VocabReviewPanel` chunk | `CourseChunkLoading scene=grains` | ✅ 対応 |
| 15 | 図鑑内の各lazy panel | `VocabularyHub` ×6 | 各chunk | `CourseChunkLoading scene=grains` | ✅ 対応 |
| 16 | 今日のミッション決定 | `CourseHome` | plan計算 | `CourseLoading scene=step`（青カード上） | ✅ 対応 |
| 17 | N3ユニット読込 | `N3UnitPanel` | unit spec読込 | `CourseLoading scene=map` | ✅ 対応 |
| 18 | N2ユニット読込 | `N2GrammarQuestPanel` | unit data読込 | `CourseLoading scene=map` | ✅ 対応 |
| 19 | AIテキスト会話の応答待ち | `CourseTextLesson` | LLM応答 | 既存の3点演出 + `role=status aria-live`（B-3で追加） | ✅ 対応 |
| 20 | AI音声の字幕生成待ち | `CourseVoiceLesson` | 字幕`pending` | 行内の逐次表示（全画面待ちではない） | ✅ 対応（既存で妥当） |

### 待ち表示を出さないと判断したもの（理由つき）

| 位置 | 内容 | 判断 |
|---|---|---|
| `CourseHome` レッスン開始ボタン | `starting ? t.common.loading` | ボタン自身のラベル変化＋disabled。全画面の待ち表示は不要 |
| `CourseSettings` ニックネーム保存 | `state==='saving'` | 同上。結果は隣の `aria-live` で通知済み |
| `CourseLogin` / `CourseIssueReport` | `busy` でボタンdisabled＋文言変化 | 同上 |
| `AiCourseAdminPage` | 管理者専用画面 | learner-visibleではないため対象外（文言は localized 済み） |

## 既知の残（P3・AIコース外）

バドミントン側（`EntryForm` / `StripePaymentForm` / `AdminPage` / `MyPage` 等）に
素の `animate-spin` が残っている。reduced-motionで止まらない。AIコースのリリース対象外のため
B-3では触らず、P3 backlogとして記録する。`MyPage.tsx` の `aria-label="読み込み中"` も同様。

## 置き換え手順（将来 loading 演出を差し替える場合）

1. `CourseLoading.tsx` の `SceneMark` だけを変更する
2. `courseLoading.test.tsx` を実行（motion-safe・aria・文言の要件が壊れていないか）
3. 各画面側は `scene` を渡しているだけなので変更不要

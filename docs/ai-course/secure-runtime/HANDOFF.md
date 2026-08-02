# Secure Runtime + 24h Trial + Adventure Review — 引継ぎ

2026-08-02 セッション終了時点。branch `feature/ai-course-secure-runtime-review`（base `5ca89ea`）。

**Secure Adventure Runtime Ready: NO.**

P0 は**サーバー側が完成して実証済み、クライアント側が未着手**という状態。
配信経路は動いているが、教材はまだ client bundle にも入ったままなので、
公開露出の数字は 1 bytes も減っていない。

---

## 完了したもの

### Phase 1（commit `d9942a2`）

- **全プランでアカウント必須**。判断点は `sales/accountGate.ts` 1か所
- `StartCheckoutInput.learnerId` を必須化 → 未接続の呼び出し7か所が型で露見
- 決済経路でアカウントを作らない
- **60分パスの状態モデル** `sales/trialActivation.ts`：
  `unstarted → active → consumed / expired`、開始で `expiresAt = 開始時刻 + 丸24時間`

### Phase 2 前半（commit `31879bd`）

- **`sales/contentDelivery.ts`** = 教材を渡してよいか決める唯一の関数
- **`npm run measure:ai-course-content-exposure`** で露出量を機械的に測れるようにした

### P0 サーバー側（commit `ecd5a77`）← 今回

判断層はあったが**誰も呼んでいなかった**。呼ぶ相手を作り、実HTTPで確かめた。

| 作ったもの | 中身 |
|---|---|
| `scripts/ai-course/build-content-shards.mts` | ビルド時に問題を実体化し20問ずつのページへ切る |
| `worker/index.ts` | 旧 `generate-worker.mjs` のテンプレート文字列から実ファイルへ移行 |
| `worker/aiCourseContent.ts` | `/api/ai-course/content`。認証→判断層→R2→削って返す |
| `scripts/generate-worker.mjs` | esbuild で worker を束ねる。教材混入を毎回検査 |
| `scripts/ai-course/seed-local-r2.mjs` | local R2 へ投入（remote を触らない） |
| `scripts/ai-course/verify-content-endpoint.mjs` | 実HTTP検証 19項目 |
| `src/lib/aiLesson/course/sales/contentClient.ts` | client 側の取得入口（テスト13件） |
| `docs/.../content-delivery-decision.md` | 方式選定の根拠 |

**実HTTP検証 19/19 PASS**（local miniflare + local R2、remote 未使用）：
401×3（未認証・期限切れJWT・改ざんJWT）／403×8（改ざんtoken・他人のtoken・
利用権なし・未開始・期限切れ・使い切り・鍵付きステージ・範囲外step）／
429（高速列挙 20/60 が制限）／200（現在stepのみ5件・内部ID非返却）／
**60分ぶん40step 連続で拒否0**。

#### 実測して見つけて直した2件

1. **正解位置が 99.6% で `c0` だった。** バンクは正解を先頭に置き、表示順は実行時
   シャッフル前提。ビルド時に元の並びで位置IDを振ったため答えが位置で分かる状態に
   なっていた。`seededFisherYates` で並べ替えてから振るよう修正し、
   偏り検査をビルドに常設（現在 c0 24.6% / c1 25.4% / c2 24.8% / c3 25.3%）
2. **語彙は同じ targetId でも要求レベルで中身が変わる。** `vocab-n3` は
   N3要求586問 / N2要求602問。誤答をその要求レベルの語彙全体から選ぶため。
   R2 キーから level を外そうとして hash 照合の番人に止められた

---

## 🚨 未完了：P0 のクライアント側（次の最優先）

```
Client Static Bank Imports:  36ファイル / 3,617,390 bytes（Before = After・未着手）
```

サーバー側の受け皿は完成しているので、残りは**各画面を非同期取得へ寄せる作業**。

### 露出の内訳と、それを引き込んでいる client

| チャンク | bytes | 引き込み元 |
|---|---|---|
| `ai-course-vocab-content` | 1,048,961 | `vocabQuestions.ts` → `content/vocabContentBank` |
| `ai-course-reading` | 372,853 | `AdvShell` / `AdvMockRunner` / `AdvReadingRunner` |
| `ai-course-listening` | 300,813 | `AdvShell` / `AdvMockRunner` / `AdvListeningRunner` |
| `AiCoursePage` | 261,836 | `courseGrowth` 経由 |
| `courseGrowth` | 247,913 | `courseRepository` / `AiCoursePage` |
| `OnoDraftsPanel` | 174,666 | 文法draft パネル |
| `AdvShell` | 166,679 | `advContent` + 両bank |
| `n3GrammarDrafts` | 155,137 | `AdvShell` / `N3GrammarDraftsPanel` / `advContent` |
| `VocabularyHub` | 136,481 | `foundationVocabBank` |
| `vocabConversationPractice` | 102,673 | 語彙会話練習 |
| 残り26ファイル | 約649,000 | foundationUnit1〜6 / unitRuntime / n2GrammarDraftsUnit* ほか |

### 想定より大きい理由（着手前に知っておくこと）

依頼書は「4コンポーネント + advContent + vocabQuestions」を想定しているが、
実際は **`foundationVocabBank` だけで11モジュールが import** している
（`VocabularyHub` / `N3AreaPanel` / `Chapter1AdventurePanel` / `vocabCanonical` /
`vocabConnectivity` / `vocabHomeSummary` / `vocabularyPacks` / `vocabularyReview` ほか）。
`n3GrammarDrafts` も8モジュール。

さらに **`AdvShell`（1,174行）は pool 全体を組み立てて runner へ渡す設計**で、
runner 側は `readingToQuestion(set)` のように **set 丸ごと**を受け取る。
つまり「bank の import を消す」だけでは済まず、
出題選択・mastery台帳・模試構成をサーバー配信前提へ寄せる必要がある。
これは実質 Phase 3 の作業と重なる。

### 進め方の提案

1. `contentClient.fetchStepContent()`（作成済み・テスト済み）を唯一の入口にする
2. `vite.config.ts` に **alias の番人**を入れ、client 側から bank を import したら
   ビルドが落ちるようにする（消し忘れを機械で止める）。
   ただし全消し前に入れると build が通らないので、変換と同時に入れる
3. 大きい順に潰す（語彙 1.05MB → 読解 373KB → 聴解 301KB）
4. 各段階で `npm run measure:ai-course-content-exposure` の数字を確認する

---

## 未着手：Phase 3〜6

| Phase | 内容 | 状態 |
|---|---|---|
| 3 | AiCoursePage / AdvShell へ entitlement とサーバー正準 active-time を接続 | 未着手 |
| 4 | 鍵付き冒険マップ（metadataのみ）＋アップセルを本体へ接続 | 未着手 |
| 5 | staging専用 review page `/ja\|zh/ai-course/review` | 未着手 |
| 6 | §14 A〜F の実測・staging実証 | 未着手 |

---

## 新しく分かった問題（P0 とは別）

### 1. 聴解音声 49MB が認証なしで公開されている

`dist/audio/ai-course/` に配信されている。テキストを非公開にしても
**音声が公開のままなら聴解教材は実質取得できる**。
`measure:ai-course-content-exposure` はテキストしか測らないので数字に出ない。
R2 + 署名付きURL にするか、公開のままとするか **CEO判断が要る**。

### 2. 正解が配信payloadに含まれる

`correctChoiceId` を client へ渡して client 側で採点している（既存設計）。
つまり**正規の学習者は全問の答えを取り出せる**。
位置の偏りは直したが、答えそのものは payload にある。
サーバー採点にすれば塞がるが、往復が増えるので設計判断が要る。

---

## remote 変更（すべて未実行・CEO承認要）

staging と production は同じ Supabase プロジェクト `jdkwijdphlkrcoiggfqw` を共有している。

| 種別 | 対象 | 状態 |
|---|---|---|
| R2 | バケット `ai-course-content` 作成 | **未実行** |
| R2 | Pages プロジェクトへ binding `AI_COURSE_CONTENT` 追加 | **未実行** |
| R2 | 教材1,024ページのアップロード（`seed-local-r2.mjs --all` の remote 版） | **未実行** |
| Secret | `AI_COURSE_CONTENT_TOKEN_SECRET` | **未設定** |
| Secret | `SUPABASE_JWT_SECRET`（Worker が access token を検証するため） | **未設定** |
| migration | `20260803000000_ai_course_sales.sql` | 未適用 |
| migration | 60分パスの `activated_at` / `expires_at` を持つ表 | 未作成 |
| Edge Function | `ai-course-checkout` | 未デプロイ |
| Edge Function | `ai-course-auth` の招待コード必須を外す改修 | 未着手 |

⚠️ `AI_COURSE_DEV_TOKENS` は **local 専用**。本番に設定するとトークン発行口が開く。
`wrangler.dev.toml` の鍵はすべて local 用の偽値で、本番では使わない。

### 切り戻し

`main` にも `feature/ai-course-selfserve-sales` にもマージしていない。
remote を一切触っていないので、branch を捨てれば元に戻る。

---

## 次セッションの開始手順

```bash
cd ~/badminton-secure-runtime && git log --oneline -3
```

HEAD が origin/`feature/ai-course-secure-runtime-review` と一致し、
working tree が clean であることを確認してから始める
（先頭commitは「教材取得の client 入口と、P0 の残量を実測した引継ぎ」）。
`.env` は gitignore なので、無ければ `~/badminton-sales/.env*` からコピーする。

配信経路を動かして確かめたいとき：

```bash
npm run build:staging && npm run build:ai-course-content && node scripts/ai-course/seed-local-r2.mjs && npm run dev:worker
```

別ターミナルで：

```bash
node scripts/ai-course/verify-content-endpoint.mjs
```

着手順は **P0クライアント側 → Phase 3 → 4 → 5 → 6**。

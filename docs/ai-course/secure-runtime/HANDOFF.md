# Secure Runtime + 24h Trial + Adventure Review — 引継ぎ

2026-08-02 セッション終了時点。branch `feature/ai-course-secure-runtime-review`（base `5ca89ea`）。

**Secure Adventure Runtime Ready: NO.** 6 Phase 中 1.5 Phase まで。

---

## 完了したもの

### Phase 1（commit `d9942a2`）

- **全プランでアカウント必須**。判断点は `sales/accountGate.ts` 1か所
- `StartCheckoutInput.learnerId` を必須化 → 未接続の呼び出し7か所が型で露見
- 決済経路でアカウントを作らない（支払い後に作ると「払ったのに誰のものでもない利用権」が残る）
- 相談申込も同様。同意は `applicationId` ではなく `learnerId` に紐づく
- **60分パスの状態モデル** `sales/trialActivation.ts`：
  `unstarted → active → consumed / expired`、開始で `expiresAt = 開始時刻 + 丸24時間`
- 副次発見：料金ページの購入済み判定が `'sim_learner_1'` 固定だった（修正済み）

### Phase 2 前半（commit `31879bd`）

- **`sales/contentDelivery.ts`** = 教材を渡してよいか決める唯一の関数。
  認証 → 利用権 → セッション所有 → ステージ開放 → 範囲 の順で判断
- 実測で2件の弱点を発見・修正（連打制限が未来の記録を数えていた／選択肢の内部IDが漏れうる）
- **`npm run measure:ai-course-content-exposure`** で露出量を機械的に測れるようにした

---

## 🚨 未完了：P0（教材の公開露出）

**現状 36ファイル / 3,617,390 bytes が認証なしで取得できる。**

```bash
npm run build:staging && npm run measure:ai-course-content-exposure
```

強制層（`contentDelivery.ts`）は作ったが、**まだ誰も呼んでいない**。
教材は依然として静的importで client bundle に入っている。

### 露出の内訳（上位）

| チャンク | bytes |
|---|---|
| `ai-course-vocab-content-*` | 1,048,961 |
| `ai-course-reading-*` | 372,853 |
| `ai-course-listening-*` | 300,813 |
| `AiCoursePage-*` | 261,836 |
| `courseGrowth-*` | 247,913 |
| `OnoDraftsPanel-*` | 174,666 |
| `AdvShell-*` | 166,679 |
| `n3GrammarDrafts-*` | 155,137 |
| `VocabularyHub-*` / `vocabConversationPractice-*` ほか | 残り |

依頼書が名指しした3バンクは 1.72MB だが、**実際の露出はその倍以上**。
文法draft・foundation・語彙会話練習も同じく公開されている。

### 配信経路の設計（調査済み・未実装）

⚠️ **`functions/` ディレクトリは使えない。**
`scripts/generate-worker.mjs` が `dist/_worker.js` を生成するため Cloudflare Pages は
**advanced mode** で動き、`functions/` は無視される（`functions/api/admin/shuttle-log.ts` も
現状は到達しない可能性が高い。要確認）。

したがって教材エンドポイントは `_worker.js` 側に入れる必要がある。手順：

1. `worker/aiCourseContent.ts` を作り、教材bankを **worker 側で** import する
   （worker は実行されるだけで公開配信されないので、ここに入れれば露出しない）
2. `scripts/generate-worker.mjs` を esbuild で bundle する形へ変更し、
   `/api/ai-course/content` を `handleRequest` へ配線する
3. クライアント側の静的importを削除し、`contentDelivery` 経由の fetch に置換
4. `vite.config.ts` の `manualChunks` から教材エントリを削除
5. `npm run measure:ai-course-content-exposure` が **0 になるまで**繰り返す
6. source map にも本文が残らないことを確認（計測スクリプトは `.js.map` も見る）

**worker のサイズ上限に注意**：教材は非圧縮で約3.6MB。gzip で 1MB を超えると
無料枠の Worker script 上限に当たる可能性がある。当たる場合は
「試験に必要な最小セット」だけ worker に載せ、残りは別の保管先を検討する。

### クライアント側の改修規模

同期的に bank を読んでいる箇所：

- `components/ai-course/adventure/AdvShell.tsx`
- `components/ai-course/adventure/AdvBattleRunner.tsx`
- `components/ai-course/adventure/AdvReadingRunner.tsx`
- `components/ai-course/adventure/AdvListeningRunner.tsx`
- `components/ai-course/adventure/AdvMockRunner.tsx`
- `lib/aiLesson/course/adventure/advContent.ts`（`vocabPool` / `listeningSetsFor` / 読解セット）
- `lib/aiLesson/course/adventure/vocab/vocabQuestions.ts`

`listeningSetsFor(level)` / `listeningSetById(id)` / `vocabPool(level, seed)` のような
**狭い入口**があるので、この関数群を非同期のプロバイダへ差し替えるのが最短。
ただし `advContent.ts` は純関数として同期的にプールを組み立てているため、
呼び出し側まで非同期が波及する。

---

## 未着手：Phase 3〜6

| Phase | 内容 | 状態 |
|---|---|---|
| 3 | AiCoursePage / AdvShell へ entitlement とサーバー正準 active-time を接続 | 未着手 |
| 4 | 鍵付き冒険マップ（metadataのみ）＋アップセルを本体へ接続 | 未着手 |
| 5 | staging専用 review page `/ja|zh/ai-course/review` | 未着手 |
| 6 | §14 A〜F の実測・staging実証 | 未着手（計測スクリプトのみ作成） |

前セッションからの未接続項目（`docs/ai-course/sales/SESSION_CLOSEOUT.md` §5）も
そのまま残っている：active-time・利用権チェック・アップセル・学習中analytics。

---

## remote 変更（すべて未実行・CEO承認要）

staging と production は同じ Supabase プロジェクト `jdkwijdphlkrcoiggfqw` を共有している。

| 種別 | 対象 | 状態 |
|---|---|---|
| migration | `20260803000000_ai_course_sales.sql`（前セッション作成） | 未適用 |
| migration | 60分パスの `activated_at` / `expires_at` / 開始期限を持つ表（**未作成**） | 未作成 |
| Edge Function | `ai-course-checkout`（前セッション作成） | 未デプロイ |
| Edge Function | `ai-course-auth` の**招待コード必須を外す**改修（**未着手**） | 未着手 |

⚠️ 現在の `ai-course-auth` は初回登録に招待コードを要求するため、
**購入者は実OTPでアカウントを作れない**。今は模擬決済モードの模擬アカウントでのみ
導線が通る。本番でセルフサービス販売を成立させるには、この Edge Function の改修が要る。

### 必要な環境変数

| 変数 | 置き場所 | 現状 |
|---|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `.env.staging` | 未設定（`pk_test_` のみ有効） |
| `STRIPE_SECRET_KEY` | Supabase Secrets | 未設定 |
| `AI_COURSE_CONTENT_TOKEN_SECRET` | worker env | **未設定**（次stepトークンの署名鍵） |
| `SUPABASE_ACCESS_TOKEN` | `~/.supabase_backup_token` | 設定済み |

### 切り戻し

このブランチは `main` にも `feature/ai-course-selfserve-sales` にもマージしていない。
問題があれば branch を捨てるだけでよい（remote 変更を一切していないため、
DB・Edge Function・production の状態は触っていない）。

---

## 次セッションの開始手順

```bash
cd ~/badminton-secure-runtime && git log --oneline -3
```

`31879bd` が HEAD で working tree が clean であることを確認してから始める。
`.env` は gitignore なので、無ければ `~/badminton-sales/.env*` からコピーする。

着手順は **P0 → Phase 3 → 4 → 5 → 6**。P0 を後回しにすると、
runtime を接続したあとで配信経路を差し替えることになり二度手間になる。

# Secure Runtime + 24h Trial + Adventure Review — 引継ぎ

2026-08-03 セッション4終了時点。branch `feature/ai-course-secure-runtime-review`（base `5ca89ea`）。

**Local Secure Adventure Complete: YES ／ Remote Secure Adventure Ready: NO（remote変更・実環境E2Eが未実施のため）**

セッション4の到達点:
- **learner教材のpublic露出 0件・0 bytes**（会話教材89KBも目次/本文分離でserver配信化）
- 正解位置: 4択 a:24 b:24 c:16 d:16 / 3択 a:16 b:12 c:12 d:0（選択肢数別に検証・FAIL条件常設）
- active中アップセル（残り10分以下）実接続。「表示記録が自分を消す」自滅バグをE2Eが発見→sticky修正
- **実ブラウザE2E 3本 PASS**（Playwright + wrangler dev + local R2・remote不接触を機械的に保証）。
  発見した実バグ: 購入完了→利用権ストア未接続（買っても始められない）→修正済み
- E2E成果物: `e2e-results/steps/*.png`（17枚）+ trace.zip（gitignore・`npx playwright test`で再生成）
- remote承認パック: `REMOTE_DEPLOYMENT_APPROVAL.md`（R2/Secrets/migration/EdgeFn/分離方針/実行順）
- 推奨: **staging専用Supabaseを先に作る（案2）**。詳細は承認パックE

---

（以下はセッション3時点の記録。数字は当時のもの）

---

## 露出の実測（Before → After）

| 指標 | Before | After |
|---|---|---|
| 教材テキスト（公開chunk） | 36ファイル / 3,617,390 bytes | **1ファイル / 89,147 bytes（97.5%減）** |
| 聴解音声（公開） | 200ファイル / 44MB | **0（dist/audio空・旧URLは404実測）** |
| source map | 0 | 0（維持） |
| 問題payload内の正解 | 全問に correctChoiceId | **なし（実HTTP検証）** |
| 採点 | client | **サーバー（回答後にのみ開示）** |
| _worker.js | 13.9KB（教材なし） | 63.9KB（編成エンジン込み・教材なし・混入検査つき） |

**残り1件**: `courseEngine` chunk 89KB＝会話コース教材（`courseData.ts` の COURSE_MISSIONS）。
会話レッスン本体（KatariPort・plan生成・journey）が同期参照しており、
サーバー移行は独立した次作業（下記「次セッション」参照）。

---

## 今回のcommit（時系列）

| commit | 内容 |
|---|---|
| `460b1cd` | シャードv2（完全プール実体化 293target/21,652問/文法doc254）＋音声を `content-audio/` へ退避 |
| `b8f0c27` | Worker: 活動別配信・サーバー採点・音声トークン配信・session発行。実HTTP 30/30 PASS |
| `4d322a4` | client全面移行（バトル・読解・聴解・模試・診断）＋foundation面のDEVゲート＋Phase3/4ゲート |
| （このcommit） | CEO確認ページ `/ja\|zh/ai-course/review`（本番404）＋最終実測 |

## アーキテクチャ（変更後）

```
build時:  banks(.ts) → build-content-shards.mts → content-dist/（1,573ファイル・29MB・gitignore）
          音声: content-audio/ai-course/（git管理・publicに置かない）
deploy時: wrangler r2 put（CEO承認後） → 非公開バケット ai-course-content
実行時:   client（教材なし）
            → POST /api/ai-course/session/issue      … 利用権つき署名セッション
            → POST /api/ai-course/activity/start     … battle/reading/listening/mock/diagnosis
                                                       正解・解説なしの問題＋attemptToken
            → POST /api/ai-course/activity/grade     … サーバー採点→正解・解説・whyWrong開示
            → POST /api/ai-course/activity/mock-grade … seed再構成で一括採点
            → POST /api/ai-course/stage-content      … stage展開（ID・会話テーマのみ）
            → POST /api/ai-course/grammar-doc        … 文法学習doc（開放外はstage_locked）
            → GET  /api/ai-course/audio?t=…          … 短命トークン・Range対応
```

- 出題編成は client と同じ純関数（buildEncounter / startMockSession / selectDiagnosisQuestions）を
  Worker内で実行。**seed固定で決定的**なので採点時に同じ編成を再構成できる＝サーバー状態不要
- 問題キーは鍵つきHMACで偽名化（バンク構造を晒さない）。client の mastery台帳はそのまま機能
- 正解位置はサーバーの提示時シャッフルで分散（実測 a:21 b:16 c:15 d:0 / n=52、3択が多くdは希少）
- 旧コース（foundation）面・内部ツールは `import.meta.env.DEV` 判定で公開ビルドから構造的に除外

## 実HTTP検証（local miniflare + local R2・remote未使用）30/30 PASS

401×2 / 403×9（改ざん・他人・利用権なし・未開始・期限切れ・使い切り・鍵付きstage・鍵付きdoc）/
問題payloadに正解なし（battle・reading・listening・mock・diagnosis の5活動で禁止フィールド走査0）/
採点で正解ちょうど1つ＋解説・根拠・transcript開示 / べき等 / 別userのattempt拒否 /
模試一括採点＋偽名化 / 旧音声URL404・トークン無し401・正規200・Range206・改ざん401 /
正常ペース拒否0 / 高速列挙429。

再現手順:
```bash
npm run build:staging && npm run build:ai-course-content
npm run dev:worker          # 別ターミナル
node scripts/ai-course/seed-local-r2.mjs
node scripts/ai-course/verify-content-endpoint.mjs
```

## Phase 3/4/5 の状態

- **Phase 3**: `AdvRuntimeGate` が実装済み・AiCoursePageでAdvShellを包んでいる。
  未購入→料金 / 未開始→24h開始確認（開始期限表示・押すまで開始しない）/
  active→アクティブ秒計測（可視・非idle時のみ）＋二重タブtakeover＋残り分表示（5分以下赤）/
  使い切り・期限切れ→進捗保持明示＋再購入＋頻度制限つき1か月アップセル
- **Phase 4**: 鍵はサーバー強制（allowedTargetIds外は stage_locked・実測済み）。
  冒険マップ表示は既存 AdvAdventureMap（metadataのみ描画）。
  アップセルは終了画面に接続済み。**残り10分以下・初回冒険完了時のactive中バナーは未接続**
- **Phase 5**: `/ja/ai-course/review`・`/zh/ai-course/review`（本番ホストでは404）。
  fixture方式でDB無変更。実runnerのfixtureバトル（サーバー採点の形）を含む

## 未完了（正直な残り）

1. **会話コース教材（courseEngine 89KB）** — P0最後の1件。migrate案:
   courseData を shards へ（mission単位）、conversation開始時に `activity/start {activity:'conversation'}`
   で現在missionのみ取得。planForSession / buildJourney / courseGrowth の同期参照を
   mission メタ（id・タイトルのみの静的index）と本文（サーバー）に分離する
2. **Phase 6 のE系（実app E2E）**: staging相当のフルe2e（購入→開始→学習→採点→使い切り）は
   local wrangler + 実UIで未走行（コンポーネント単位・HTTP単位では実証済み）
3. **診断の12問セット差**: 診断は毎回サーバーでseed選定。AdvOnboardingの
   進行は fire-and-forget 採点のため、通信断時は未回答扱いになる（誤答にはならない）
4. **active中アップセルバナー**（残り10分以下トリガー）
5. **mock中の聴解音声**: mock問題のaudioTokenは付与済み・UI接続済み。ただしlocal実測は単体のみ

## remote 変更（すべて未実行・CEO承認要）

| 種別 | 対象 | 状態 |
|---|---|---|
| R2 | バケット `ai-course-content` 作成＋Pages binding `AI_COURSE_CONTENT` | 未実行 |
| R2 | シャード1,573件＋音声200件のアップロード | 未実行 |
| Secret | `AI_COURSE_CONTENT_TOKEN_SECRET` / `SUPABASE_JWT_SECRET` | 未設定 |
| env | `AI_COURSE_SESSION_MODE=client-asserted` は**staging限定**。本番は未設定のまま（発行503） | — |
| migration | `20260803000000_ai_course_sales.sql`・進捗/利用権テーブル | 未適用 |
| Edge Function | `ai-course-checkout`・`ai-course-auth` 招待コード改修 | 未実行 |

⚠️ 本番セキュリティの残る前提: 進捗・利用権DBが無い間、セッション発行は
client申告を署名する方式（staging限定フラグ）。**本番でこのフラグを設定しない限り
発行は503**＝安全側。完全なサーバー正準（累計秒・開放stage）はDB接続後。

### 切り戻し
main未マージ・remote無変更。branchを捨てれば元に戻る。

## 次セッションの開始手順

```bash
cd ~/badminton-secure-runtime && git log --oneline -3   # HEADがorigin一致・クリーンを確認
```
着手順: ①会話教材のサーバー移行（上記案）→ ②E2E実走（local wrangler＋実UI）→
③active中アップセル → ④HANDOFF更新。

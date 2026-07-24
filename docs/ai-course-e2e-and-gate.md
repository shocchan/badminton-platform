# AI日本語コース E2E・端末試験・本番公開ゲート（Phase 7 / Phase 9）

> staging: `https://staging.badminton-platform.pages.dev` / 直近 deploy ID `1c0c09f9`
> **本番デプロイ・main マージは本書では実行しない。** 公開可否を客観判定するための資料。

---

## Phase 7-1. E2E シナリオ（手動チェックリスト＋自動化状況）

凡例: 🤖=自動テストあり / 👤=人間確認必須（実ブラウザ/実認証/実マイク） / ⚙️=staging専用支援があると容易

### A. 完全新規生徒
| # | ステップ | 種別 | 備考 |
|---|---|---|---|
| 1 | 招待コード入力 | 👤 | `ai_redeem_invite`（メール一致・1回・期限）はロジック実装済 |
| 2–4 | メール→OTP送信→再送 | 👤 | `ai_check_otp_throttle` スロットル実装済。実OTPは本番送信のため要人間 |
| 5 | ログイン | 👤 | |
| 6 | 8問ヒアリング | 🤖 表示判定 / 👤 実操作 | `needsHearing` は 🤖 |
| 7 | 診断結果 | 🤖 | `deriveInitialLearner` |
| 8 | 学習ホーム | 👤 | 3秒で「今日何を」分かるか |
| 9 | 初回レッスン（音声） | 👤 | 実マイク・実会話 |
| 10 | レポート | 👤 | 実発話と一致・過大評価なし |
| 11 | 管理画面反映 | 👤 | |
| 12–14 | 再訪・自動ログイン・設定同期 | 👤 | `keepLoggedIn` |

### B. 既存生徒
ヒアリング再表示なし（🤖 `needsHearing`）/ 次ミッション・復習（🤖 `buildLessonPlan`）/ 成長・履歴・言語切替（🤖 `courseLanguage` ＋ 👤 実表示）/ PWA（👤）。

### C. 異常系
| ケース | 種別 |
|---|---|
| 招待コード誤り/期限切れ/使用済み | 🤖ロジック / 👤実挙動 |
| OTP誤り/連打 | 👤（スロットルは実装） |
| マイク拒否/不可 | 👤（`mic-denied` UI 実装済） |
| 通信切断/途中離脱 | 👤（`interrupted`＋部分レポート実装済） |
| 上限到達 | 🤖ロジック（`remainingSessionsToday` / `ai_start_session`）/ 👤実挙動 |
| 利用停止 | 🤖ロジック / 👤 |
| レポート失敗/翻訳失敗 | 👤（フォールバック実装済） |

### D. 管理者
生徒選択・コスト確認・上限変更・停止/再開・問題報告・データ削除・権限なし拒否 → 一部 🤖（集計/権限ロジック）、実操作は 👤。

## Phase 7-2. 端末・画面（すべて 👤 手動 — 自動確認不可）
iPhone Safari / iPhoneホーム画面(PWA) / Android Chrome / Mac Chrome・Safari / Windows Chrome・Edge。
幅: 320 / 375 / 390 / 430 / 768 / 820 / 1024 / 1280 / 1366 / 1440 / 1920。125% / 150% ズーム / 200% 文字拡大。
確認: 文字切れ・横スクロール・固定要素の重なり・字幕可読性・CTA位置・長い中国語・会話履歴・目標カード・成長・レポート・設定・ヘッダー・言語切替。
> **自動化できないため「確認済み」とせず手動チェック項目として残す。**

## Phase 7-3. E2E 支援機能（staging専用・提案）
安全に用意可能な範囲（**本番で利用不可に分離**、Secret/招待コードを埋め込まない）:
- test learner 作成/削除（`is_test=true` ＋ `ai_delete_test_learners`）
- 日付を進めた復習検証（`updateMasteryState(now=...)` は純関数で 🤖 実現済）
- 上限到達/停止/レポート失敗/翻訳失敗のシミュレーションは、フロントのモック分岐 or test learner の `ai_config` 一時上限で再現。
> これらは**追加コードが必要**。本番非露出を保証するため、環境フラグ（staging限定）でガードする設計を Phase 5 候補として提案（今回未実装）。

---

## Phase 9-1. 本番公開ゲート

| 項目 | 判定 | 根拠 / 残作業 |
|---|---|---|
| Critical 問題ゼロ | **PASS** | セキュリティ/課金/データ破壊/利用不能なし |
| High 問題ゼロ | **要確認** | 呼称混同は解消。RLS実地・音声E2Eが未確認（下記） |
| 全テスト成功 | **PASS** | 129 pass / 0 fail（env設定時・全ファイル collect） |
| build / build:staging | **PASS** | 両方成功 |
| TypeScript | **PASS** | 0 errors |
| AIコース範囲 ESLint | **PASS** | AIコース scope 0 errors / 0 warnings |
| 秘密情報漏洩なし | **PASS** | dist に service_role/sk_/秘密鍵なし・anon のみ |
| RLS 実地確認 | **人間確認待ち** | テスト learner で別learner不可視を確認（§Phase6.2） |
| Edge Function 認証 | **PASS（コード）／人間確認（実リクエスト）** | JWT＋learner所有チェック確認済 |
| 上限強制 | **PASS** | `ai_start_session` サーバー権威 |
| 二重計上防止 | **PASS** | 冪等 complete＋finalize。テスト固定 |
| rollback 手順 | **PASS** | `ai-course-operations.md §7` |
| iPhone / PC E2E | **人間確認待ち** | 実機マトリクス |
| 新規登録 / 音声 E2E | **人間確認待ち** | 実認証・実マイク |
| レポート信頼性 | **PASS（ロジック）／人間確認（実データ）** | tutor発話除外・段階区別を実装＋テスト |
| 成長評価信頼性 | **PASS（ロジック）／人間確認（実データ）** | 実発話のみ・データ不足時断定なし |
| Andy専用設定準備 | **PASS** | `ai-course-andy-setup.md` |
| 旧招待コード無効化準備 | **PASS（手順）** | 実無効化は公開時 |
| 本番差分レビュー | **要実施** | main↔branch のフロント差分＋未適用migrationの有無 |

**暫定判定: 条件付き GO。** コード/自動検証は公開水準。公開の最終可否は
① RLS実地確認 ② iPhone/PC実機E2E ③ 実認証での音声レッスン1本完走 ④ 実データでのレポート/成長の妥当性
の **4つの人間確認 PASS** を条件とする。これらは自動確認不可のため「確認済み」と断定しない。

## Phase 9-2. ESLint 既存45件の整理

| 分類 | 件数 | 対応 |
|---|---|---|
| **AIコース関連** | 1（`ai-course-auth` no-useless-assignment） | ✅ **今回修正**（behavior-neutral・Edge再デプロイはしない） |
| 今回変更ファイル由来 | 0 | — |
| 通常サイト関連（main由来） | 44 | **今回は修正しない**（スコープ外・大量修正は退行リスク） |
| 本番リスクあり | 0（AIコース範囲） | 通常サイト側に `no-misleading-character-class`(3)/`no-irregular-whitespace`(7) 等の潜在バグ候補あり→**別タスク推奨** |
| コード品質のみ | 大半 | react-hooks/prefer-const 等 |

主なルール内訳（全体）: `react-hooks/refs`(9) `set-state-in-effect`(7) `no-irregular-whitespace`(7) `exhaustive-deps`(6) `immutability`(5) `only-export-components`(4) `preserve-manual-memoization`(3) `no-misleading-character-class`(3) `no-useless-escape`(2) ほか。
ファイル別最多: `TacticsBoard.tsx`(14) `AdminPage.tsx`(12) — いずれも**通常サイト・main由来**。
> **ESLint 終了コードの正確な扱い**: `eslint .` は warnings/errors ありで exit 1。`tail` 等のパイプで終了コードを失わないこと。初回監査の「0 errors」は計測ミス（tail の exit を誤読）で、正しくは**プロジェクト全体45件・AIコース範囲0件**。

## Phase 9-3. 本番反映計画（順序・未実行）

> 実行しない。CEO が公開判断後に実施するコマンド列。

1. **最終バックアップ** — Supabase → Database → Backups（PITR）取得。フロントは現行 prod deployment ID を記録。
2. **本番環境変数確認** — `.env`/`.env.production` に `VITE_SUPABASE_URL/ANON_KEY/AI_LESSON_DEMO_CODE/STRIPE_PUBLISHABLE_KEY(本番)` が揃うこと（値は非表示）。
3. **Andy専用招待コード発行** — `ai-course-andy-setup.md §A`。
4. **旧コード無効化** — 検証用招待を `revoked=true`。
5. **Supabase 変更有無確認** — 未適用の AIコース migration（例: `ai_admin_audit`）があれば `supabase db push`（追加的・非破壊のみ）→ RLS 確認。
6. **Edge Function 差分確認** — `ai-course-auth` のソース差分（今回のlint修正）を含め、必要なら `supabase functions deploy <name>`。
7. **main マージ** — `feature/ai-japanese-demo` → `main`（レビュー後）。
8. **本番デプロイ** — `./scripts/deploy-production.sh`（`npm run build` → `wrangler pages deploy dist --branch=main`）。
9. **スモークテスト** — 本番の /ja・/zh/ai-course・/admin・通常サイト・/activity が 200、Supabase初期化エラーなし、決済画面が初期化エラーなし。
10. **Andy 登録** — `§D` の初回運営チェック。
11. **初回レッスン監視** — コスト・マイク解放・レポート・問題報告。
12. **問題時ロールバック** — `ai-course-operations.md §7`。

## Phase 9-4. ロールバック手順（要約）
フロント: Cloudflare Pages で前デプロイへ Rollback。Edge: 1つ前ソースで `functions deploy`。DB: PITR 復元（破壊操作前バックアップ必須）。learner/招待/コース停止は §7 の非破壊操作で即時可能。

## 本番公開前に「しょっちゃん」が行う確認（最終）
1. RLS実地（テストlearnerで別learner不可視）2. iPhone/PC実機の主要画面 3. 実認証で音声レッスン1本完走＋レポート妥当性 4. 実データで成長画面が断定しすぎない 5. Andy招待の発行・メール限定・期限 6. 本番差分（migration/Edge/フロント）レビュー 7. 決済画面が本番Stripe設定で初期化エラーなし。

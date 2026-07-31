# 現在の状態（自律ループ用・各Phase完了時に更新）

## 2026-07-31 本番公開 入力パック 完成 — CEO記入待ち

branch `feature/ai-course-learning-polish` / clean / origin push済
**RC tag `ai-course-content-rc2`（code `57a8804`）は据え置き。runtime未変更。**

### 今回の成果物（docs・validation scriptのみ／製品コードは触っていない）
| ファイル | 内容 |
|---|---|
| `production/final-release-input.md` | **CEOはこれ1枚に記入すればよい。** 法務14 + 実機34 + 教材11 + 環境20 + 承認 |
| `production/final-release-input.json` | 機械可読版（秘密値は持たない・状態のみ） |
| `production/pilot-release-execution.md` | Phase1〜6の実行手順（入力取込→preflight→main統合→deploy→smoke→rollback） |
| `autonomous-loop/production-release-prompt.md` | 記入後にそのまま貼る次セッションprompt |
| `scripts/ai-course/validate-legal.mts` | `npm run validate:ai-course-legal` |

### 追加したcommand
- `npm run validate:ai-course-legal` — 未入力field・不正field・LEGAL_PUBLISH判定・route16・placeholder検出
  - `-- --simulate-filled` で「値を入れたらPASSするか」を実ファイル無変更で自己診断できる
- `npm run validate:ai-course-env` — 既存 `verify-production-env.mjs` をnpm scriptへ登録

### 現在値
tests（法務関連）22 PASS ／ build PASS ／ AIコース側 lint 0E/0W
legal validation: FAIL（未入力14件＝正常。入力後にPASSへ変わる）
env validation: P0 0 / P1 0

### CEOが次にすること
`docs/ai-course/production/final-release-input.md` に記入 →
`docs/ai-course/autonomous-loop/production-release-prompt.md` を新セッションへ貼る

⚠ 型判定は必ず `npm run build`（tsc -b）。`npx tsc --noEmit` はproxy経由で実エラーを取りこぼす。
⚠ `device-check-packet.md` 末尾の「A1〜A8 PASS」は**回答例**であってCEOの結果ではない。

---

## 2026-07-31 AI側リリース準備 完了 — RC tag `ai-course-content-rc2`

branch `feature/ai-course-learning-polish` / HEAD `57a8804` / clean / origin push済 / staging最新

**CEO決定（2026-07-31）**: 実機確認・法務事実・公開教材の目視・招待・本番承認は
本番公開直前にCEO本人がまとめて実施する。よってこれらは BLOCKED ではなく
**DEFERRED_BY_CEO_UNTIL_RELEASE**。AI側キューの終了条件から外した。

### AI側 status
| 項目 | 状態 |
|---|---|
| Product Technical Complete | **YES** |
| Content Technical Complete | **YES** |
| Illustration Technical Complete | **YES** |
| Legal Code Complete | **YES** |
| Production Preflight Package | **YES** |
| Production Release Candidate Ready | **YES** |
| AI-side Tasks Complete | **YES** |
| Actual Production Release Ready | **NO**（人間ゲート前） |

work queue: complete 16 / in_progress 0 / failed_internal 0 / blocked_external 0 / deferred_by_ceo 3

### 実測値（RC2）
tests **1300 PASS / 0 FAIL** ／ build PASS ／ **AIコース側 lint 0E/0W**（全体29E/6Wは本体側の既存分）
chapters 10 ／ 会話文脈 140/140 ／ イラスト 140/140 learner visible ／ Loading 21箇所
env検査 P0 0 / P1 0（クライアント鍵 role=anon 実確認）

### 今回追加したもの
- 申込前の同意ゲート（**法務ページ未公開のあいだは同意欄を出さない**＝読めない文書に同意させない）
- 学習アプリ側 footer の法務リンク8本（LPだけでは学習者が規約・削除申請へ辿り着けなかった）
- `scripts/ai-course/verify-production-env.mjs`（秘密の値は出さず構成だけ検査）
- 法務リンクのタップ標的 19px → **44px**（mobile実測で発見して修正）
- `accessibility-mobile-smoke.md`（ja/zh とも横スクロール0・無名操作要素0・console 0）

### 法務の残り
`src/lib/aiLesson/course/legal/legalFacts.ts` の null **14項目のみ**。
値を入れると `LEGAL_PUBLISH` が自動でtrueになり、8ページ公開＋同意チェックが有効になる。

⚠ 型判定は必ず `npm run build`（tsc -b）。`npx tsc --noEmit` はproxy経由で実エラーを取りこぼす。
⚠ `device-check-packet.md` 末尾の「A1〜A8 PASS」は**回答例**であってCEOの結果ではない。

---

## 2026-07-30 AUGUST RELEASE COMPLETION PROGRAM（進行中）

- **GATE① COMPLETE**: 承認 `APPLY_SHARED_SUPABASE_MIGRATIONS` に基づき本番へmigration 3本を適用。
  backup→preflight→atomicity実測→適用→history記録→catalog実査（全期待値一致）→
  remote RLS matrix R01–R27 27/27 PASS→remote sync E2E S01–S19 19/19 PASS→staging反映。
  probeを完全probe（table/columns/RLS/RPC/version）へ強化。保存状態表示をja/zhで正直化。
  合成fixtureは全て撤去（前後row count一致）。remote write監査ログ: `production/remote-apply-audit.log`
- **GATE⑤ INCOMPLETE（大半done）**: backup取得・baseline凍結・release branch push・release manifest・
  daily-ops-dashboard（本番でsmoke済み）・incident runbook・learner個別停止手順（is_active enforcementを
  3箇所で確認）・rollback対象実在確認。**残: localクリーンDBでのrollback drill（環境起動中）・release tag**
- **GATE②③④ INCOMPLETE**: すべてCEO入力待ち。→ `decision-packets/ceo-action-panel-august-pilot.md`
- Phase B（8時間Sprint）は未開始（5ゲート未完のため。指示どおり進めない）
- 本番DBで判明した要対応: 問い合わせ未返信5件（最古 2026-07-06）／未対応不具合報告1件／
  LPに法務リンク0本・「準備中」表記2箇所／本番learnerは検証用1件のみ（3名は未サインアップ）
- 招待コードは1件・`max_uses is null`＝**無制限で有効**（誤警報しないようdashboardのSQLを修正済み）


更新: 2026-07-30（Gate後の安全網整備完了: migrationIntegrity.test 14件・貼付用SQL生成script・post-apply検証SQL・runbook R1-R6。Apply Ready=READY／適用は承認文字列待ち・remote write 0）

- cleanupStatus: **deferred_not_blocking**（CEO決定 2026-07-30・session cd58eebf はテストartifactとして残置・削除は将来の明示承認必須・Production blockerではない）

- 現在のPhase: **CEO判断反映 完了**（正式名称: 霧の港町/オウライ街道/ハタラキ街・地名方針B併記・Support=info@kawabado.com・Map主要ナビ化・N2 178+alias2=180・出身/都合routing・β暫定採用記録。openゲート: legal/実機/remote migration/remote RLS/production）。前Phase: **夜間教材ブラッシュアップ 完了**（動詞56語データ完備・全140語Stage2保証・注意分類21語ノート・QP-1/QP-2解消・cloze18問＋対照13問draft追加・tests 1127 PASS・staging反映済み）。前Phase: **zh-l10n＋図鑑可視化 完了**（RPG/N3/N2全learner画面のzh辞書配線9件・vocabCanonical単一情報源・図鑑ヘッダー/11フィルター/全部終えた定義・completion-reports/zh-localization-vocab-scope-20260730.md）。tests 1120 PASS。前Phase: **2E-1.12 完了**（Journey往復契約・storage登録簿と安全reset・実機で往復不具合を検出し修正。completion-reports/phase-2e1-12-completion-report.md）。前Phase: 2E-1.11（初回4ステップJourney・Recovery UX・Error Boundary。completion-reports/phase-2e1-11-completion-report.md）。前Phase: 2E-1.10（間隔反復・role推薦接続・会話コア接続・学習ループUI・リリース分類。completion-reports/phase-2e1-10-completion-report.md）。前々Phase: 2E-1.9（接続グラフ560edge・Inspector・anchor。completion-reports/phase-2e1-9-completion-report.md）。前Phase: 2E-1.8 完了（完全性監査・P0由来・stale検出・双方向リンク・実ブラウザモバイル検証。completion-reports/phase-2e1-8-completion-report.md）
  判断キュー実数: 91判断事項/72語（example1・cognate11・**meaning_zh20・role57**・sense2）※2E-1.7報告の17/60は誤集計と判明し訂正済み
  priority内訳: 独立70・語から継承21（fi-namae P0=3は example独立+2継承と特定）
- 自律ループ#1: CONTINUE→2E-1.7実装完了（reviews/2e1-6-chatgpt-review.md）
- ループ履歴: #1 CONTINUE→2E-1.7 ／ #2 CONTINUE→2E-1.8設計 ／ #3 2E-1.8実行 ／ #4 CONTINUE→2E-1.9設計 ／ #5 2E-1.9実行
- 夜間セッション overnight-20260727-c: startedAt 22:52・deadline 明日08:00・maxAdditionalLoops 5・model Opus 5
- 学習ループ実数: 診断140connected(partial 0)・復習140connected・会話13contextual/127generic
- リリース分類: blocker 14 / beta推奨 77 / defer 0。root P0=1・root P1=13
- **次セッションの再開手順**: ①completion-reports/phase-2e1-9-completion-report.md（特に§6の構造的発見4点）を
  監督チャット「AI日本語学習監督」へ報告（insertText方式・下記Tips参照）→②分析抽出→validator+意味検証→③CONTINUEなら実行
- ChatGPT操作Tips: composer入力はdocument.execCommand("insertText")一括が唯一安定（type分割は文字落ち）。
  送信はsend-buttonクリック（Enterは不発あり）。回答ストリーム表示ハングはページリロードで全文回収
- ブランチ: feature/ai-course-learning-polish（main・本番は禁止）
- 最新コミット: phase-history参照（2E-1.7 UIコミット済み）
- テスト: 688件全パス／tsc 0エラー／lint 45E/6W=51（ベースライン一致・新規ファイル増分0）
- bundle: main 590.30KB / gzip 169.96KB（レビュー系はlazy chunk: VocabReviewPanel 80.8KB）
- 教材: 140語（基礎78＋N3 62）全draft・Sense 8語・cognate分類済み126語/unreviewed 10語＋kyoumi係争1・
  二重AIレビュー140/140（consensus 52/disagreement 73/human 15・P0=1 P1=4 P2=83 P3=52）
- 画像: 実画像28枚（WebP 800w+320w）・未生成8枚（対比4・場面4）
- 未完成: 残画像8枚／モバイル実表示の目視監査（Chromeフルスクリーンで不可だった）／
  meaningZh未採用提案の人間確認／role提案（optional→diagnostic）未決
- 人間判断待ち: fi-namae例文（P0）・cognate不一致11語・role提案・カバー画像承認・human required 15語
- staging: https://staging.badminton-platform.pages.dev 反映済み・console error 0・画像404 0
- 共有DB変更: なし／main・本番変更: なし

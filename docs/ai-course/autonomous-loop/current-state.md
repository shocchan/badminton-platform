# 現在の状態（自律ループ用・各Phase完了時に更新）

## 2026-07-31 PRODUCT CONTENT SPRINT（Phase B・進行中）

**方針転換（CEO 7/31）**: 受講者個別設定・リリース手続きは「Release Operations Phase」へ分離。
中身の完成が最優先。完成判定は「runtime配線＋staging実画面」まで（設計書だけはCOMPLETEにしない）。

### A. Chapter — **10/10章 完成（playable）**（2026-07-31 夜間ラン）
- 第8〜10章（施設の導入章）を追加: ソラノ塔=書き言葉の入館証／カタリ港=声に出す日／
  オモイデ庭園=灯りの消えた花壇。各4Quest・実在fi-*のみ・章間文言重複0（テスト16件PASS）
- 施設エリアのrouting: **初回だけ導入章を通し、完了後は施設へ直行**（`isChapterCompleted`判定）。
  Homeの施設カード（塔・広場・庭園・図書庫）は常に機能へ直行＝**ロックではない**
- **staging実測**: 第8章をMapから開いて Quest 1 完走（XP+20・司書解放・閲覧室解錠）。fixture撤去済み
- 旧記録: 第1〜7章（commit 541dd89）／第2章はreload復元・zh表示まで実測済み

### （旧）A. Chapter 2以降 — 7/10時点の記録
- 必要章数の決定: 10Area監査により**全10章**（各Areaに1章）
- **完成: 第1〜7章**（commit 541dd89）。engine一般化（chapterRegistry / adventureState章対応 /
  Panel chapterId prop / N3AreaPanel全エリア入口 / 辞書パラメータ化）＋検証16テスト
- **staging実画面で実測済み**: 合成learnerで第2章に入り Quest 1 を実プレイ
  （teach→assess 2語→完了XP+20→beat/NPC解放→**reload後に完全復元**→zh表示も確認・console 0）。
  fixture撤去済み（auth_users=5 learners=1 に復帰）
- **残り: 第8〜10章**（ソラノ塔=N2導入・カタリ港=会話導入・オモイデ庭園=復習導入の各章。
  常設施設エリアの「導入章」として設計する。恒久ロックは作らない）
- ~~resumeFrom(B-1)~~ **完了**（chapters8to10Data.ts 作成→registry登録→テスト10章化→staging実測）

### ▼ 次セッションのresumeFrom（優先順）
1. **B-2 会話文脈 13→140**: 現在値を正準データから再集計 → 語ごとのcontext（starter ja/zh・
   target・transfer risk・correction・review/mission接続）→ **runtime接続**（データ追加だけでは不可）
   → starter重複0・dead data 0を機械検査 → 代表8カテゴリをintegration testで実証
2. **B-3 Loading**: learner-visible asyncを全数監査→対象数確定→共通componentへ（200ms抑制・
   aria-live・ja/zh・reduced motion・layout shiftなし）
3. **B-5 横断品質監査** → 4. **B-4 イラスト（SVG fallback可・manifest方式）** → 5. **B-6 lint**
6. 最後に RC freeze（tag候補 `ai-course-content-rc1`）

### 検証用ツール（今回作成・再利用可）
- `scripts/ai-course/stage-verify-session.mjs` — staging実画面検証用の合成learnerセッション
  （--create --out で発行 / ブラウザlocalStorageへ `storageKey` のJSONを注入 / --cleanup <userId> 必須）

### B〜F 未着手（優先順）
- B-2 会話文脈接続 13→140（正準の現在値はconversation側データの再集計から）
- B-3 Loading演出（25領域監査→共通component）
- B-4 語彙イラスト115枚（deterministic SVG scene・状態分離・AI承認なし）
- B-5 横断品質監査（Chapter全体・N3/N2・ja/zh・mobile・a11y）
- B-6 バドミントンlint 29E/6W→0/0（コンテンツ完了後）


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

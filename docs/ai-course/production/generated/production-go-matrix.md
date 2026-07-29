# Production GO Matrix（生成: 2026-07-29T00:13:42.451Z）

## 判定: **NO-GO**

- pass: 23 / fail: 3 / human_required: 12
- AI解消可能な個別issue件数: **0件**（Gateカテゴリ数とは別指標・§2）
- AIだけで解消できるGateカテゴリ: **0**
- 環境（Docker/local DB）が必要で未実行のGateカテゴリ: **3**
- 人間の判断が必要なGateカテゴリ: **12**
- partialは使わない。実装済みでも未検証なら fail とする。

### Functional

| 項目 | 判定 | 根拠 |
|---|---|---|
| login / auth | pass | 既存実装・staging稼働中（本セッションで変更なし） |
| Home（RPG World Home） | pass | WorldHomeShell実装・実ブラウザ1280/390で overflow 0・Map 58%幅/62vh |
| first run / onboarding | pass | 既存FirstRunJourney（本セッションで変更なし） |
| RPG Chapter 1 | pass | UI E2E 14件（5Quest完走・文法・復習・reload・learner view） |
| Vocabulary（記憶の書庫） | pass | 既存ことば図鑑＋World Homeから導線 |
| Grammar（文法の工房） | pass | 既存しくみラボ＋World Homeから導線 |
| N3 Unit learner UI（12単元） | pass | 共通ランタイム＋UI実装。12単元すべてがresultまで完走するテスト（9件）・実ブラウザ証拠8画面 |
| AI text conversation | pass | 既存実装・本セッションで変更なし |
| AI voice conversation | human_required | 実機マイク・音声品質は物理端末確認が必要 |
| Report / Review / Growth / Settings | pass | 既存実装・World Homeから導線接続 |
| Recovery（中断復帰） | pass | 既存recovery＋RPG側reload復元テスト |

### Content

| 項目 | 判定 | 根拠 |
|---|---|---|
| answer leakage = 0 | pass | blocker manifest: answerLeakageIssues 0（teach/assess分離・監査テスト常設） |
| required vocabulary coverage | pass | 全140語を12単元へ割当・孤立0・重複0・required未評価0 |
| cognate quality（同形語対策） | pass | 4分類＋高リスク12語のcontrast必須化。同形同義語への意味当ては0 |
| 3段階（理解/使い分け/実践） | pass | 全12単元で understand>0・distinguish>0・apply>0 をテストで固定 |
| N2文法 completeDraft | pass | 173+7+0+0=180（前セッション・恒等式テスト） |
| CEO教材承認 | human_required | human_reviewed/approvedは自動昇格しない。review packet提供済み |
| CEOビジュアル承認 | human_required | contact sheet 22asset・world/story名称はすべて仮称 |

### Technical

| 項目 | 判定 | 根拠 |
|---|---|---|
| tests | pass | 1019件 全pass |
| build / typecheck / lint | pass | build成功・tsc 0 error・lint 45E+6W=51（基線同値） |
| performance（learner bundle） | pass | learner main 590.38kB維持・Chapter1/N3Unitはlazy chunk・N2 draftはlearner非配信 |
| 正式DB（migration適用） | human_required | remote適用は APPLY_SHARED_SUPABASE_MIGRATIONS が必要。本セッションでは未着手 |
| RLS / entitlement 検証（local実証） | fail | Dockerが本機に未インストールでlocal Supabaseを起動できず未実行。CLIは導入済み（v2.101.0） |
| cross-device 同期（local DB実証） | fail | Repository/outbox/楽観ロック/決定的mergeは実装＋16テストで検証済み。ただし模擬サーバであり実DB実証ではない（Docker必要） |
| monitoring / error codes | pass | 16 code＋許可リスト方式の監視adapter。PII遮断テスト12件（JWT/email/本文の混入を機械的に阻止） |

### Device

| 項目 | 判定 | 根拠 |
|---|---|---|
| automated viewport QA | pass | 実ブラウザ 1280/390 実測: overflow 0・タッチ48px・順序 Map→CTA→施設 |
| 実機 iPhone | human_required | 物理端末が必要 |
| 実機 Android | human_required | 物理端末が必要 |
| VoiceOver / TalkBack | human_required | 実機スクリーンリーダー確認が必要 |

### Operations

| 項目 | 判定 | 根拠 |
|---|---|---|
| 利用規約 / プライバシー | human_required | 法務判断。AI送信範囲・保存期間・削除方法の確定が必要 |
| LP文言（ベータ版表記） | human_required | 正式版表現はCEO/法務判断（blocker manifest: landingCopyDecision 4件） |
| support UI / payload contract | pass | 6カテゴリの報告UI＋許可リストpayload。自由入力・メール・会話は送らない（テスト済み） |
| support 送信先の確定 | human_required | 問い合わせ先の正式値がCEO判断待ち。未確定の間は「この端末に控えました」と正直に表示 |
| rollback / backup 実証 | fail | 手順書は作成済み（security rollbackとfeature rollbackを分離）。Docker未導入のため未実行 |
| incident response runbook | pass | 9シナリオを検知/重大度/初動/通知/rollback/証拠/復旧条件で整備 |
| incident response の owner確定 | human_required | 一次対応者・外部通知先・費用閾値・補償方針がCEO判断待ち |
| version manifest | pass | blocker manifest＋GO matrixを生成スクリプトで再現可能 |
| 本番反映 | human_required | APPROVE_AI_COURSE_PRODUCTION_RELEASE が必要 |


## NO-GOの内訳

**AIがまだ処理できるもの（fail）**
- Technical / RLS / entitlement 検証（local実証）: Dockerが本機に未インストールでlocal Supabaseを起動できず未実行。CLIは導入済み（v2.101.0）
- Technical / cross-device 同期（local DB実証）: Repository/outbox/楽観ロック/決定的mergeは実装＋16テストで検証済み。ただし模擬サーバであり実DB実証ではない（Docker必要）
- Operations / rollback / backup 実証: 手順書は作成済み（security rollbackとfeature rollbackを分離）。Docker未導入のため未実行

**人間・remote・実機・法務でしかできないもの（human_required）**
- Functional / AI voice conversation: 実機マイク・音声品質は物理端末確認が必要
- Content / CEO教材承認: human_reviewed/approvedは自動昇格しない。review packet提供済み
- Content / CEOビジュアル承認: contact sheet 22asset・world/story名称はすべて仮称
- Technical / 正式DB（migration適用）: remote適用は APPLY_SHARED_SUPABASE_MIGRATIONS が必要。本セッションでは未着手
- Device / 実機 iPhone: 物理端末が必要
- Device / 実機 Android: 物理端末が必要
- Device / VoiceOver / TalkBack: 実機スクリーンリーダー確認が必要
- Operations / 利用規約 / プライバシー: 法務判断。AI送信範囲・保存期間・削除方法の確定が必要
- Operations / LP文言（ベータ版表記）: 正式版表現はCEO/法務判断（blocker manifest: landingCopyDecision 4件）
- Operations / support 送信先の確定: 問い合わせ先の正式値がCEO判断待ち。未確定の間は「この端末に控えました」と正直に表示
- Operations / incident response の owner確定: 一次対応者・外部通知先・費用閾値・補償方針がCEO判断待ち
- Operations / 本番反映: APPROVE_AI_COURSE_PRODUCTION_RELEASE が必要

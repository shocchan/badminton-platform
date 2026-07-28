# Production GO Matrix（生成: 2026-07-28T18:28:13.853Z）

## 判定: **NO-GO**

- pass: 19 / fail: 7 / human_required: 10
- AIが解消できる残blocker: **0件**
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
| N3 Unit（Coverage Contract） | fail | 契約と問題生成は完成（12単元/140語/478問）。単元を通す専用learner UIは未実装 |
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
| tests | pass | 980件 全pass |
| build / typecheck / lint | pass | build成功・tsc 0 error・lint 45E+6W=51（基線同値） |
| performance（learner bundle） | pass | learner main 590.38kB維持・Chapter1は63.26kB(gzip 19.13)のlazy chunk・N2 draftはlearner非配信 |
| 正式DB（migration適用） | human_required | remote適用は APPLY_SHARED_SUPABASE_MIGRATIONS が必要。本セッションでは未着手 |
| RLS / entitlement 検証 | fail | 本セッションで未実装・未検証（local Supabaseでの検証が必要） |
| cross-device 同期 | fail | 本セッションで未実装・未検証 |
| monitoring / error codes | fail | 本セッションで未実装 |

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
| support 導線 | fail | 本セッションで未整備 |
| rollback / backup | fail | 本セッションで未整備（backup-supabase.shは存在するが手順未検証） |
| incident response | fail | 本セッションで未整備 |
| version manifest | pass | blocker manifest＋GO matrixを生成スクリプトで再現可能 |
| 本番反映 | human_required | APPROVE_AI_COURSE_PRODUCTION_RELEASE が必要 |


## NO-GOの内訳

**AIがまだ処理できるもの（fail）**
- Functional / N3 Unit（Coverage Contract）: 契約と問題生成は完成（12単元/140語/478問）。単元を通す専用learner UIは未実装
- Technical / RLS / entitlement 検証: 本セッションで未実装・未検証（local Supabaseでの検証が必要）
- Technical / cross-device 同期: 本セッションで未実装・未検証
- Technical / monitoring / error codes: 本セッションで未実装
- Operations / support 導線: 本セッションで未整備
- Operations / rollback / backup: 本セッションで未整備（backup-supabase.shは存在するが手順未検証）
- Operations / incident response: 本セッションで未整備

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
- Operations / 本番反映: APPROVE_AI_COURSE_PRODUCTION_RELEASE が必要

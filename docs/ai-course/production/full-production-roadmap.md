# 完全版v1.0 Production Roadmap（Phase 3P-1策定）

生成: 2026-07-28 ／ 目標: 「AI日本語伴走コース 攻略型・完全版 v1.0」Production GO
原則: **未完成を隠さない。完成させる。** 非表示化は権利・法務・内部監査画面のみ。

## 未完成数の基準値（3P-1・機械集計）

| 指標 | 現在値 | GO条件 |
|---|---|---|
| 作成中・準備中表示 | 9 | 0 |
| 試作・ベータ表示 | 20 | 0 |
| イラスト欠損 | 115/140（承認0） | 0（承認100%） |
| N2文法 未完成 | 180/180 | 0 |
| N3文法 未完成 | 120/120（未取込） | 0 |
| 中文欠損（文法） | 300 | 0 |
| 問題欠損（文法） | 300 | 0 |
| 会話contextual未達（語彙） | 127 | 0 |
| 復習未接続（文法） | 300 | 0 |
| Excel未統合シート | 26 | 0（分類確定済み） |
| rights対応必要 | 3シート | 0（独自教材へ置換） |
| route孤立 | 文法300 | 0 |
| 人間承認必要field（推定） | 約4,720 | 全件human review完了 |
| 正式DB保存 | 未適用 | 適用＋同期＋分離検証 |

## Phase計画（3P-2〜3P-11）

| Phase | 目的 | 主な成果 | 停止点 |
|---|---|---|---|
| **3P-2** | 教材データモデル最終化＋Excel統合基盤 | Expression/Collocation型・provenance付き候補抽出エンジン・重複/競合判定・統合draft第一弾 | なし（自動継続可） |
| **3P-3** | 語彙の完成draft | 会話contextual接続127→0へ向けた練習データ・Excel統合語彙のdraft・イラスト生成batch開始 | イラスト承認は人間 |
| **3P-4** | N3文法120完成draft | Excel取込→§8全field生成→問題→復習接続 | human review |
| **3P-5** | N2文法180完成draft | §9全field生成（180件同品質）→二重AI監査→判断パケット | human review |
| **3P-6** | 攻略ルート・Unit・ホーム | ルート5本・Unit完了条件・現在地・攻略型ホーム | なし |
| **3P-7** | 正式DB・entitlement | local実装・同期outbox・RLSテスト（remote適用は`APPLY_SHARED_SUPABASE_MIGRATIONS`待ち） | remote適用 |
| **3P-8** | Journey/Error/Mobile/A11y/Perf | 全画面Loading/Empty/Error・mobile QA・性能 | 物理端末 |
| **3P-9** | 人間承認Closure | §22の8分割パケットでhuman review完走支援 | **人間承認そのもの** |
| **3P-10** | 規約・運用・Production RC | 監視・rollback・backup・規約導線・RC判定 | 規約最終確認 |
| **3P-11** | 本番公開 | CEO最終承認後のみ | **CEO承認** |

## 自律継続の運用（§28-§32）

- 各Phase完了→未完成数再集計→監督ChatGPTレビュー→Validator→次Phase
- 人間判断待ちはDecision Queue（awaiting_*状態）へ積み、依存しない作業を並行continue
- 停止条件は§31のみ。上限: 8 Phase / 10時間相当 → `AUTONOMOUS_SESSION_LIMIT`で正常停止＋resumeFrom保存

## 保留（v1.1以降）

N2過去問20年分・権利未確認過去問画像・N2総合模試・聴解大量制作。

# Whole Product Completion Matrix（FOREST FIRST）

評価値: complete / usable_with_rough_edges / broken / not_connected / deferred_to_hardening
（partialは使わない。§22）

**Whole Product Complete on Staging: NO（F1時点・作業開始前の初期評価）**

| # | 領域 | F1初期評価 | 根拠 |
|---|---|---|---|
| 1 | ログイン後RPG World Home | usable_with_rough_edges | WorldHomeShell稼働。ただし施設5枚中3枚がlearnerには不動作（下記5/6/13） |
| 2 | 初回ヒアリング | complete | CourseHearing（既存） |
| 3 | 主人公・現在地・学習ルート | usable_with_rough_edges | 現在地=週Can-do表示。10エリアはコード未配置 |
| 4 | 今日のQuest | complete | todayAction（第一CTA一つ） |
| 5 | 語彙学習（記憶の書庫） | **broken** | 施設カード→step 'vocab'がlabPreview管理者限定。一般learnerは押しても即Homeへ戻される |
| 6 | 文法学習（文法の工房） | **broken** | 同上（step 'lab'がlabPreview限定） |
| 7 | N3攻略（12単元） | **not_connected** | N3UnitPanelはどこにもマウントされていない（テスト・SSR証拠のみ） |
| 8 | N2文法攻略 | **broken** | 一覧180件は表示されるが、詳細の完成draft（173件）はn2GrammarContentに未接続（Batch1の10件のみ）。170件は意味・中文・問題が空 |
| 9 | AIテキスト会話 | complete | 既存 |
| 10 | AI音声会話 | complete | 既存（実機マイク確認はhardening） |
| 11 | 会話後レポート | complete | 既存 |
| 12 | 言い直し | complete | 既存（CourseRetryCard） |
| 13 | 復習（オモイデ庭園） | **broken** | 施設→vocab quickreviewがlabPreview限定 |
| 14 | 期限復習 | **broken** | 同上（霧CTA・バッジは出るが押すと何も起こらない） |
| 15 | 冒険・物語進行（Chapter 1） | **not_connected** | VocabularyHub内labPreview限定＋devTools固定 |
| 16 | XP・成長 | usable_with_rough_edges | adventureState実装済み・learner導線なし |
| 17 | 学習履歴 | complete | CourseHistory |
| 18 | 設定 | complete | CourseSettings |
| 19 | 問い合わせ | **not_connected** | SupportReportButtonはどこにもマウントされていない |
| 20 | Loading | usable_with_rough_edges | 各stepに存在。世界観演出は簡素 |
| 21 | Empty | usable_with_rough_edges | 画面ごとに差あり |
| 22 | Error | usable_with_rough_edges | LearnerErrorBoundary・errorCodes実装済み。全画面適用は未確認 |
| 23 | Recovery | complete | 会話recovery＋Unit復元（corrupted/schema_newer） |
| 24 | mobile responsive | usable_with_rough_edges | Home実測済み。新規接続画面は未確認 |
| 25 | 日本語／中国語切替 | complete | uiLang切替（remountなし） |

## Dead end / 空カード（F1検出・即修正対象）

1. 施設「記憶の書庫」「文法の工房」「オモイデ庭園」＋復習CTA: learnerが押しても何も起こらない（P1）
2. N2詳細170件: 意味・中国語・問題が空のまま表示（P1・空カード）
3. N3攻略: 入口ゼロ（P1・主要ルート不通）
4. Chapter 1: learner入口ゼロ（P1）
5. 問い合わせ: 入口ゼロ（P1）

## 方針（FOREST FIRST）

- learner学習機能のlabPreviewゲートを解除し、内部レビュー画面のみ管理者限定を維持する
- N3攻略はWorld Map（10エリア）→Unit一覧→N3UnitPanelの導線で接続する
- N2は完成draft 173件をlearner詳細へ接続する（reviewStatusは変更しない・自動昇格なし）
- 本matrixはF10で最終更新する

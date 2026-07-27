# Release Readiness Matrix（Phase 2E-1.10 §27・2026-07-27時点）

判定: `pass` / `partial` / `fail` / `human_decision` / `not_applicable`

## Learner Journey

| 項目 | 判定 | 根拠 |
|---|---|---|
| 初回 | partial | 目標・ふりがなは設定画面で選べるが、初回専用の4ステップ案内は未実装 |
| 2回目以降 | pass | ホーム第一CTA→復習/3語→問題→完了→次回予定を実機で通した |
| 診断 | pass | 基礎13問・N3 16問＋会話コア確認2問（決定的ローテーション） |
| 今日の学習 | pass | 推薦11段階＋決定的な理由表示 |
| 完了 | pass | 完了画面（今日できたこと・次の復習・第一CTA一つ） |
| 復習 | pass | 翌日/3日後/7日後・期限超過優先・実機で完走 |
| 会話 | partial | 対象語別練習13語（会話コア11語は全て接続）。残127語は一般導線のみ |
| エラー復帰 | partial | 壊れたstorage・0件は安全に処理。全パターンのUI確認は未完了 |

## Curriculum

| 項目 | 判定 | 根拠 |
|---|---|---|
| P0 | human_decision | root P0=1（fi-namae:example）。CEO判断待ち |
| P1 | human_decision | root P1=13（cognate不一致11＋komaru等） |
| required | pass | roleが推薦へ接続済み |
| diagnostic | pass | 診断140語connected（partial 0） |
| cognate | human_decision | 不一致11語が判断待ち |
| examples | human_decision | fi-namae例文がP0 |
| furigana | pass | 140語draft・ruby表示 |
| images | partial | 実画像28枚・未生成8枚 |

## Learning Loop

| 項目 | 判定 |
|---|---|
| learning | pass |
| diagnostic | pass |
| day1 / day3 / day7 | pass（テスト13件・実機確認済み） |
| retention | pass（別日の自力正解のみで候補化） |
| conversation | partial（13/140語がcontextual） |

## UX

| 項目 | 判定 | 根拠 |
|---|---|---|
| desktop | pass | 実機スクリーンショット |
| mobile | pass | iframe実測 320/375/390/430/768 全幅で横overflow 0・CTA高48px・44px未満のタップ領域0 |
| CTA | pass | 第一CTAは一つ（ホーム・完了画面） |
| navigation | pass | モバイル4項目＋その他 |
| loading | partial | Suspenseフォールバックあり。遅延ロード中の表示は簡素 |
| empty | pass | 復習0件はカード非表示＋次の行動へ |
| error | partial | 壊れたstorageは空扱い。専用エラー画面は未実装 |
| accessibility | partial | aria-live・fieldset・44px確保。contrast自動計測は未実施 |

## Technical

| 項目 | 判定 | 値 |
|---|---|---|
| tests | pass | 644件全パス |
| tsc | pass | 0エラー |
| lint | pass | 45E/6W=51（ベースライン一致・増分0） |
| build | pass | 成功 |
| bundle | pass | main 590.30KB（増加0）・VocabularyHub 54.81KB lazy |
| images | pass | 404 0件 |
| console | pass | 重大エラー0 |
| URL | pass | vview=quickreview/decisions/connectivity |
| migration | not_applicable | 今回DB変更なし |

## Security

| 項目 | 判定 | 根拠 |
|---|---|---|
| internal routes | pass | 判断キュー・接続監査はことば図鑑内（labPreviewゲート内） |
| labPreview | pass | 一般受講生にはことば図鑑自体が非公開 |
| admin_overrides | **fail（正式公開ブロッカー）** | learnerが自己更新できるRLS問題が未解決 |
| RLS | not_applicable | 今回変更なし |
| learner data | pass | 変更なし（current_week・masteryState・XP・会話履歴すべて非接触） |
| PII | pass | analyticsにitemId/stage等のみ・自由入力や本文を送らない |
| Secrets | pass | 変更なし |

## 総合判定

**READY_FOR_PREPRODUCTION ではない。** 理由:

1. root P0=1・root P1=13 がCEO判断待ち（§28の必須条件）
2. 初回Learner Journeyの専用フローが未実装
3. admin_overrides のRLS問題が正式公開ブロッカーとして残っている
4. 正式DB保存（語彙進捗・復習スケジュール）が未実装

# 学習接続の品質（Phase 2E-1.10 §26）

140語 × 4surface = 560接続が「すべて同じ品質」に見えないよう、接続の**質**を4段階で分ける。

## 定義

| 品質 | 意味 | 例 |
|---|---|---|
| `none` | 接続なし | （現在0件） |
| `generic` | 一般的な導線のみ。対象語に固有の内容がない | AI会話画面へのリンクはあるが、その語を使う保証はない |
| `contextual` | 対象語に固有の内容がある | theme/starter/targetExpression付きの会話練習・語ごとの復習予定 |
| `verified` | テストまたは実ブラウザで動作確認済み | 語彙一覧/詳細の表示・診断プール問題・間隔反復 |

`status`（connected/partial/orphaned/unverified/intentionally_isolated）とは**別の軸**。
statusは「到達するか」、qualityは「どれだけ対象語に即しているか」を表す。

## 2026-07-27（Phase 2E-1.10完了時）の実数

| surface | connected | 品質内訳 |
|---|---|---|
| 語彙画面 | 140 | verified 140 |
| 診断 | 140 | verified 40（プール問題・会話コア確認）／contextual 100（role=diagnosticの生成問題） |
| 会話 | 13 | contextual 13／**generic 127**（一般導線のみ・完成した接続ではない） |
| 復習 | 140 | verified 140（語ごとの間隔反復） |

品質合計: verified 320・contextual 113・generic 127・none 0（＝560）

## 読み方の注意

- **genericを完成扱いしない**。会話の127語は「AI会話でその語が出るかもしれない」だけで、
  対象語を使う保証はない。会話接続の実質は13語（対象語別練習がある語）
- `intentionally_isolated`: ことば図鑑全体が現在labPreview限定＝一般受講生には意図的に非公開
  （`graph.labOnly`。Inspector冒頭にも明示）

## 次に品質を上げる余地

1. 会話 generic 127 → contextual: N3会話重要語から対象語別練習を追加（§11で上位20語程度が候補）
2. 診断 contextual 100 → verified: 生成問題のスナップショットテスト追加

# 語彙パック（Phase 2C++ §43-§47）

## モデル
VocabularyPack（itemIds参照・同一Item複製禁止・requiredItemIdsがゴール判定対象）。
**表示語数は常にitemIdsの実数から計算**（estimatedWordCountの手入力を使わない）。

## 現在のパック
- pack-life-basic-1「生活・会話の基礎」78語（required=Core A 78語・draft）
- **78語の正式な位置づけ = 視覚語彙学習MVP・基礎/生活語彙の初期パック（draft）**。
  N2/N3対応の完成語彙ではない（UIにもmvpPackNoteで明示・「78語でN3完成」等の表記禁止）
- N3準備/N2準備/会話コア/仕事パックは未実装（存在するように見せない・UIは「準備中」注記のみ）

## ゴール条件（§46 MVP・self_knownだけでは完了にならない）
not_started→learning（1語以上seen）→seen_all（required全件seen）→verifying（required80%以上を問題でindependent確認）→
retention_check（retained_candidateあり）→reviewed_done（人間レビュー済みパックのみ・試作では到達しない）。

## 既知語スキップ・簡易診断（§47・構造のみ）
パック開始時の代表問題診断→すぐ確認済み/読みだけ/通常学習へ分類するフローはPhase 2D。
現状はtransparent_same語の後回し（N2/N3トラック時）と簡易確認ルート（cognateSame表示）で対応。

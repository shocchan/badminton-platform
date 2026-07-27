# 語彙診断（Phase 2D §10・§47）

- 目的: 既知の簡単な語を一語ずつ学習させない（特にN2/N3学習者の基礎78語）
- 形式: 全タップ式・意味/読みを交互に確認・決定的生成（buildDiagnosticQuestion）
- 問題数: min(15, max(8, 語数/8)) → 基礎78語=10問・N3=8問（比例させすぎない）
- 結果: 正解=confirmed（確認済み・encounterも記録し短時間通過）／誤答=remedial（復習リストへ）
- 自己申告だけで完了扱いにしない（self_knownはdiagnostic結果に影響しない・テスト担保）
- N2学習者の初期パス: 基礎診断→弱点remedialだけ学習→N3準備パック→（将来）N2パック
- 3分復習（§25）: 弱点3〜7問・前回誤答の軸を維持（読み誤答→読み形式）・画像形式も利用

## Phase 2E-1 更新（2026-07-27）

本ドキュメントの「confirmed/remedial」二値モデルは次元別モデルへ拡張された。
現行仕様は ai-course-vocabulary-diagnostic-dimensions.md が正
（reading/meaning/usage/collocation/particle/conjugation・basic_confirmed/partially_confirmed/remedial・
v1→v2移行・診断問題プール）。

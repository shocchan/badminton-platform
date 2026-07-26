# 中国語同源語の扱い（Phase 2C++ §39-§42）

## 分類（ChineseCognateType）
transparent_same / mostly_same / partial_overlap / false_friend / japanese_specific / no_cognate / unreviewed

## 原則
- 意味が同じでも収録から除外しない。**読み・アクセント・使い方が学習対象**（中国=ちゅうごく・中国出身です等）
- transparent_same語は簡易確認ルート（「意味が近い。読みと使い方を確認」表示＋N2/N3トラックでは新語推薦を後回し）
- false_friend（先生≠Mr.・勉強≠勉强）は注意表示。**AIだけで大量確定せず**、レビュー済み分類のみ表示（unreviewedは非表示）
- 一文字中国語訳の監査: 訳が短くても正確なら維持し、学習ポイント（読み/用法）を明示する方針。
  住む=「住」→中心意味＋よく使う形「〜に住んでいます」をusageNote/例文で補完済み

## 現状
high confidence分類: transparent_same 8語・mostly_same 2語・false_friend 2語（先生・勉強する）・
partial_overlap 5語・japanese_specific 2語・no_cognate 2語。残り57語=unreviewed（人間レビュー待ち）。

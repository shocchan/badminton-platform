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

## Phase 2E-1 更新（2026-07-27）

- 140語の実測（auditSummary・単一集計関数）: 分類済み40（transparent 17／mostly 9／partial 6／
  false friend 4／japanese_specific 2／no_cognate 2）・unreviewed 100（基礎55＋N3 45）。
- Sense別上書きを導入（高い・聞く・大変・都合＝4語8Sense・未レビュー2Sense）。
  Item集計とSense集計は分離（ai-course-vocabulary-sense-cognates.md）。
- 中心意味（meaningZhShort）と学習ポイント（learningFocusZh・37語）を分離（同ドキュメント§4）。
- 中国語表記の正規化: meaningZh内の日本語式中黒「・」を「；」へ統一（テストで再発防止）。

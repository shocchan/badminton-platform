# ふりがなポリシー（Phase 2C++ §37-§38）

## 設定（本人が変更可能・vocab sessionStorage）
always（いつも表示）/ first_time（初めてのことばだけ）/ hard_only（難しい漢字だけ）/ off。
初期値の目安: 基礎・N4トラック=always／N3=first_time／N2=hard_only（トラック変更時にUIから変更可能）。

## 適用（MVP）
- 語彙詳細の見出し読み（readingKana）に適用。first_timeはencounterCountで判定
- 例文への語別ルビ振りは形態素データが必要なためPhase 2D（docs記載）

## 読み問題の正解漏洩防止（§38・テストで担保）
- 読み問題（reading_choice等）の問題文には対象語の読みを表示しない
- 画像問題のalt・aria-labelに正解の日本語（見出し語・かな）を含めない（altLeaksAnswer検証）
- 回答後の解説では読みを表示する

## Phase 2E-1 更新（2026-07-27）

- 例文の語別ふりがなを本実装（140/140語・667セグメント）。仕様は
  ai-course-vocabulary-example-furigana.md が正（再構成保証・hard_only/offの実挙動・
  不確実語のplain textフォールバック・「読みを表示」補助操作）。

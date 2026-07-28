# Phase 3P-4 指示文（監督ChatGPT発行・2026-07-28）

decision: CONTINUE
phase_name: Phase 3P-4 N3 Grammar Source Audit & Complete Draft Integration
（全文はChatGPTスレッド末尾。ここは実行用digest）

## 役割

Excel「N3の文法120例文集」を**そのまま流し込まない**。まずsource品質を決定的に監査:
Excel行数／実候補数／独立文型数／同一文型の意味差／接続形式差／表記揺れ／重複／
N2文法との重なり／文法でなく表現・collocationの行／source不備。
その後、**必要fieldがすべて揃った候補だけ**をN3文法の完成draftとして追加する。

## 完成draftの必須field

日本語説明・中国語説明・**接続（活用形）**・意味ニュアンス・例文・問題・会話練習・
復習・route・Unit・完了条件。不完全な文型の教材本体追加は禁止（未完成数を増やさない）。

## 主指標（before→after目標）

- N3 Excel未取込120 → source未分類0・独立文型粒度未分類0・terminal state未分類0
- complete draftのrequired field欠損0・route孤立0・問題/会話/復習未接続0・DQ参照切れ0

## 入口監査の実測値（本セッションで先行実施済み）

- シート「N3の文法120例文集」: header+データ120行
- 列: ☑️／文法／意味(日本語)／意味(中国語)／日本語の例文／例文の意味(中国語)
- 文型非空120・独立表記114・**表記重複6**（〜まま・〜ようにする・〜ように言う・
  〜わけがない・〜わけではない 等=意味差の別行か要判定）
- 中文列は既存（品質検証は必要）

## 3P-3レビューの要点（引き継ぎ）

- preflight会計差異は解消済みと認定。contextual draft 140/generic 0/missing 0
- オノマトペ100完備・全draft・未承認を確認。verifiedへの昇格は人間確認後
- N3は「120行=120文型と仮定しない」が最重要指示

# 著作権・権利ゲート（Phase 3 全体に適用・CEO指示 §0）

作成: 2026-07-28 ／ 適用範囲: 語彙・文法・例文・問題・画像・音声のすべて

## 大原則

**権利確認なしにアプリへ転載しない。** 「出典を付ければ利用可能」は誤り。
少し表現を変えただけの複製・AIによる近接した言い換えも複製とみなす。
著作権の最終法的判断はAIが行わない（AIができるのはリスクの指摘と分類まで）。

## rightsStatus（全SourceRef必須）

| 値 | 意味 | 一般学習者への表示 | runtime/bundle |
|---|---|---|---|
| `original` | 自作（独自問題・自作教材） | ✅ 可 | 可 |
| `licensed` | 利用許諾あり（証跡必須） | ✅ 可 | 可 |
| `official_permission_confirmed` | 公式の許可確認済み | ✅ 可 | 可 |
| `public_domain` | パブリックドメイン | ✅ 可 | 可 |
| `private_reference_only` | 内部分析限定（購入書籍等） | ❌ 不可 | 本文・画像を含めない |
| `rights_unknown` | 権利不明 | ❌ 不可 | **含めない** |
| `blocked` | 利用不可と判断済み | ❌ 不可 | **含めない** |

## private_reference_only の運用

- 内部分析限定・sho限定
- 問題本文・画像を一般画面へ出さない・学習者へ配信しない
- analyticsへ本文を送らない
- 抽出してよいのは: 問題形式・学習論点・難易度傾向・誤答パターンの一般化・時間配分・カテゴリ

## 特に禁止（再掲）

過去問画像の無断公開／問題文・選択肢・読解文章・聴解音声の無断転載／
市販問題集のスキャン公開／近接した言い換えによる再現／権利不明素材の一般learner表示。

## ゲートの実装（段階別）

- **3A（現在）**: 本書＋Source inventory。runtime変更なし
- **3C**: N2QuestionSource registryに`rightsStatus`必須。`rights_unknown`/`blocked`はexport対象から
  構造的に除外（テストで担保）
- **3D**: 公開前チェックに originalityReview（sourceSimilarityRisk / phraseOverlapRisk /
  structureSimilarityRisk / originalityReviewStatus）。高リスクは公開不可
- **3F**: Release Gateに「rights unknown 0 / blocked item runtime 0」を組み込み

## 既存教材への適用（3Aでの判定）

- 現140語・N2文法180・N3文法120の原本workbookは **teacher_created想定**（しょっちゃん自作）。
  ただし人間確認で確定するまで「想定」の表記を落とさない
- workbook内の3シート（慣用句110集・ビジネスメッセージ67選・営業用語200集）は外部由来の
  可能性があり **rights_unknown 扱い**。人間確認まで新規取込の対象にしない
- 画像9件（道案内7・オノマトペ1・王さん1）は出所確認が必要（スクリーンショット等の可能性）

## 表示の誠実さ（§16・§18関連）

- JLPT公式認定を示す表示をしない・合格保証をしない
- 「本試験で○点」「合格確率○%」を妥当性検証なしに出さない
- 全領域がGateを通るまで「N2 Course Complete」と表示しない
  （一部完成は「N2語彙準備」「N2文法β」「N2問題演習β」等と正直に表示）

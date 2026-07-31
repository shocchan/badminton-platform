# しくみラボ 問題インタラクション仕様（全問タップ式・2026-07-27）

## 原則（§9-§11）
- 利用者向け単元の全問題は **requiresKeyboard === false**（マウス・タップのみで回答可能）
- スマホでキーボード・IME・中日切替が不要。入力途中の文字消失問題が構造的に存在しない
- 決定的採点のみ（LLM採点なし）。判定は表示位置でなく choice ID（元配列index）
- attemptSeedシャッフル（同一attempt内不変・別attemptで変化・正解が常に先頭にならない）
- 問題ID・choice IDはja/zh共通。翻訳は表示のみで判定に影響しない

## 許可する形式
| type | 内容 | メカニクス |
|---|---|---|
| single_choice | 1つ選ぶ | choice |
| reading_choice | 読みを選ぶ | choice |
| particle_choice | 助詞を選ぶ | choice |
| conjugation_choice | 正しい活用形を選ぶ | choice |
| sentence_choice | 自然な文を選ぶ | choice |
| error_correction_choice | 正しい修正を選ぶ | choice |
| fill_blank | 空欄に入るものを選ぶ（選択式のみ） | choice |
| sentence_order | 語句チップをタップで並べる | order |
| matching | 左→右をタップで組み合わせる | matching |

## 禁止する形式（利用者向け単元）
text_input / kana_input / conjugation_input（自由入力・文章入力含む）。
エンジンは将来用に入力型を保持するが、教材データに含まれていたら:
- レジストリ横断テストが失敗（foundationRegistry.test.ts）
- CEOレビューdocs生成がエラーで停止（staging表示不可に相当）

## 選択肢の教育品質（§12）
- 誤答は実際に間違えやすい形から作る（例: 行かない ⇔ 行きない/行くない/行ってない、買わない ⇔ 買あない、
  9時=くじ ⇔ きゅうじ、来て=きて ⇔ くて）
- 中国語母語者の典型誤り・活用規則の混同・助詞の混同・濁音/促音/特殊読みの混同を優先
- 正解だけ長い/丁寧すぎる選択肢を作らない・粒度を揃える・複数正解を作らない（重複選択肢はテストで検出）
- 「働いてます」等の会話省略形は、丁寧体基本形を学ぶ単元では誤答に使わず、使う場合は解説で位置づけを明示

## あとで確認（skip・§13）
- 不正解と別管理（skipped=true）。候補状態はguided相当・3日後の復習候補
- スコアには正解として数えない。結果画面に「あとで確認: n問」を別枠表示
- 正式保存されていない試作である注記を維持

## 採点・正規化
- choice/order/matching: 安定ID・順序・対応の完全一致
- エンジンの入力正規化（NFKC・かな・空白・句読点）は将来用に維持。意味が変わる差（に/で等）は同一化しない

## アクセシビリティ（§23）
44px以上・選択状態にチェックアイコン併用・focus-visible・aria-pressed/progressbar・
Enter/Space対応（button要素）・ドラッグ不要・320px横スクロールなし

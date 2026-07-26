# 視覚学習設計（Phase 2C+ §12-§14・§26-§30）

## 画像の目的
装飾ではなく記憶支援。見る→意味を予想→日本語と読み→中国語→例文→タップ確認→自己評価の学習操作へ接続（§26）。

## 視覚タイプの使い分け（§12）
A 場面イラスト=動詞・生活場面／B 対比イラスト=形容詞ペア／C 変化図=活用／D 関係図=助詞／
E 時間軸=ています・頻度／F アイコン=意味区分／G AI生成=人物動作を含む生活場面

## デザイン方針（§13）
成人向け・柔らかいフラット・清潔感・落ち着いた配色・余白・主役明確・文字/ロゴ/商標/実在キャラなし・
国籍固定なし・幼児教材/ゲーム風にしない・モバイルカードで判別可能・4:3。

## AI生成の現実的な扱い（§14）
実ファイルが存在しないassetはreviewStatus='planned'・filePath=null（完成画像として扱わない）。
表示は approved=一般可／draft〜reviewed=labPreviewのみ／planned・rejected=表示不可（isVisibleAsset）。
画像なしでも学習が成立: 中立プレースホルダー（抽象図形＋カテゴリアイコン・「画像準備中」を大書しない）。

## alt設計（§43）
altJa/altZhは場面の説明。image_to_word問題に使うassetはaltに正解の日本語（見出し語・かな）を
含めない（altLeaksAnswerでビルダーが拒否＋manifest全件テスト）。場面の中国語説明は
晴眼者が画像から得る情報と同等のため漏洩と扱わない。

## パフォーマンス（§28・§45）
public/images/ai-course/foundation/{verbs,adjectives,nouns,situations,grammar,placeholders}/。
bundleへ埋め込まない・loading=lazy・width/height指定・aspect比固定でlayout shift防止・
WebP優先（thumbnail 320w 目標20-60KB／detail 800w 目標100-200KB）・ファイル名は安定ID・日本語名/PII禁止。
テキストを画像ロード待ちにしない（カードは文字が先に出る）。

## 画像レビュー（§29）
語義一致・誤解なし・文化的自然さ・破綻なし・文字/ロゴなし・属性固定なし・成人向け・モバイル判別・
alt適切・著作権記録・prompt保存を確認後にreviewed→approved。approved前は一般表示禁止。

## 著作権（§53）
検索画像・市販教材・ストック無断利用・キャラクター等は禁止。使用可: 独自SVG・CEO提供・
レビュー済みAI生成・ライセンス記録済み素材。プロンプトは独自作成・PII/learner情報を含めない（§54）。

# 語彙イラストの方針と差し替え手順 — Phase B-4

## 何を「完成」と呼ぶか

このフェーズで満たしたのは **technical completion** であって、人間による編集上の最終承認ではない。

- assetが存在する（140/140）
- 学習者の画面に実際に表示される（140/140）
- 意味が明白に間違っていない（機械検査＋目視シートで確認）
- brokenがない
- あとから1語ずつ差し替えられる

`human_approved` は SVG 側では **全件 false** のまま。一括昇格はしていない
（テスト `vocabIllustration.test.ts` で固定）。

## なぜSVGなのか

画像生成pipelineがこの環境で使えなかった（API・認証・batch生成・共通スタイル維持の
いずれも確立できない）。方針どおり長時間固執せず、自前SVGへ切り替えた。

SVGは壊れたplaceholderではなく、正式なillustration assetとして扱う。理由:

- 決定的なコードで描くので「意図しない写真が出る」種類の事故が起きない
- そのため、AI生成ラスター画像に必要な人間の編集承認（`approved`）を待たずに学習者へ出せる
- 既存の `visualAssetManifest`（AI生成画像・approvedのみ表示）とは別レイヤーとして共存する

## 描画の決まり

| 決まり | どう守っているか |
|---|---|
| 文字を描かない | 描画器が `text` / `tspan` / `foreignObject` を一切出さない（テストで固定） |
| 語ごとに固有の場面 | 場所・人物・小物・向きの組み合わせが全140語で重複0（テストで固定） |
| 写実・3D禁止 | 面だけで描くフラットベクター。影は薄い楕円ひとつ |
| 既存IPの模倣禁止 | すべて `vocabSceneKit.tsx` 内の自前プリミティブ |
| 部品が欠けない | 人物は頭・胴・腕・脚を必ず描く。poseは腕と脚だけを差し替える |
| mobileでも分かる | viewBox 120×90 固定・4:3・線ではなく面で表現 |
| ja / zh の alt | manifestが両方を持ち、表示言語で切り替わる（テストで固定） |

## 対になる語

方向・対義・自他の対は**同じ場所・同じ画角**にし、変えるのは向きか動作主だけ。

- 入る/出る・乗る/降りる・行く/来る・覚える/忘れる → 矢印の向きが逆であることを機械検査
- 変わる/変える・決まる/決める・続く/続ける → **自動詞側には人を描かない／他動詞側には必ず描く**
  （中国語母語者がいちばん取り違えるところなので、機械検査で固定）
- 大小・高安・新旧・暑寒・遠近・多少・嬉悲 → 同じ場所であることを機械検査

## 目視確認のしかた

```bash
./node_modules/.bin/vite-node scripts/ai-course/render-vocab-scene-sheet.tsx
```

`dist-scene-sheet.html` が出る（gitには入れない）。`SHEET_PAGE=3` のように
ページ指定もできる。意味の取り違えは人の目でしか見つからないので、
差し替え候補を選ぶときはこのシートを使う。

## 差し替え優先度（human_review_candidate）

抽象語は場面に落としにくく、絵としては弱い。次を優先して実画像へ差し替える。

1. 国・地名（中国・日本）— 地形のかたちだけでは伝わりにくい
2. 抽象名詞（状況・関係・情報・理由）
3. 副詞（たぶん・なかなか・つまり）

## 1語ずつ差し替える手順

1. 新画像を `public/images/ai-course/...` へ置く
2. `vocabIllustrationManifest.ts` の該当エントリの `assetPath` と `assetType` を変更する
   （`svg_fallback` → `existing_image`）。`itemId` は変えない
3. `altJa` / `altZh` を新画像に合わせて更新する
4. 意味の検査: `npx vitest run src/lib/aiLesson/course/vocabIllustration.test.ts`
5. 描画の検査: `npx vitest run src/components/ai-course/foundation/vocab/vocabIllustrationRender.test.tsx`
6. stagingで実画面を確認する

`itemId` を正準キーにしているので、この手順では progress・route・alt・review状態は壊れない。

## 出題での扱い

`image_to_word`（絵を見て語を選ぶ）では、altが答えのヒントになる。
この場合だけ `decorative` を渡し、支援技術には説明を渡さない（絵は同じものを出す）。

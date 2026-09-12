# Adventure V2 map assets — provenance

## 青タオル旅人（2026-09-12生成、2026-09-13組み込み確認）

- 状態: `human_review_candidate`。ステージングでの人間の確認前に `approved` としない。
- デザイン基準: DESIGN_BRIEF MB-v1。方向性: 既存地図に合わせたクリーンなデジタル絵＋少量の水彩感（A/Bを新規に切り替えていない）。既定・非表示・エラー時は青旗を保持。
- 生成: OpenAI image generation tool。このタスク内で新規生成。参照は既存の世界地図と、このタスクで生成した男性主人公。実在学習者の画面・個人写真・既存作品の人物は参照していない。「しょっちゃん」の青タオルというコンセプトであり、本人の肖像を再現したものではない。
- 指示の要旨: 現代日本の若い成人、自然な約7頭身、青タオル／バンダナ、青い上着、生成りのインナー、紺のパンツ、明るいスニーカー、斜め掛け鞄。洗練されたデジタル絵に少量の水彩感。男女は同じシリーズ。太線・チビ・ドット・3D・写実・ファンタジー装備・画像内文字を避ける。
- 地図用指示: 約60度俯瞰・平行投影・顔を見せない後ろ姿・右上の光・左下の短い影・透過背景。
- 選択用指示: 正面〜3/4正面の全身。女性正面は透過模様が焼き込まれた初稿を不採用とし、無地の生成り背景で再生成。
- 最適化: sharpでWebP化。正面は生成り背景へ合成し160×240 / 320×480、後ろ姿はアルファを保ち32×48 / 64×96。地図ではCSSで28×40pxに収める。
- アセットの正本: `src/lib/aiLesson/course/adventure/advAvatar.ts`。保存値は `flag` / `male-blue` / `female-blue` のみ。

### 原本（ローカル生成履歴）

- `male-blue-front`: `/Users/shocchan/.codex/generated_images/01a093b1-cbce-7bf2-84d7-f0fa6f57a508/exec-ab51bfb4-06a4-4dc5-9e3d-52b6668287c4.png`
- `female-blue-front`: `/Users/shocchan/.codex/generated_images/01a093b1-cbce-7bf2-84d7-f0fa6f57a508/exec-f2414e66-5718-4832-86cf-9519da44f07b.png`
- `male-blue-back`: `/Users/shocchan/.codex/generated_images/01a093b1-cbce-7bf2-84d7-f0fa6f57a508/exec-a7555cfe-3f8b-4d22-91cc-7a6c824f80fb.png`
- `female-blue-back`: `/Users/shocchan/.codex/generated_images/01a093b1-cbce-7bf2-84d7-f0fa6f57a508/exec-c8c6e798-2bd4-4c17-bda1-d82a05d18017.png`

### 配信ファイル

| ファイル | bytes | SHA-256 |
|---|---:|---|
| `avatar-female-blue-back@1x.webp` | 1502 | `9aa65cb4d29a50be0b670a3517cc8c40030fc23fad2a7c4750fb5579600b560d` |
| `avatar-female-blue-back@2x.webp` | 3212 | `846fda5ee201b275482d792828969ee671bb746a8e2969ce86a53c1d6abbd764` |
| `avatar-female-blue-front@1x.webp` | 4108 | `e2ea929dc8cbb9815f3ee3abd589ae8f032cc8bea32a5ecd973fd7bc710c8f91` |
| `avatar-female-blue-front@2x.webp` | 11682 | `8aad61741afcb3874f85802aa2156aca8b080189a1d8a134744eedd5755c6ce5` |
| `avatar-male-blue-back@1x.webp` | 1446 | `4d1b01188eef915cd113328bd940358365a1d1ab00ba4d18d733e3be06b5880e` |
| `avatar-male-blue-back@2x.webp` | 3216 | `adc418b212f2481c7e31811bf45a2c2a8657c2a1fcfb1b25f5d174b5cc206c37` |
| `avatar-male-blue-front@1x.webp` | 4026 | `231fe17721424723aa100daf67b79b29dd84f174b30a6f19ded4454dee6b8bfd` |
| `avatar-male-blue-front@2x.webp` | 11064 | `2ad8c1039e9919fe9b51467b6b5521e0dca84b348a0bdf805fd0ebd8beadfe42` |

## 地域カード

既存の `HOME_HEROES` を再利用。状態・文言はHTML、画像に文字は含めない。17種類のランドマークは10種類の既存シーンに対応付け、同じ街の画像を共有する。画像エラー時は既存のSVGへ戻る。世界地図背景・anchor・SPINE/RING・areaIdの変更なし。

## 確認用

`scripts/ai-course/map-immersion-preview.html` を開発サーバーで開く。合成プロフィールだけを使い、男女／青旗、JA／ZH、試験／会話、全攻略を切り替えられる。DB保存・実ログインは検証しない。通常の本番ビルドにはこのHTMLを含めない。

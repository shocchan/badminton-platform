# 冒険の世界地図 — 画像差し替え手順（INTEGRATION）

作成: 2026-08-22 ／ 対象: `src/components/ai-course/adventure/AdvWorldMap*.tsx`
前提（CEO決定 2026-08-19）: 画像は **ChatGPT の画像生成が担当**。Claude は調査・ブリーフ・検品・組み込み担当。
この文書の時点で **画像は1枚も存在しない**。コードは「画像を置けば有効になる」土台まで整えてある。

関連: `before/safe-area.md`（セーフエリア仕様・素材一覧・ChatGPT向けプロンプト骨子・検品チェックリスト）

---

## 0. いま何ができているか（土台）

| 部品 | ファイル | 役割 |
|---|---|---|
| 表示方式フラグ | `src/lib/aiLesson/course/adventure/advWorldMapVariant.ts` | `?map=image` / `?map=svg` / `?map=reset`、localStorage `adv.worldMap.variant`、**既定 `svg`** |
| 素材マニフェスト | `src/lib/aiLesson/course/adventure/advWorldMapAssets.ts` | 背景画像のパス・寸法（`WORLD_MAP_BG`）。座標は持たない |
| 画像版コンポーネント | `src/components/ai-course/adventure/AdvWorldMapImage.tsx` | `AdvWorldMapImage`（画像背景＋自動フォールバック）と `AdvWorldMapSwitch`（フラグで新旧を出し分け） |
| 旧SVG版（現行） | `src/components/ai-course/adventure/AdvWorldMap.tsx` | `backdrop` / `hideScenery` / `variant` / `imageState` の任意 prop を追加。**既定値は現行と同じ描画** |
| 呼び出し元 | `src/components/ai-course/adventure/AdvAdventureMap.tsx` | `<AdvWorldMap>` → `<AdvWorldMapSwitch>`（props は同じ） |
| 最適化スクリプト | `scripts/ai-course/optimize-map-images.mjs` | PNG → WebP 1x/2x（＋`--avif`）。sharp が無ければ依存追加せず終了（exit 2） |
| 検査 | `src/components/ai-course/adventure/advWorldMapImage.test.tsx` | 既定 svg／`?map=image` で画像版／画像エラーで SVG フォールバック／読込成功で風景が消える／会話クロップ |

### 仕組み（1 枚目: 背景）

```
<nav data-map-variant="image" data-map-image-state="loading|loaded|error">
  <div class="relative overflow-hidden rounded-2xl">
    <picture class="absolute inset-0">            ← 画像（object-fit: cover。会話ルートは object-position 50% 100% ＝下半分）
      <source type="image/avif" srcset="…@1x.avif 1x, …@2x.avif 2x">   ← AVIF を置いたときだけ
      <img src=…@1x.webp srcset="…@1x.webp 1x, …@2x.webp 2x" width=720 height=1200 loading=lazy decoding=async alt="（ja/zh）">
    </picture>
    <svg viewBox="0 0 360 600" class="relative">   ← 枠の高さはこの viewBox が決める（画像が来る前と後で同じ＝CLS なし）
      [WorldScenery … 読込完了までだけ描く（プレースホルダ）]
      道・ノード・霧・雲海（現行と同じ論理座標）
    </svg>
    ノード button（%配置・44px）・旗ラベル・吹き出し（現行どおり）
  </div>
</nav>
```

- 読込前: 旧SVG風景がそのまま見える（画像が遅くても白い枠にならない）
- 読込成功: 風景 `<g data-adv-scenery="svg">` を外し、画像が透けて見える。道・ノードは同じ座標のまま
- 読込失敗（404・デコード不可）: `<picture>` ごと外して**旧SVG版そのもの**に戻る（`data-map-variant="svg"`, `data-map-image-state="error"`）
- 画像未配置の状態で `?map=image` にしても、404 → 自動で旧SVG版。**壊れた見た目にはならない**

---

## 1. 画像が届いたら（背景 1 枚）

1. **検品**: `before/safe-area.md` §6 のチェックリスト（3:5・文字なし・バンド境界・道の回廊・太陽の位置）
2. **変換**（PNG → WebP/AVIF）
   ```bash
   cd /Users/shocchan/badminton-aicourse
   node scripts/ai-course/optimize-map-images.mjs ~/Downloads/world-bg.png --name world-bg --avif
   # → public/ai-course/map/world-bg@2x.webp (1440×2400) / world-bg@1x.webp (720×1200) / 同 .avif
   ```
   - sharp が無い場合は「sharp が見つかりません」で終了（exit 2）。`npm i -D sharp` は CEO 判断。代替は squoosh.app で手動変換し、同じファイル名で置く
   - 目安: @2x.webp ≤ 400KB。超えたら `--quality 75` など
3. **置き場所**: `public/ai-course/map/`
   | ファイル | 内容 |
   |---|---|
   | `world-bg@1x.webp` | 720×1200 |
   | `world-bg@2x.webp` | 1440×2400 |
   | `world-bg@1x.avif` / `world-bg@2x.avif` | 任意（両方そろえる） |
4. **マニフェスト**: `advWorldMapAssets.ts` の `WORLD_MAP_BG`
   - `width`/`height` が 1x 実寸（720×1200）と一致しているか確認
   - AVIF を置いたら `avif1x` / `avif2x` のコメントを外す（**片方だけは不可**: 対応ブラウザが 404 → SVG へ落ちる）
5. **検査**: `npx vitest run src/components/ai-course/adventure/advWorldMap` と `npx tsc -b --noEmit`

## 2. staging で確認（CEO 確認の前に）

```bash
# staging へ（本番直接デプロイ禁止: memory feedback_kawabado-staging-first）
./scripts/deploy-staging.sh
```

1. `https://staging.badminton-platform.pages.dev/ja/ai-course?map=image`（test アカウント）で冒険ホームを開く
   - `?map=image` は localStorage に保存されるので、以後クエリ無しでも画像版のまま
2. 見るところ
   - 世界地図の枠の高さが読込前後で変わらない（CLS なし）
   - ノード・道・旗が画像の地形に乗っている（`before/safe-area.md` §2 の座標どおり。ズレたら画像側のバンド境界を疑う）
   - 目標 N5/N4/N3 の雲海が地形を 2〜4 割透かしている
   - 会話ルート（タブ「会話」）で下半分（湾と環状路）だけが見えている
   - zh（`/zh/ai-course?map=image`）で alt・旗ラベル（最大 112px）が背景に沈まない
   - DevTools で `<nav data-map-variant="image" data-map-image-state="loaded">` になっている
3. 375 幅（iPhone）・768・1440 で確認。静的スクショの取り方は `scripts/ai-course/world-map-render-static.ts` ＋ scratchpad の Playwright（`before/safe-area.md` 冒頭）
4. 旧と見比べる: 同じ画面で `?map=svg`

## 3. 既定を画像版にする（CEO が OK を出した後だけ）

`advWorldMapVariant.ts` の 1 行:
```ts
export const DEFAULT_WORLD_MAP_VARIANT: WorldMapVariant = 'svg';   // → 'image'
```
- これで **全生徒が画像版**になる（画像が 404 の環境は引き続き自動で旧SVG）
- 個別に戻す: `?map=svg`（その端末だけ。localStorage に残る）。`?map=reset` で既定へ

## 4. 旧デザインへの戻し方（ロールバック）

| 範囲 | やること |
|---|---|
| 自分の端末だけ | URL に `?map=svg` を付けて開く（localStorage に保存される）。`?map=reset` で既定に戻す |
| 全員（即時・コード変更なし） | `public/ai-course/map/world-bg@*.webp|avif` を消して再デプロイ → 404 で全員自動フォールバック |
| 全員（正式） | `DEFAULT_WORLD_MAP_VARIANT` を `'svg'` に戻す（§3 の逆） |
| 完全撤去 | `AdvAdventureMap.tsx` の `AdvWorldMapSwitch` を `AdvWorldMap` に戻し、`AdvWorldMapImage.tsx`・`advWorldMapVariant.ts`・`advWorldMapAssets.ts`・同テストを削除。`AdvWorldMap.tsx` の任意 prop（`backdrop` 等）は残しても害はない |

---

## 5. 2 枚目以降（ランドマーク・ノード台座・雲海など）の組み込み方針

`before/safe-area.md` §5 の素材一覧。背景と違い **論理座標に置く別レイヤー**なので、`AdvWorldMapImage` ではなく SVG 内に `<image>` を足す。

```tsx
// 例: ランドマーク（足元中心 anchor・正規化幅 w）を viewBox 360×600 に置く
const toVb = (nx: number, ny: number) => ({ x: nx * 360, y: ny * 600 });
<image href="/ai-course/map/lm-sorano.webp" x={cx - w/2} y={cy - h} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
```

- 雲海（`CloudSea`）の下・道の上に描く（z 順: 画像背景 → ランドマーク → 道 → ノード → 霧 → 雲海）
- `CloudSea` のゴースト輪郭（塔・遺跡・街）は画像ランドマークと同じ anchor に合わせる
- 素材ごとにマニフェスト（`advWorldMapAssets.ts`）へ `{ src, anchor:[nx,ny], w }` を足す。座標を px で持たない
- 透過 PNG → `optimize-map-images.mjs <file> --ratio any --width2x 1024`（1:1 素材なら 512 が 1x）

## 6. 画像とは別の修正候補（safe-area.md §4-3 より。未適用）

1. 会話ルートで旗ラベル左端が 2px 見切れる → `AdvWorldMap.tsx` の `flagX` 下限 56 → 60
2. N2 の旗ラベル（x 0.536〜0.862 × y 0.021〜0.078）が太陽 (0.867, 0.077) と重なる → 画像側で太陽を x ≥ 0.90 か y ≤ 0.05 へ
3. `groundBlobColor(y)` のバンド境界（470/336/248/96）は画像の地形に合わせる前提。画像側が境界を守れば変更不要

## 7. 守ること

- **本番 DB 書き込みなし・git commit/push はこの作業では行わない**（CEO 確認後に別途）
- 画像を Claude が描かない（CEO決定 2026-08-19）。このリポジトリにも画像は 1 枚も追加していない
- スクショは test アカウントのみ。実在生徒の情報を写さない
- 既定 `svg` を CEO 確認前に変えない

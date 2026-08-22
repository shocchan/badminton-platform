# 冒険マップ 現状棚卸し（before inventory）

作成: 2026-08-22 ／ branch `feature/ai-course-adventure-v2-final-completion`
対象: `src/components/ai-course/adventure/` の冒険マップ（成長マップ）一式と、`public/` の画像素材。
目的: ChatGPT画像生成に渡すブリーフと組み込み設計の土台。**この文書は調査記録であり、画像は1枚も作っていない。**

> スクショについて: staging の testアカウント（ID test）は Supabase auth が `invalid_credentials` を返しログインできなかった（2回で打ち切り。login-guard のロックを避けるため）。
> 代わりに **製品と同じコンポーネント＋ビルド済みTailwind CSS** を合成プロフィール（個人情報なし）で静的描画し、Playwright で 390px 幅で撮影した。
> 静的描画のため `<img>`（先生・相棒のwebp）は壊れ表示になっている（実機では表示される）。スクショは `before/screenshots/`。

---

## 1. 構成要素（どのファイル・どの絵・どのサイズ）

| 要素 | ファイル | 描き方 | 論理サイズ | 390px実機での描画サイズ（実測） |
|---|---|---|---|---|
| **世界地図 本体** | `AdvWorldMap.tsx`（268行） | `<svg viewBox="0 0 360 600">` + HTMLボタン重ね | 360×600（会話ルートは `0 300 360 300` の海辺クロップ） | 356×593px（会話クロップ 356×297px）。`rounded-2xl border bg-sky-100` |
| 世界地図 風景 | `AdvWorldMapScenery.tsx`（419行）`WorldScenery` | 自作SVG図形のみ（空・峰・4つの地形バンド・湾・川・橋・固定ランドマーク9個） | 360×600 | 同上。文字なし。`<defs>` の linearGradient 2本 |
| 世界地図 雲海 | 同ファイル `CloudSea` | スカラップ縁の雲3枚＋ゴースト輪郭＋漂う雲パフ（CSS `adv-cloud-drift`） | 上端 -40 〜 `fogEdgeY`（N5:約y≈456 / N4:約y≈330 / N3:約y≈120。N2・会話では出ない） | 目標N5のとき画面の約2/3が雲（`ja-exam-n5-start-worldmap.png`） |
| 世界地図 ノード（17種） | 同ファイル `MiniLandmark` | `<svg viewBox="0 0 24 24">` を20×20で配置、足元に楕円ブロブ | 20×20（高さ20） | 約20px。小さすぎて種類の判別は困難（スクショ参照） |
| 道のジオメトリ | `src/lib/.../advWorldSpine.ts` | 背骨13点のベジェ→16分割折れ線、環状路（角丸矩形 x36..324 y480..576 r36） | SPINE: (170,532)→(252,70) | 道幅 done 5px / current・todo 4px（`2 7` 破線） |
| **地域カード（詳細）** | `AdvAdventureMap.tsx`（791行）`RegionDetail` | 上に `LandmarkScene`、下にテキスト＋CTA | シーン 160×110 viewBox、`preserveAspectRatio="xMidYMid slice"` | シーン高さ 96px（sm:112px）・幅いっぱい（358px） |
| 冒険の道（縦ルート） | 同 `<ol>` | 左に76px幅のシーンサムネ（`h-[62px]`、現在地は `h-[76px]`）＋右に見出し。章バナーは `bg-gradient-to-r` 5色ローテ | — | サムネ 76×62px。道レールは `left-[38px]` の縦線（done=6px緑グラデ＋足あとドット、current=青破線、todo=灰破線） |
| ヒーロー帯 | 同 `section aria-label="現在地"` | 現在地の `LandmarkScene` を背景に黒グラデ暗幕＋白文字 | 160×110 slice | 高さ112px（sm:128px） |
| **ランドマーク風景SVG** | `AdvMapLandmarks.tsx`（575行）`LandmarkScene` | 17種 × 8色調（`MapTone`）。空グラデ・太陽/月・遠山2枚・地面・前景草石・小道 | 160×110 | 用途ごとに slice 切り抜き |
| ランドマーク小アイコン | 同 `LandmarkIcon` | 17種、`viewBox 0 0 48 48`、5色固定パレット（muted時は灰） | 48×48 | 一覧表示32px / バッジ26・34px / 祝い72px / 章クリア一覧22px |
| **バッジ棚** | `AdvMapBadges.tsx`（96行） | 横スクロール `<ul>`。コイン＝丸背景＋`LandmarkIcon` | コイン 44px（ボス門・城は56px） | ラベル `max-w-[64px] truncate text-[10px]` |
| **セレモニー** | `AdvCelebrationOverlay.tsx`（146行） | 全画面 `fixed` モーダル。放射 `repeating-conic-gradient`（amber）＋白カード。conquest は96px丸＋`LandmarkIcon size=72` | — | `max-w-sm` |
| **次の道カード** | `AdvNextRoadCard.tsx`（66行） | `border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50` のカード。絵なし（🎉絵文字のみ） | — | 世界地図直下の `summitSlot` に入る |
| 先生アバター | `TeacherAvatar.tsx` | `<img>` webp を丸くトリミング（`objectPosition: center 12%`）、失敗時モノグラム | — | 今日の一歩 32px / 現在地パーティー 24px |
| 相棒アバター | `CompanionAvatar.tsx` | `<img>` webp 丸、失敗時モノグラムSVG | 512×512 | 現在地パーティー 24px / 祝い 36px |

画面全体の縦の長さ（390px幅・fullPage実測）: 総合ルート開始直後 **3,889px**（ja）/ 3,829px（zh）、試験N5 2,295px、会話 2,528px。世界地図は上から約 800〜1,300px の位置。

構造（上から）: 見出し → ヒーロー帯 → 今日の一歩（Primary CTA） → 攻略バッジ → ルートタブ（総合/試験/会話） → **冒険の世界地図** →（次の道カード）→ 凡例＋冒険の道（縦リスト） → 特別な場所。

---

## 2. 既存の画像素材（public/・src/assets）

ラスター画像は **先生・相棒・語彙シーン・LP用** だけ。**マップ背景・建物・ノード用のラスター画像は1枚も存在しない**（すべてコード内SVG）。

### 2-1. AIコース用（`public/images/ai-course/`）

| パス | 形式 | ピクセル | サイズ | 使用箇所 |
|---|---|---|---|---|
| `shoko-sensei-base.webp` | WebP | 680×938 | 59.5KB | `advTeacher.ts` neutral/speaking |
| `shoko-sensei-cheer.webp` | WebP | 520×821 | 61.2KB | smile / `CourseIllustration` complete |
| `shoko-sensei-teaching.webp` | WebP | 560×594 | 49.5KB | teaching |
| `shoko-sensei-wave.webp` | WebP | 820×1199 | 104.6KB | `CourseIllustration` welcome |
| `yuto-sensei-base.webp` | WebP | 680×978 | 73.7KB | neutral/speaking/smile（cheer無し→baseで代用・P3-1） |
| `yuto-sensei-teaching.webp` | WebP | 560×478 | 39.2KB | teaching |
| `yuto-sensei-wave.webp` | WebP | 820×1207 | 110.4KB | **コードから未参照**（advTeacher.assets に無い） |
| `coach-sho.webp` | WebP | 745×725 | 67.7KB | LP `AiCourseHero` / `sectionsC`（CEO本人） |
| `companions/natsu.webp`（猫） | WebP | 512×512 | 29.6KB | `CompanionAvatar` |
| `companions/haru.webp`（鳥） | WebP | 512×512 | 20.5KB | 同上 |
| `companions/aki.webp`（犬） | WebP | 512×512 | 21.2KB | 同上 |
| `foundation/verbs/verb-*-scene-v1.webp` ×23 | WebP | 800×600 | 21〜31KB | 語彙シーン（`visualAssetManifest`） |
| `foundation/verbs/*-thumb.webp` ×23 | WebP | 320×240 | 6〜8KB | 同サムネ |
| `foundation/adjectives/adj-*-contrast-v1(.thumb).webp` ×2組 | WebP | 800×600 / 320×240 | 21KB / 7KB | 同上 |
| `foundation/covers/pack-life-basic-cover-v1.webp` | WebP | 800×600 | 66.4KB | パック表紙 |
| `foundation/covers/pack-n3-prep-cover-v1.webp` | WebP | 800×600 | 34.4KB | 同上 |

`foundation/` 合計 1.4MB（46+4+4ファイル）。命名規約: `<kind>-<slug>-<scene|contrast|cover>-v<N>(-thumb).webp`、本体800×600＋サムネ320×240の2段。

### 2-2. その他 `public/`（kawabado本体・レガシー）

| パス | 形式 | ピクセル | サイズ | 備考 |
|---|---|---|---|---|
| `shoko-avatar.png` / `-smile.png` / `-speaking.png` | PNG | 512×512 | 312〜322KB | **src から未参照（レガシー）**。旧翔子先生アバター |
| `shoko-avatar-256.png` / `-smile-256` / `-speaking-256` | PNG | 256×256 | 81〜85KB | 同上・未参照 |
| `logo-192.webp` | WebP | 192×192 | 4.9KB | `LogoMark` |
| `favicon.png` / `favicon-64.png` / `favicon.svg` | PNG/SVG | 180 / 64 / 48 | 50KB / 7.8KB / 1.3KB | |
| `hero.jpg` / `hero.webp` | JPG/WebP | 1376×768 | 2.0MB / 86.8KB | kawabado HomePage（バドミントン） |
| `ogp.jpg` / `ogp.png` | JPG/PNG | 1200×630 | 154KB / 950KB | OGP |
| `icons.svg`, `icons/*.png` ×8 | — | — | — | kawabado 景品アイコン等 |
| `src/assets/hero.png` | PNG | 343×361 | 13KB | Vite雛形残り（未使用） |

---

## 3. 状態表現（ロック／完了／進行中／次の目的地）の現状

状態は `MapRegion.state: 'done' | 'current' | 'next' | 'locked'`（`advMapModel.ts`）。「今日のおすすめ」に相当するのは `next`（次の目的地）と、現在地カード／今日の一歩CTA。

| 状態 | 世界地図ノード（`MiniLandmark` NODE_TINT） | 状態バッジ（HTML 18px） | 道の区間 | 冒険の道サムネ（`STATE_STYLE`） | chip | バッジ棚 |
|---|---|---|---|---|---|---|
| **done 攻略済み** | 金 `#f59e0b` / 陰 `#b45309`、足元に `#fde68a` グロー | `bg-amber-500` 白★（Star） | 実線 `#f59e0b` 5px | `ring-2 ring-emerald-400`、右上に amber-400 丸★（`adv-twinkle`）、「攻略！」赤スタンプ | `bg-emerald-50 text-emerald-800` | `ring-amber-300` + amber-50→100 グラデ、LandmarkIcon フルカラー |
| **current 現在地** | 青 `#2563eb` / `#1e40af` | `bg-blue-600` 白旗（Flag）＋ `border-blue-400` リング×2（1つ `animate-ping`） | 破線 `#60a5fa` 4px `2 7` | `ring-4 ring-blue-500 shadow-lg`、外側に青 ping、下に「私」青丸＋先生24px＋相棒24px（`adv-bob`） | `bg-blue-600 text-white` | （未doneなので灰） |
| **next 次の目的地** | 白塗り＋金輪郭 `#f59e0b` 2.4px | 白地 `border-amber-400` 金∨（ChevronDown） | 破線 `#cbd5e1` | `ring-2 ring-amber-400`、上に amber-400 丸∨ピン（`adv-hop` 跳ねる） | `bg-amber-50 text-amber-900` | 灰 |
| **locked 霧の中** | 灰 `#b6c2d1` / `#94a3b8`、opacity 0.55、上に `#f1f5f9` 霧パフ3楕円 | `bg-white/85 border-gray-400` 灰錠（Lock） | 破線 `#cbd5e1` | `ring-1 ring-gray-300`、シーンに `#cbd5e1` 50%幕＋白霧＋「？」雲、右上に白丸錠、見出し `saturate-50` | `bg-gray-100 text-gray-600` | `opacity-40 grayscale` |

補足:
- 目標より先の道（未来）: `#94a3b8` 3px `1 9` 破線 opacity 0.25。雲海の中にソラノ塔・遺跡・ハタラキ街の**ゴースト輪郭**（`#94a3b8` 1.5px 線）。
- 旗: 最終ノード上に `Flag` 青 + 白85%の丸ラベル（`max-w-[112px] truncate text-[11px]`）。全攻略で金★に替わる。
- 色だけに頼らない設計（記号＋aria-label＋形: 会話レーンは角丸四角、試験レーンは円）は維持必須。
- 問題点（目視）: 開始直後はノードの大半が locked で、**同じ灰錠が20個並び、ランドマークの種類差は20pxでは読めない**。雲海が N5/N4 で画面の大半を覆い「薄い灰の板」に見える。

---

## 4. クリック領域の実装方式とモバイル対応

- **世界地図**: SVG は `aria-hidden` の純装飾。クリックは **HTML `<button>` を絶対配置**（`left/top` を viewBox 座標→%換算）。サイズ `h-11 w-11`＝**44×44px 固定**、`-translate-x-1/2 -translate-y-1/2`、`touch-manipulation`、tap-highlight除去、`focus-visible:ring-4`。DOM順＝旅の順（スクリーンリーダー順序を保証）。
- ノードの重なり防止: `advWorldSpine.layoutWorldNodes` が全ペア **44px以上**・隣接48px以上を保証（テストで固定）。試験ノードは会話ノードと近いとき道沿いに±48pxまでずらす。
- 雲海タップ: `absolute inset-x-0 top-0` の透明ボタン（高さ＝`fogEdgeY`%）。吹き出し5秒で自動クローズ。ノードボタンより下の z 順。
- 幅は `max-w-xl`（576px）中央寄せ。360×600 の aspect を `w-full h-auto` で維持するので **横幅に対して縦が1.67倍**（390px幅で593px高）。横長画像を置く前提にはなっていない。
- 冒険の道: サムネ（76px幅ボタン）と見出し（右カラムボタン）の2ボタンが同じ `aria-expanded` を持つ。詳細は行の外・全幅に展開。
- タップ→ `scrollToRegion` で該当 `<li>` を `scrollIntoView({block:'center'})`。
- アニメは全て `motion-safe` / `@media (prefers-reduced-motion: no-preference)` ブロック内。
- ボタン共通レシピは `advUi.ts`（`pressFx`/`primaryBtn`/`secondaryBtn`…）＋ `index.css` の `action-raised` 系。**ボタン見た目を別定義しない**のが社内ルール。
- 既存セーフエリア算出: `scripts/ai-course/world-map-safe-area.ts`（2026-08-22・並行作業で作成・未コミット）が N5〜N2×3ルートのノード/旗/雲海位置を正規化座標で出す。画像ブリーフの「人物・建物を置いてはいけない帯」はそこを正とする。

---

## 5. ブランド配色トークン

### 5-1. LP（`src/index.css` `@theme`、暖色系・2026-07決定）

| トークン | HEX | 役割 |
|---|---|---|
| `lp-ivory` | `#FBF5EC` | 背景 |
| `lp-ivory-2` | `#F5EAD9` | 背景（濃） |
| `lp-card` | `#FFFDF8` | カード |
| `lp-ink` | `#372B26` | 本文・見出し |
| `lp-ink-soft` | `#6E5F57` | 補助文 |
| `lp-line` | `#E7D8C4` | 罫線 |
| `lp-coral` | `#EE7A56` | **主色（テラコッタ）** |
| `lp-coral-deep` | `#D65E3B` | 主色・濃 |
| `lp-coral-soft` | `#FBDDCF` | 主色・淡（翔子先生アバター背景にも使用） |
| `lp-pine` | `#1E5C57` | **補色（深緑）** |
| `lp-pine-soft` | `#CFE4DF` | 補色・淡 |
| `lp-gold` | `#F4BE4C` | アクセント（金） |
| `lp-gold-soft` | `#FBEAC0` | アクセント・淡 |

LP内の使用頻度（tailwindクラス集計）: `text-lp-ink` 11、`text-lp-ink-soft` 10、`bg-lp-card` 9、`border-lp-line` 8、`text-lp-pine` 6、`text-lp-coral-deep` 6。

### 5-2. 学習アプリ（V2冒険画面）の実使用色 — **LPとは別系統（Tailwind標準の青基調）**

| 用途 | 色 |
|---|---|
| 主CTA・現在地 | `blue-600 #2563eb`（edge `rgb(30 64 175)`） |
| 攻略済み（道・星・バッジ） | `amber-400/500 #fbbf24/#f59e0b`、`emerald-400/500`（カードring・レール） |
| 次の目的地 | `amber-400 #fbbf24`／`amber-50`／`amber-900` |
| ロック | `gray-300/400/500`、`slate-200/300` |
| 本文 | `gray-900 #111827` / `gray-700` / `gray-600`、背景 `white`・`gray-50` |
| 章バナー | sky→indigo / amber→orange / emerald→teal / violet→fuchsia / rose→red の5グラデ |
| 鍛える力chip | `indigo-50 / indigo-800` |
| 祝い | `amber-50〜300` ring、放射 `rgb(251 191 36 / .35)` |
| `rpg-visual-direction.md` の方針 | 「静かな冒険」。中〜やや高明度・中〜低彩度・差し色は**藍と琥珀**・紙/水彩の質感・太線輪郭なし・ピクセルアート不可 |

→ 世界地図を暖色LPに寄せるなら、**状態色（青=現在地・金=攻略）は操作系として維持**し、背景の風景側だけ暖色にする、という分け方が既存設計と矛盾しない。

### 5-3. 世界地図の現パレット（`WORLD_PALETTE`）

海 `#8ecbe8`/`#6db2d8`、泡 `#e6f6ff`、砂 `#f2e2b8`、平野 `#cfe8b0`/`#aed592`、森 `#8cc48b`/`#5f9e6d`、高地 `#dccfae`/`#c3b28c`、遺跡 `#b9a98b`、空 `#dff0fe`→`#f6fbff`、峰 `#a9c1dd`、川 `#7cc3e8`、霧 `#f1f5f9`/`#e2e8f0`/`#eef2f7`。
地域カード8色調（`TONES`）: dawn（橙ピンク空 `#ffd9a8`）/ meadow（`#a9dcff` 空・`#9ed685` 草）/ forest（`#bfe0d4`）/ water（`#a5d8f5`）/ stone（砂色遺跡）/ sunset（`#f8a07e`）/ sky（`#8ec8ff`）/ night（`#2b3560`・星）。

### 5-4. 先生・相棒キャラ配色（画像ブリーフで固定するもの）

| キャラ | 確定仕様 | 画像から読める色 |
|---|---|---|
| 翔子先生 | 日本人女性20代後半〜30代前半、**黒髪あご〜肩ボブ＋斜め前髪、黒い四角メガネ**（識別の核）、温かいブラウンの瞳、微笑み、頬の赤み。画風: セミリアル寄りの柔らかいアニメ調。**衣装は暖色版に衣替え済み（テラコッタのカーディガン＋深緑の差し色）**。旧仕様のブルーグレージャケットは `rpg-visual-direction.md` に残るが現アセットは暖色版 | 髪 #1a1a1a付近、カーデ ≈ `lp-coral` 系、インナー 深緑 ≈ `lp-pine` 系、UI上の背景 `lp-coral-soft #FBDDCF`（`accentClass`）、ring `rose-100` |
| 悠斗先生 | 日本人男性20代後半〜30代前半、黒髪ショート、**黒い四角メガネ**（ペアの識別記号）、温かい笑顔、同じ暖色衣装・同画風 | UI背景 `sky-100`、ring `sky-100` |
| ナツ（猫） | 観察・寄り添い型 | モノグラム fallback: bg `#d9c7a7` / ink `#7c5f3b`（茶） |
| ハル（鳥） | ひらめき・ことば型 | bg `#c8e6a0` / ink `#4d7c0f`（緑） |
| アキ（犬） | 応援団長型 | bg `#fcd9a8` / ink `#c2660a`（橙） |
| 主人公 | 後ろ姿・シルエット中心、顔を作らない、性別固定しない（`rpg-visual-direction.md`）。現UIでは「私」の青丸文字のみ | `blue-600` |

世界観固定事項（`original-world-bible.md`）: 舞台「ミナモ列島」＝現代日本に近い街並み＋霧と光。剣・魔法・モンスター・HPバー・ドット絵は禁止。霧は白〜灰で真っ黒にしない。

---

## 6. 日本語版・中国語版で文字量が違う箇所（390px幅・実測）

`truncate` が効いている箇所は **中国語のほうが長くなりやすい**（地名に「｜中国語訳」を併記する設計のため）。

| 箇所 | 枠 | ja（幅/必要幅） | zh（幅/必要幅） | 状態 |
|---|---|---|---|---|
| 世界地図 旗ラベル（`destinationJa/Zh`） | `max-w-[112px] truncate text-[11px]` | N2・ソラノ塔 82/82 ✓ ／ N5・ミナト（基礎の港）**112/138 切れ** ／ N4・トオリミチ（暮らしの道）**112/171 切れ** ／ 会話の実戦・カタリ港 **112/122 切れ** | N2・ソラノ塔｜天空塔 **112/127 切れ** ／ N5・ミナト｜雾之港城（基础）**112/171 切れ** ／ 实战会话・カタリ港｜叙语港 **112/155 切れ** | 両言語で切れる。zh は N2 でも切れる |
| バッジ棚ラベル | `max-w-[64px] text-[10px] truncate` | N3語彙・文法の橋 **64/84 切れ**、N3実践ミッション **64/84 切れ**、読解・会話理解 **64/70 切れ** | N3词汇语法之桥 **64/74 切れ**、阅读・会话理解 **64/70 切れ**。基础营地 40 / N5阅读 34（jaより短い） | 試験地域名が長い。zh は2〜3割短いものが多い |
| 章バナー | `truncate`（枠は約300px） | 第1章 土台をつくる 104px、会話の旅2 伝える・頼む 128px | 第1章 打好基础 83px、会话之旅2 表达与请求 117px | 切れなし。zh のほうが短い |
| 冒険の道 地域名 | 244px幅・折返し可 | 最長「N3語彙・文法の橋」「仕事と暮らしの町」1行 | 最長「N3词汇语法之桥」「工作与生活之町」1行 | 切れなし |
| 鍛える力 | 244px | 「話題をまたぐ総合会話」 | 「时间分配与综合能力」「与人建立联系的会话」 | 切れなし |
| ヒーロー帯 次の目的地 | 折返し可 | 「会話の開始地点：ヒノデ台（暮らしの会話）」級で2行 | 「会话出发点：ヒノデ台｜日出台（生活会话）」で2行 | 折返しで吸収 |
| 世界地図 aria-label | — | 「基礎キャンプ、基礎の語彙と文字、ことばの霧の中」 | 「基础营地、基础词汇与文字、在词语的迷雾中」 | 読み上げのみ |

地名の正準（両言語）:
- 試験stage: 基礎キャンプ/基础营地、N5の読みもの/N5阅读、N5達成の確認/N5达成确认、N4文法攻略/N4语法攻略、N4の読みもの/N4阅读、N4達成の確認/N4达成确认、N3語彙・文法の橋/N3词汇语法之桥、N3実践ミッション/N3实战任务、N3文法攻略/N3语法攻略、N3模擬ボス/N3模拟Boss、N2の門/N2之门、N2語彙・文法/N2词汇语法、読解・会話理解/阅读・会话理解、N2模擬ボス/N2模拟Boss（`advRoute.ts`）
- 会話12地域（`courseJourney.PLACE_NAME`）: 自己紹介の村/自我介绍之村 … 総合会話の頂/综合会话之巅
- 目的地（`DESTINATION`）: N5・ミナト（基礎の港）/N5・ミナト｜雾之港城（基础）、N4・トオリミチ（暮らしの道）/N4・トオリミチ｜通行之路（生活）、N3・カタチの遺跡/N3・カタチの遺跡｜形之遗迹、N2・ソラノ塔/N2・ソラノ塔｜天空塔
- 世界の固定地名（世界地図に**文字は描かない**。描くならHTML側）: ミナト、ヒノデ台、トオリミチ、イチバ通り、ユカリの森、ハタラキ街（区）、カタチの遺跡、ソラノ塔、カタリ港、オモイデ庭園

**設計上の原則**: SVG/画像に文字を焼き込まない（翻訳できないため）。画像ブリーフでも「看板・文字・ロゴなし」を必須にする。

---

## 7. 画像差し替え時の組み込み制約（土台コードを書く人向けメモ）

1. 世界地図の **論理座標 360×600（縦長 3:5）** に道・ノード・雲海・旗がすべて依存している。背景画像を置くなら同比率で、`SPINE` 13点と環状路（x36..324, y480..576）の上に**建物や人物を置かない**。バンド境界: 砂 y≥470、平野 336〜470、森 248〜336、高地 96〜248、峰 <96（`groundBlobColor`）。
2. 会話ルートは同じ絵の **下半分（y300〜600）をクロップ**して表示する。下半分だけで成立する構図が必要。
3. 雲海（N5/N4/N3目標時）は `fogEdgeY` より上を 38〜94% の白で覆う。上部に置いた見どころは目標が低いうちは見えない。
4. 既存の画像命名・配置規約: `public/images/ai-course/<group>/<name>-v<N>.webp` ＋ `-thumb.webp`（800×600/320×240）。WebP、1枚 30〜110KB が現状のレンジ。AdvShell は lazy chunk（162.8KB）なので画像も遅延読込が前提。
5. `LandmarkScene` は 160×110 を `slice` で切る。カード高さ 96〜128px・幅 358px なので、実際に見えるのは **中央の横長帯（約 160×49〜57 相当）**。建物は中央・地面線 y=82 基準に置く必要がある。
6. `LandmarkIcon` は 48×48 の単色5色。バッジ棚（26/34px）・一覧（32px）・祝い（72px）で共用。差し替えるなら透過PNG/WebP 96×96 以上を想定。
7. AIコースの画像承認フロー: `VisualAsset` 状態（imported_draft → human_review_candidate → approved）。**人間承認前に approved にしない**（`illustration-policy.md`）。
8. ボタン44px・`focus-visible` リング・本文コントラスト4.5:1 は画像上でも維持（白85%ラベル背景などの既存手法）。

---

## 8. スクショ一覧（`before/screenshots/`、390px・2x）

| ファイル | 内容 |
|---|---|
| `ja-hybrid-n2-start-*.png` / `zh-hybrid-n2-start-*.png` | 総合ルート・N2目標・開始直後（20地域）。`-full` 全画面、`-worldmap` 世界地図、`-badges` バッジ棚、`-road` 冒険の道、`-hero` ヒーロー帯 |
| `ja-exam-n2-progress-*.png` | 試験ルート・基礎キャンプ攻略済み・N3の橋が現在地（定着50%） |
| `ja-exam-n5-start-*.png` / `zh-exam-n5-start-*.png` | N5目標（雲海が大きく出る） |
| `ja-exam-n4-allclear-*.png` | N4全攻略＋次の道カード（旗が金★） |
| `ja-conversation-w5-*.png` / `zh-conversation-w5-*.png` | 会話ルート5週目（海辺クロップ・環状路12ノード） |

再生成: `/private/tmp/claude-501/-Users-shocchan-ai-company/48dc179d-521e-4e4c-bd89-fbc003f614db/scratchpad/render-map-before.tsx`（vite-node）→ `scratchpad/pw/shoot-static.mjs`（Playwright、headless shell は `~/Library/Caches/ms-playwright/chromium_headless_shell-1234` を `executablePath` 指定）。
※ 製品の `scripts/ai-course/render-growth-map-sheet.tsx` は `window.matchMedia` 未定義で現在失敗する（`AdvAdventureMap.tsx:226`）。今回は触っていない。

---

## 9. 気づき（設計判断の材料・数字で）

- ノード20個中、開始直後は 18個が locked の灰錠。**「どこも同じ」問題はランドマークSVGの差ではなくサイズ（20px）と状態塗り（灰一色）に由来**。
- 世界地図 593px + 冒険の道 約1,900px で、同じ20地域を**2回**描いている（世界地図＝俯瞰、道＝詳細）。
- 先生は画面内で 32px と 24px の丸アイコンでしか登場しない。相棒も24px。「キャラが地図にいる」感は現状ほぼ無い。
- 未使用ラスター: `yuto-sensei-wave.webp`、`public/shoko-avatar*.png`（6枚・計1.2MB）。
- LP（暖色テラコッタ/深緑/アイボリー）と学習画面（青/琥珀/白）で配色系統が分かれている。地図画像をどちらに寄せるかは要CEO判断（§5-2の分け方が折衷案）。

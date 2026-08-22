# 冒険の世界地図 デザインブリーフ（ChatGPT 画像生成用）

版: **MB-v1**（2026-08-22）／ 対象: Adventure V2「冒険の世界地図」（`src/components/ai-course/adventure/AdvWorldMap.tsx` 一式）
作成: Claude（調査・ブリーフ担当）／ 生成: ChatGPT（CEO の Plus アカウント）／ 検品・組み込み: Claude

> **前提（CEO 決定 2026-08-19）**: マップ背景・建物・ノード・キャラの画像は **Claude が作らない**。ChatGPT の画像生成が担当し、Claude は調査・ブリーフ・検品・組み込みだけを行う。
> **この文書には画像は 1 枚も含まれない。** 根拠はすべて `docs/ai-course/design/before/`（調査記録・合成テストデータ・個人情報なし）。
> 実在の有料生徒が使う本番 UI（日本語・中国語）に載る前提で書いている。**画像に文字を入れない**のはそのため（翻訳できない）。

---

## 目次

0. このブリーフの使い方（3 分で分かる版）
1. 何のための画像か（用途・システム上の位置・世界の並び）
2. 共通デザイン仕様（画風／視点／光／線／色／季節／人物／密度／接続／キャラ統一／禁止）
3. 座標系・必要サイズ・縦横比・透過・トリミング・セーフエリア
4. 生成順プロンプト集（①〜⑧、英語プロンプト＋日本語の意図）
5. 検品チェックリスト
6. 納品・組み込み（ファイル名・WebP・マニフェスト・承認フロー）
7. Phase 2（この次に作るもの）
付録 A. 根拠ファイル／ 付録 B. 用語

---

## 0. このブリーフの使い方（3 分で分かる版）

| 誰が | 何をする |
|---|---|
| **CEO** | §4 のプロンプトを**番号順に**ChatGPT へ貼る（1 つのチャットで通す）。①で方向性 A/B を選ぶ。出来た画像を `~/Downloads/minamo-map-v1/` に保存して Claude に渡す |
| **ChatGPT** | 画像を生成する。文字・ロゴ・UI・人物を描かない（各プロンプト末尾の NEGATIVE で固定） |
| **Claude** | §5 で検品（サイズ・比率・透過・偽文字・セーフエリア・色）→ §6 の手順で WebP 化（`scripts/ai-course/optimize-map-images.mjs`）→ `advWorldMapAssets.ts` に登録 → staging に置く。CEO は `/ja/ai-course?map=image` で新旧を切り替えて確認（`?map=svg` で戻る。既定は旧 SVG のまま。手順は `INTEGRATION.md`） |

**生成の順番（厳守）**: ①基礎背景（A/B の 2 案 → CEO が 1 案を採用）→ ②地域・建物の画風（スタイルシート → 8 タイル）→ ③現在地マーカー → ④今日のおすすめ → ⑤完了 → ⑥ロック・霧 → ⑦キャラ案内 → ⑧補助背景。
**②以降は、採用した①の画像を必ず添付して「この背景と同じ画風で」と指示する**（画風の揺れを防ぐ唯一の方法）。

**CEO が決めること（2 点だけ）**
1. 方向性 **A（絵本調の水彩・アイボリーの朝）** か **B（澄んだ初夏のクリーンフラット）** か（§4-①）
2. 現在地マーカーを **旅人の後ろ姿（3a）** にするか **青い旗（3b）** にするか（§4-③）

**必ず守る 4 つ**（全素材共通）
- 画像の中に**文字・数字・看板の文字・ロゴ・UI（ボタン・錠・星・旗・ピン・進捗）を入れない**。地名や状態はアプリが HTML で描く
- **同じ視点・同じ光・同じ季節**（§2-2〜2-6）。別々に作った素材を 1 枚に合成するため
- **道は画像に描かない**（アプリが実データで描く）。道が通る「回廊」は平らな地面にしておく（§3-6）
- 人間の承認前に本番に出さない（`VisualAsset` の状態モデル。§6-4）

---

## 1. 何のための画像か

### 1-1. 画像が使われる場所（現状はすべてコード内 SVG。これを画像に置き換える）

| 用途 | コンポーネント | 論理サイズ | 実表示サイズ（375px 幅／768px 以上） | 置き換える素材（§3-2 の #） |
|---|---|---|---|---|
| 世界地図の背景（地形・空・湾・川） | `AdvWorldMapScenery.WorldScenery` | viewBox 360×600 | 343×572px ／ 544×907px | #1 背景 |
| 固定ランドマーク 8 街 | 同 `WorldScenery` 内の固定図形 | 各 20〜120 論理 px | 幅 0.07〜0.34 × 地図幅 | #2 ランドマークタイル |
| ノードの台座（17 種 × 4 状態） | 同 `MiniLandmark` の足元ブロブ | 24×24 | 44px ボタンの中央 24〜32px | #3 台座 4 状態（中のミニ絵は当面 SVG のまま） |
| 現在地の印 | `AdvWorldMap` の HTML バッジ（青旗）＋ping | 18px | 18〜44px | #4 現在地マーカー |
| 次の目的地の印 | 同（金の ∨ ピン、跳ねる） | 18px | 18〜24px | #5 おすすめピン |
| 攻略済みの印／全攻略の金星 | 同（金★バッジ／頂上の旗） | 18px／24px | 18〜24px | #6 完了スタンプ・金星（任意） |
| 雲海（目標より先を覆う） | `AdvWorldMapScenery.CloudSea` | 幅 360 × 高さ可変 | 地図幅いっぱい × 最大 70% 高 | #7 雲海帯 |
| 霧パフ（未解放ノードの上） | 同 `MiniLandmark` の霧 3 楕円 | 46×20 | 約 44×19px | #8 霧パフ |
| 漂う雲（雲海の上の装飾） | 同 `CloudSea` の雲パフ（CSS で流す） | 40〜60 px | 約 40〜60px | #9 漂う雲 |
| 雲海タップの吹き出しに添える案内役 | （現行なし・新設） | — | 吹き出し左 48〜64px | #10 キャラ案内（翔子／悠斗） |

世界地図以外（地域カードの風景 `LandmarkScene`、バッジ棚、セレモニー、ヒーロー帯）は **Phase 2**（§7）。

### 1-2. 「学習の進行が視覚的に分かる」のはコードの仕事。画像は**状態中立**

| 進行の表現 | 誰が描くか | 画像側の条件 |
|---|---|---|
| 道の色（攻略済み＝金 `#F59E0B` 実線／現在＝青 `#60A5FA` 破線／未来＝灰破線） | **コード**（実データ駆動の SVG stroke） | 背景に道を描かない。回廊を平らにし、金・青が 3:1 以上で浮く明度にする |
| ノードの状態（done／current／next／locked） | コード（台座画像を差し替え＋HTML バッジ） | 台座 4 状態（#3）は**色と形の両方**で区別（色覚多様性のため。錠・★・旗の記号は HTML が出す） |
| 目標より先を覆う雲海（N5: 上 70%／N4: 上 51%／N3: 上 26%／N2・会話: なし） | コード（雲海帯 #7 を縦に伸ばす） | 雲海の上端は**真っ白で均一**（上に白い矩形を継ぎ足すため）。下端の 1/3 は 40〜60% 透けて下の地形が分かる |
| 雲海の上のゴースト輪郭（塔・遺跡・ハタラキ街） | コード（ランドマークタイルを白半透明で重ねる方式に変更予定） | タイルの配置アンカー（§3-7）を厳守すれば追加画像は不要 |
| 未解放ノードの霧 | コード（霧パフ #8 を 1〜3 個重ねる） | 白〜`#F1F5F9`。真っ黒・濃灰にしない（世界観: 霧は敵ではなく状態） |
| 旗ラベル（目的地名、ja/zh） | コード（HTML・白 85% 丸ラベル） | §3-5 の旗ラベル帯に細部を置かない |

### 1-3. 世界の並び（既存の世界観を踏襲。下から上へ進む）

舞台は **「ミナモ列島」**（`docs/ai-course/rpg/original-world-bible.md`）。現代日本に近い港町に、霧と光が差している。**駅・住宅街・会社・役所・学校・病院・店が自然につながる 1 つの町**として描く。魔王も勇者もいない。敵は「通じないこと」。

| 正規化 y（上→下） | 地形バンド | 固定ランドマーク（背景には描かず別タイル #2） | 現代日本での姿 | 学習上の役割 |
|---|---|---|---|---|
| 0.00〜0.17 | 空・遠い峰 | **ソラノ塔**（0.70, 0.12） | 丘の上の展望塔 | N2 の目的地（世界の頂） |
| 0.17〜0.42 | 高地（ベージュの台地） | **カタチの遺跡**（0.26, 0.23）／**ハタラキ街**（0.78, 0.35） | 史跡公園（石柱・石碑）／オフィス街＋役所＋病院 | N3 の目的地／仕事・敬語 |
| 0.42〜0.57 | 森（公園の木立） | **ユカリの森**（0.19,0.48）(0.46,0.45)(0.82,0.49) | 公園の木立・ベンチ・遊歩道 | 人間関係・授受 |
| 0.57〜0.78 | 平野（畑・区画・線路・川） | **トオリミチ**（0.75, 0.59）／**イチバ通り**（0.33, 0.61）／**ヒノデ台**（0.69, 0.74） | 駅・線路・踏切／商店街・市場／丘の住宅街＋小学校 | N4 の目的地／買い物／暮らし |
| 0.78〜1.00 | 海岸・湾（角丸矩形の静かな入り江） | **ミナト**（0.31, 0.93） | 港（灯台・フェリーターミナル・桟橋・船） | N5 の目的地＝出発点。会話 12 地域は湾の外周に環状に並ぶ |

（括弧内は足元中心の正規化座標 = (x/360, y/600)。根拠: `before/safe-area.md` §5-1）

---

## 2. 共通デザイン仕様（全素材に適用）

### 2-1. 画風（CEO 指定の翻訳）

- 現代日本を舞台にした**完全オリジナル**の学習アドベンチャーの旅マップ。**見下ろし型**（鳥瞰の旅行案内図）
- **温かい光・柔らかく整理された配色・精密だが情報過多ではない**
- **手描きの温かさを少し残した洗練されたデジタルイラスト**。水彩のにじみ・紙の質感は「少し」。ポップな太線・ドット絵・3D レンダ・写実はしない
- **大人も使える親しみやすさ**。幼児向け・デフォルメ過多・チビキャラにしない
- 地域カードの風景（`LandmarkScene`、彩度高め）より**背景は一段くすませる**（カードの絵が引き立つ彩度差。`AdvWorldMapScenery.tsx` 冒頭の方針）
- 既存方針との整合: 「静かな冒険」（`rpg-visual-direction.md`）＝中〜やや高明度・中〜低彩度・細い均一な線

### 2-2. 視点（全素材で同一。合成するため最重要）

- **俯角約 60° の 3/4 見下ろし**（カメラは画面下＝南側の上空から北を見る）
- **平行投影**（消失点なし）。建物はどれも**正面ファサードと屋根の両方**が見え、ファサードは画面下を向く
- 例外は最上段の空バンド（y 0〜0.17）だけ。ここは遠景の峰と地平線が見える（鳥瞰図の定番構図）
- ランドマークタイル・台座・マーカーも**同じ角度**で描く（台座の楕円は 幅:高さ = 1:0.55）

### 2-3. 光の方向・影

- **初夏の午前 9〜10 時の太陽**。光源は**右上**（画像外、または右上隅 x ≥ 0.92 かつ y ≤ 0.05 の小さな光だけ）
- 影は**左下へ短く**（太陽が高い）。縁は柔らかい。影色は**黒ではなくくすんだ青灰**（例 `#8FA3B8` を 20〜30%）
- 暖かい光 × 涼しい影、が「温かい光」の作り方。画面全体をオレンジにはしない（完了色の琥珀とぶつかる）
- **例外**: ⑦キャラ案内（翔子先生・悠斗先生のバストアップ）は既存 4 ポーズと同じ**正面からの柔らかい光**。地形の光には合わせない
- 現行の太陽 (0.867, 0.077) は **N2 の旗ラベル帯と重なる**ため、右上隅へ逃がす（§3-5）

### 2-4. 線の太さ

- 輪郭線は**細く均一**。背景（納品 1440px 幅）で **1.5〜2.5px**、ランドマークタイル（生成 1024px）で **2〜3px**
- 線の色は**塗りを 20〜30% 暗くした同系色**。純黒の線・太いカートゥーン線は禁止
- 形は**線ではなく面の明度差（L* 差 15 以上）**で読ませる。縮小で線が消えても形が残る設計（語彙イラスト方針と同じ）

### 2-5. 色（HEX）

**メインカラー（背景の基調。面積の 80%）**

| 役割 | HEX | 備考 |
|---|---|---|
| 光・霞・紙 | `#FBF5EC`（lp-ivory） | LP と同じアイボリー。空の地平線側・霞・ハイライトに |
| 空 | `#DFF0FE` → `#F6FBFF` | 上から下へ。飽和した青空にしない |
| 海・湾 | `#8ECBE8` / `#6DB2D8` | 泡・さざ波 `#E6F6FF` |
| 砂浜・遊歩道 | `#F2E2B8` | 湾の外周の帯 |
| 平野 | `#CFE8B0` / `#AED592` | 畑・区画の明暗に 2 色 |
| 森 | `#8CC48B` / `#5F9E6D` | 木立の明暗 |
| 高地 | `#DCCFAE` / `#C3B28C` | 等高線は `#C3B28C` の細線 |
| 遠い峰 | `#A9C1DD` | 空に溶ける程度 |
| 川 | `#7CC3E8` | 道より細く・淡く |

**サブカラー（差し色。面積の 20% 以下、建物・小物に）**

| 役割 | HEX | 備考 |
|---|---|---|
| 主色・屋根・日よけ | `#EE7A56`（lp-coral）／濃 `#D65E3B` | 翔子先生のカーディガン実測 `#B05030`〜`#D06040` と同系 |
| 補色・木陰・縁取り | `#1E5C57`（lp-pine）／淡 `#CFE4DF` | 翔子先生の襟の深緑 実測 `#304830`〜`#486040` と同系 |
| 金・日なた・ハイライト | `#F4BE4C`（lp-gold）／淡 `#FBEAC0` | 「温かい光」はこの色で |
| 壁・生成り | `#FFFDF8` / `#F0E0C0` | 先生のインナー実測 `#F0E0C0` |

**UI 予約色（背景・タイルでは面として使わない。状態表示がこの色で乗るため）**

| 状態 | HEX | 用途 |
|---|---|---|
| 現在地 | `#2563EB`（青）／道 `#60A5FA` | 台座 #3-current・マーカー #4 だけが使う |
| 攻略済み・次の目的地 | `#F59E0B` / `#FBBF24`（琥珀）／グロー `#FDE68A` | 台座 #3-done/next・ピン #5・道 |
| 未解放 | `#B6C2D1` / `#94A3B8`（灰青） | 台座 #3-locked |
| 霧・雲海 | `#F1F5F9` / `#E2E8F0` / `#EEF2F7` | 雲海 #7・霧 #8 |

**明度の帯**: 背景は **L\* 70〜90**（白 85% のラベル・44px ボタンが沈まず、金と青の道が 3:1 以上で浮く）。L\* 55 未満の色面を背景に作らない。道の回廊とセーフエリア内では **44px 四方の明度差を L\* 20 以内**に抑える。

### 2-6. 季節感・時間

- **初夏（5 月下旬〜6 月上旬）・晴れ・午前**。若葉の緑、穏やかな海、洗濯物が乾く空気
- 桜・紅葉・雪・夕焼け・夜は**この一式では使わない**（季節違いはオモイデ庭園の再訪演出として Phase 2 以降）
- 雲は少なく、雲海（#7）と混同しない。背景の空には雲を描かない（右上の光と遠い峰だけ）

### 2-7. 人物・生き物の有無

| 素材 | 人物 | 動物 |
|---|---|---|
| 背景 #1 | **なし** | 遠景のカモメ 2 羽まで可 |
| ランドマークタイル #2 | **なし**（生活の気配は洗濯物・自転車・電車・船・ベンチで出す） | なし |
| 台座・ピン・雲・霧 | なし | なし |
| 現在地マーカー #4 | 3a: **後ろ姿のみ・顔なし・性別を固定しない**（世界観: 主人公は利用者自身）／3b: 人物なし（旗） | なし |
| キャラ案内 #10 | **翔子先生・悠斗先生だけ**（既存キャラ。新キャラを作らない） | なし |

相棒（ナツ＝猫・ハル＝鳥・アキ＝犬）は既存画像があり、地図には乗せない（混同回避）。

### 2-8. 建物の密度

- 背景 #1: **建物ゼロ**。地面の質感（畑の区画・舗装・並木・線路・川・湾・砂浜・等高線）だけ
- ランドマークタイル #2: **主役 1〜2 ＋ 脇役 2〜4**、余白 40% 以上。タイル内の建物数は下表（§4-②）。地図全体で **約 35 棟**
- 目安スケール: **2 階建ての一軒家 ≈ 地図幅の 2.8%**（1440px 背景で 40px）。タイルは表示幅が決まっているので（§3-7）、主役の大きさはタイル幅に対する割合で指定する
- 「精密」は**窓・庇・手すり・植栽の描き込み**で出し、「情報過多」は**要素数**で抑える

### 2-9. 地域同士の接続方法

1. **地形の連続**: 砂 → 草 → 木立 → 岩と台地、の境界をにじませる（境界 y は §3-6 の値を守る）
2. **川**: 高地の右上 (0.86, 0.25) から蛇行して湾 (0.58, 0.78) へ。小さな木橋 2 本
3. **線路**: 平野の右側を横切る薄灰の二重線（トオリミチ＝駅に繋がる）
4. **湾の遊歩道**: 湾の外周（x 0.10〜0.90 × y 0.80〜0.96 の外側 ±0.03）に砂色の帯。会話 12 地域の環状路はこの上にコードが描く
5. **道の回廊**: 背骨 13 点（§3-6）に沿った**幅 8% の平らな地面**。本物の道はコードが描く
6. **タイル側の接続**: 各タイルは**短い小道の切れ端**を持ち、タイルの縁で消える（置いたときに回廊へ繋がって見える）

### 2-10. 既存キャラ（翔子先生・悠斗先生）との統一条件

既存アセット: `public/images/ai-course/shoko-sensei-{base,cheer,teaching,wave}.webp`、`yuto-sensei-{base,teaching,wave}.webp`。

| 条件 | 翔子先生 | 悠斗先生 |
|---|---|---|
| 不変の識別記号 | **黒髪あご〜肩ボブ＋斜め前髪、黒い四角メガネ**、温かいブラウンの瞳、微笑み、頬の赤み | **黒髪ショート、黒い四角メガネ**、温かい笑顔 |
| 衣装（暖色版で確定） | テラコッタのカーディガン（実測 `#B05030`〜`#D06040`）＋**深緑の襟**（`#304830`〜`#486040`）＋生成りのインナー（`#F0E0C0`） | 同じテラコッタのカーディガン＋**深緑のポケットチーフ**（`#283828`）＋白のバンドカラーシャツ（`#E8D8C0`〜`#F8E8D0`） |
| 肌・唇 | `#F0C0A0` 系、唇 `#F08068` | `#F0C090` 系 |
| 画風 | **セミリアル寄りの柔らかいアニメ調**。きれいな線＋繊細なグラデ、清潔感 | 同じ |
| 光 | 正面からの柔らかい光（既存 4 ポーズと同じ） | 同じ |
| 作り方 | **同じチャットで `shoko-sensei-base.webp` を添付し「添付と同一人物」と指定**（7/25 に実績あり） | `yuto-sensei-base.webp` を添付 |
| 枠 | バストアップ・頭頂がタイル上端から 8%・胸下で切る。**2 人とも同じ枠**（差し替え可能に） | 同じ |
| 背景 | 透過（白地で生成 → 切り抜き）。UI 側の丸背景（翔子 `#FBDDCF`／悠斗 sky-100）は画像に含めない | 同じ |

地図素材と先生のあいだの統一は「人物の画風を地形に持ち込む」のではなく、**色温度（暖色の差し色 `#EE7A56`／`#1E5C57`／`#F0E0C0`）・線の細さ・グラデの柔らかさ・太線なし**を共有することで取る。

### 2-11. 入れてはいけない要素（禁止リスト）

| 分類 | 禁止 |
|---|---|
| 文字 | 日本語・中国語・英数字・**偽文字（文字に見える落書き）**。看板・標識・ナンバープレート・ポスター・石碑の文字・時計の数字 |
| 既存 IP | 既存ゲームの模倣（コマンド窓・HP バー・ドット絵・既視感のある地図 UI）、有名キャラ類似、実在ブランドのロゴ・ブランド色の縞（コンビニ等） |
| 実在物 | 東京タワー・スカイツリー・レインボーブリッジ等の実在ランドマーク、富士山のシルエット |
| 過剰な和風記号 | 鳥居・赤提灯・五重塔・侍・忍者・芸者・鯉・だるま・招き猫・寿司・桜吹雪。現代の町として自然に見えるものだけ |
| ファンタジー | 剣・魔法・モンスター・城（西洋城）・ドラゴン・宝箱 |
| 絵の破綻 | どこにも繋がらない道・橋、重なった建物、視点の混在、遠近の不自然、二重の太陽、左右非対称の影 |
| UI の焼き込み | 地名・ボタン・ピン・錠・星・旗・進捗バー・矢印・枠線・ビネット・透かし・角丸 |
| 読みやすさを壊すもの | 暗い色面（L\* < 55）、回廊とセーフエリア内の高コントラスト模様、濃い霧（真っ黒・濃灰） |
| トーン違い | 幼児向け・チビキャラ、写実・3D、夜・雨・雪、赤十字（保護標章）・国旗・宗教シンボル |
| 人物 | 顔のある人物（主人公は後ろ姿のみ／先生は既存キャラのみ） |

### 2-12. 「現代日本」への翻訳表（17 種のノード＋8 街）

ノードの種類（`LandmarkKind` 17 種）は現在ファンタジー寄りの名前だが、絵は**現代日本の場所**として描く。Phase 2 でノード内のミニ絵を画像化するときもこの表を正とする。

| kind | 使われる地域（ja／zh） | 現代日本での姿（絵のモチーフ） |
|---|---|---|
| camp | 基礎キャンプ／基础营地 | 港の公園のテントサイトと焚き火台、ピクニックテーブル |
| bridge | N3 語彙・文法の橋／N3词汇语法之桥、会話 w11 交流の港 | 川にかかる歩道橋・桁橋 |
| village | N3 実践ミッション、会話 w1 自己紹介の村 | 低層の住宅街（一戸建て 3〜4 軒） |
| ruins | N3 文法攻略／N3语法攻略 | 史跡公園の石柱・石碑（文字なし） |
| gate | N2 の門／N2之门 | 役所（区役所）の正面玄関・庇つきゲート |
| tower | N2 語彙・文法／N2词汇语法 | 展望塔 |
| library | N5/N4 の読みもの、読解・会話理解 | 図書館（ガラスのファサード・本棚の影） |
| castle | 達成の確認・模擬ボス（N5/N4/N3/N2） | 試験会場＝大学の講堂（時計塔、数字なし） |
| road | 会話 w2 思い出の道 | 街灯とベンチのある静かな路地 |
| hill | 会話 w3 変化の丘 | 坂道と見晴らし台 |
| avenue | 会話 w4 習慣の並木道 | 並木道と歩道 |
| town | 会話 w5 お願いの街 | 店先の並び（日よけ・品物） |
| plaza | 会話 w6 相談の広場、番外編の会話開始 | 駅前広場の噴水とベンチ |
| mountain | 会話 w7 意見を伝える山 | 山の展望デッキ |
| crossroad | 会話 w8 選択の分かれ道 | 分かれ道と**文字のない**道標 |
| forest | 会話 w9 推測の霧の森 | 霧の遊歩道（木道） |
| city | 会話 w10 仕事と暮らしの町、番外編の実戦 | オフィス街（ガラスのビル） |

8 街（背景タイル #2）の翻訳は §1-3 と §4-②。CEO 指定の**駅／住宅街／会社／役所／学校／病院／店**は、駅＝トオリミチ、住宅街＋学校＝ヒノデ台、会社＋役所＋病院＝ハタラキ街、店＝イチバ通り、に割り当てる。

---

## 3. 座標系・必要サイズ・縦横比・透過・トリミング・セーフエリア

### 3-1. 座標系と表示サイズ

- 地図の論理座標は **viewBox 360×600（縦横比 3:5）**。正規化座標 = (x/360, y/600)。**すべての座標はこの正規化値で扱う**（px は持たない）
- 地図幅 = `min(ビューポート幅 − 32px, 544px)`。375px → **343×572px**、768px 以上 → **544×907px**
- **HTML オーバーレイは固定 px**（ボタン 44px・バッジ 18px・ラベル文字 11px／最大幅 112px）。地図が狭いほど画像に対する占有率が大きいので、**セーフエリアは 375px 幅の値で決める**
- 角丸 16px でクリップ（四隅 0.047 × 0.028 は見えない）
- 組み込み方式（土台は実装済み。`docs/ai-course/design/INTEGRATION.md`）: **背景**は `AdvWorldMapImage` が `<picture>`＋`<img srcset 1x/2x>` を地図枠に敷く（`object-fit: cover`。会話ルートは `object-position: 50% 100%` で下半分。読込失敗は旧 SVG 風景へ自動フォールバック）。**ランドマーク・台座・雲海などは SVG 内の `<image>`** で論理座標に置く（INTEGRATION.md §5）。道・ノード・ボタンの座標は変えない。表示方式は `?map=image` / `?map=svg` で切り替え、既定は `svg`（CEO 確認前に変えない）
- `object-fit: cover` なので、背景の縦横比が 3:5 からずれると中央トリミングされて座標がずれる。**背景は正確に 3:5 で納品する**

### 3-2. 素材一覧（必要サイズ・縦横比・透過）

| # | 素材 | 用途 | **納品サイズ** | 比 | 透過 | 生成時のサイズ（§3-3） | 容量目安（WebP） |
|---|---|---|---|---|---|---|---|
| 1 | **背景**（A/B のうち採用 1 枚） | 世界地図全面 | **1440×2400（@2x）＋ 720×1200（@1x）** | **3:5** | 不要 | 縦長 2:3 → 2 倍 → 中央 3:5 に切る → `optimize-map-images.mjs` が @1x/@2x を作る | @2x ≤ 400KB |
| 2 | **ランドマーク 8 街**（森は 2 種） | 背景の上・雲海の下 | 各 **512×512**（ミナトは 1024×512、ソラノ塔は 512×1024） | 1:1（ミナト 2:1／塔 1:2） | **必要** | 1024×1024 白地 → 切り抜き | 各 ≤ 40KB |
| 3 | **台座 4 状態**（done/current/next/locked） | ボタン中央の足元 | 各 **256×256** | 1:1 | **必要** | 1024×1024 に 2×2 → 分割 | 各 ≤ 10KB |
| 4 | **現在地マーカー**（3a 後ろ姿 or 3b 旗） | current ノードの上 | **256×320** | 4:5 | 必要 | 1024×1024 白地（中央 4:5 に収める） | ≤ 15KB |
| 5 | **おすすめピン**（next） | next ノードの上 | **128×160** | 4:5 | 必要 | #4 と同じシート | ≤ 8KB |
| 6 | 完了スタンプ・頂上の金星（任意） | done／全攻略の旗 | **128×160** | 4:5 | 必要 | 同上 | ≤ 8KB |
| 7 | **雲海帯** | 目標より先を覆う | **1440×480** | 3:1 | **必要**（下端） | 横長 3:2 黒地 → 輝度をアルファに | ≤ 60KB |
| 8 | **霧パフ** | 未解放ノードの上 | **256×128** | 2:1 | 必要 | 黒地シート → 輝度をアルファに | ≤ 6KB |
| 9 | 漂う雲 2 種 | 雲海の上の装飾 | **256×96** | 8:3 | 必要 | 同上 | 各 ≤ 6KB |
| 10 | **キャラ案内**（翔子／悠斗） | 吹き出し左 | **640×640**（表示 320） | 1:1 | **必要** | 1024×1024 白地 → 切り抜き | 各 ≤ 60KB |

1 画面で読まれる合計 ≤ 約 1MB（2x 端末・全素材）。現行の JS 転送 1.41MB より小さく、背景は `loading=lazy`、`AdvShell` は lazy chunk。#2〜#10 は SVG `<image>` で使うため 1 ファイル（srcset なし）。表の納品サイズは 2x 表示でも足りる大きさにしてある（例: ミナト 0.34 × 544px × 2 = 370px ＜ 1024px）。

### 3-3. ChatGPT の出力サイズから必要サイズを作る

ChatGPT 画像生成の出力は **1024×1024／1024×1536（縦）／1536×1024（横）** の 3 種が基本（2026 年 1 月時点の仕様。変わっていれば最も近い縦長・横長を選ぶ）。したがって:

| 必要な形 | 指示する向き | Claude 側の加工（検品後） |
|---|---|---|
| 背景 3:5（1440×2400） | **縦長**（1024×1536 = 2:3） | 2 倍に拡大（2048×3072）→ 中央を 3:5（1843×3072）に切る → 1440×2400 の PNG にする → `node scripts/ai-course/optimize-map-images.mjs <png> --name world-bg --avif` で @2x（1440×2400）／@1x（720×1200）の WebP（＋AVIF）を出す。**左右 5% は切れる前提で構図する** |
| 正方形タイル | 正方形 | 切り抜き → 512 へ縮小 |
| ミナト 2:1 | 横長 3:2 | 上下を切って 2:1 → 1024×512 |
| ソラノ塔 1:2 | 縦長 2:3 | 左右を切って 1:2 → 512×1024 |
| 雲海 3:1 | 横長 3:2 | 帯を切り出し 1536×512 → 1440×480 |
| 4:5 のマーカー類 | 正方形（中央に 4:5 で収める） | 切り抜き → 256×320 |

**透過の作り方**: まず「transparent background」を指定する（効く場合がある）。効かなければ **白地で生成 → U²-Net（onnxruntime）で切り抜き**（翔子先生で使った既存手順）。**雲・霧は切り抜きが効かない**ので **黒地に白で生成し、輝度をアルファに変換**する。

### 3-4. モバイル時のトリミング範囲

| ケース | 実際の表示 | 画像が守ること |
|---|---|---|
| 通常（375〜1440px） | **トリミングなし**。3:5 全体表示（375×812 では高さの 70%。スクロールで全体が見える） | 3:5 で構図が完結していること |
| **会話ルート** | **下半分だけ**（`viewBox 0 300 360 300` = y 0.50〜1.00、6:5） | **下半分だけで絵が成立する**（海岸・湾・港・平野）。旗ラベルは w12 の上 x −0.006〜0.321・y 0.724〜0.780（全体座標） |
| 将来フルスクリーン化した場合（参考・現行では起きない） | 縦スマホ 375×812: 左右 **0.115 ずつ**切れる／iPad 縦: 上下 **0.10 ずつ** | **コア領域 x 0.12〜0.88 × y 0.10〜0.90** に「必ず見せたい要素」を収める（8 街・湾・港は全部この中。塔の先端だけ y ≥ 0.05 に） |
| PC 横長 1440×900 | cover 不可 → 現行どおり 544px 幅で中央固定 | 横長版の背景は**不要** |

### 3-5. UI が重なるセーフエリア（正規化座標。375px 幅＝最悪値）

**固定 px 要素の占有率**

| 要素 | 実 px | 375 幅（343×572） | 768 以上（544×907） |
|---|---|---|---|
| ノードボタン | 44×44 | w 0.128 × h 0.077 | 0.081 × 0.049 |
| 状態バッジ（ボタン右上、2px はみ出す） | 18×18 | 0.052 × 0.032 | 0.033 × 0.020 |
| 現在地リング（ping 拡大時） | ≈72×72 | 0.21 × 0.126 | 0.13 × 0.08 |
| 旗＋目的地ラベル | 最大 112×33 | 0.327 × 0.058 | 0.206 × 0.036 |
| 雲海の吹き出し（タップ時） | 幅＝地図 −24px | x 0.035〜0.965 × y 0.014〜0.158 | x 0.022〜0.978 × y 0.009〜0.08 |

**UI が乗り得る帯（全目標・全ルートの和集合）**

| 帯 | y | UI が乗る x | 画像側の扱い |
|---|---|---|---|
| 空・峰 | 0.00〜0.17 | 0.40〜0.86（N2 の旗・ボス）／吹き出し 0.035〜0.965 | 太陽は **x ≥ 0.92 かつ y ≤ 0.05** の小さな光だけ。文字状の雲・鳥を密に置かない |
| 高地 | 0.17〜0.42 | 0.21〜0.74 | 遺跡 (0.26,0.23)・ハタラキ街 (0.78,0.35) は回廊の外＝OK |
| 森 | 0.42〜0.57 | 0.39〜0.74 | 木立は左端 (0.19,0.48) と右端 (0.82,0.49)。中央 (0.46,0.45) は小さく |
| 平野 | 0.57〜0.78 | 0.15〜0.84 | イチバ (0.33,0.61)・トオリミチ (0.75,0.59)・ヒノデ台 (0.69,0.74) は回廊の隙間 |
| 海岸・湾 | 0.78〜1.00 | 0.04〜0.96（環状路 12 ノード） | 湾の内側 (0.10〜0.90 × 0.80〜0.96) だけ自由。港は **x≈0.31（w10 と w9 のボタンの隙間）と y < 0.905 の帯**に主役を置き、淡く描く |

**旗ラベル帯（細部を置かない）**: N5 (x 0.319〜0.645, y 0.614〜0.672)／N4 (0.395〜0.706, 0.416〜0.476)／N3 (0.404〜0.715, 0.167〜0.227)／N2 (0.536〜0.862, 0.021〜0.078)／会話 (−0.006〜0.321, 0.724〜0.780)。
**ノード矩形の全リスト**（目標別・試験レーン／会話レーン 12 点）は `before/safe-area.md` §2-2・§2-3。

### 3-6. 画像が守る幾何（地形バンド・湾・川・道の回廊）

| 項目 | 値（正規化） | 許容 |
|---|---|---|
| 地形バンド境界 y | **0.17 / 0.42 / 0.57 / 0.78** | ±0.02（コードの `groundBlobColor` がこの境界で足元色を変える） |
| 湾 | 角丸矩形 **x 0.10〜0.90 × y 0.80〜0.96**、角 r = 0.1 | ±0.02。遊歩道は外側 ±0.03 |
| 川 | (0.861, 0.25) → 蛇行 → (0.583, 0.783) | 回廊と交差する y 0.45〜0.72（x 0.58〜0.72）は**道より細く淡く** |
| 道の回廊（平らな地面） | 背骨 13 点 (0.472,0.887) (0.522,0.783) (0.144,0.742) (0.639,0.727) (0.244,0.623) (0.778,0.575) (0.306,0.500) (0.833,0.442) (0.222,0.375) (0.694,0.308) (0.306,0.250) (0.639,0.192) (0.700,0.117) を結ぶ折れ線、**幅 ±0.075（画像幅の 8%）** | 41 点のサンプルは `before/safe-area-layout.json` の `spineSamples` |
| 会話の環状路 | 湾の外周リング x 0.100〜0.900 × y 0.800〜0.960 | 12 ノードが周上等間隔。砂色の遊歩道帯にする |

### 3-7. ランドマークタイルの配置アンカー（足元中心・表示幅）

| 街 | 現代日本での姿 | anchor（足元中心） | 表示幅（地図幅比） | タイル比 | 注意 |
|---|---|---|---|---|---|
| ミナト | 港（灯台・ターミナル・桟橋・船） | **(0.31, 0.93)** | 0.34 | **2:1** | 会話ノード w8〜w11 がこの上に乗る → 淡く・主役は x≈0.31 の列 |
| ヒノデ台 | 丘の住宅街＋小学校 | **(0.69, 0.74)** | 0.15 | 1:1 | 真上 (0.63,0.72) に N3 の bridge ノード |
| トオリミチ | 駅・線路・踏切・バス停 | **(0.75, 0.59)** | 0.12 | 1:1 | N4 の目的地 |
| イチバ通り | 商店街・市場テント | **(0.33, 0.61)** | 0.14 | 1:1 | N2 の village ノード (0.30,0.61) がほぼ同位置＝ノードがこの街の上に立つ |
| ユカリの森 | 公園の木立（A/B 2 種を 3 か所に） | (0.19,0.48) (0.46,0.45) (0.82,0.49) | 各 0.07 | 1:1 | 中央は回廊に近い → 0.05 に縮小 |
| ハタラキ街 | オフィス街＋役所＋病院 | **(0.78, 0.35)** | 0.13 | 1:1 | 雲海のゴースト対象 |
| カタチの遺跡 | 史跡公園（石柱・石碑） | **(0.26, 0.23)** | 0.16 | 1:1 | N3 の目的地。雲海のゴースト対象 |
| ソラノ塔 | 展望塔 | **(0.70, 0.12)** | 0.10 | **1:2** | **塔はタイルの下 60% に収める**（塔頂 y ≥ 0.05）。雲海のゴースト対象 |

---

## 4. 生成順プロンプト集

### 4-0. 共通ブロック（すべてのプロンプトの先頭と末尾に付ける）

**チャットの最初に 1 回だけ貼る（世界の説明）**

```
We are making illustration assets for an original language-learning adventure app. The world is "Minamo Islands": a fictional, present-day Japanese coastal town (station, houses, offices, city hall, school, hospital, shops, harbor) seen as one illustrated travel map. There are no swords, no magic, no monsters, no fantasy castles. Assets are generated separately and composited by code, so every asset must share the same camera, light, season and palette. Images must never contain text of any kind. I will give you a STYLE LOCK and a NEGATIVE block with each request — follow both strictly.
```

**STYLE LOCK（各プロンプトの先頭）**

```
STYLE LOCK — Minamo Islands map. Original illustrated travel map of a fictional present-day Japanese coastal town (not medieval, not sci-fi, not a theme park). Bird's-eye 3/4 top-down view, camera about 60 degrees above the horizon looking north from the south, parallel projection with no vanishing point; every building drawn at the same angle, showing its front facade (facing the bottom of the image) and its roof. Refined digital illustration with a touch of hand-drawn warmth: soft watercolor-like gradients, thin uniform outlines in a darker shade of each fill (never pure black, never thick cartoon lines); shapes read by value contrast, not by lines. Early-summer morning light: sun high at the upper right, short soft shadows toward the lower left, shadow color a muted cool gray-blue, never black. Palette: ivory light #FBF5EC, sea #8ECBE8 / #6DB2D8, sand #F2E2B8, plain green #CFE8B0 / #AED592, forest green #8CC48B / #5F9E6D, highland beige #DCCFAE / #C3B28C, pale sky #DFF0FE; accents terracotta #EE7A56 (roofs, awnings), deep pine green #1E5C57 (tree shadows, trims), warm gold #F4BE4C (sunlit highlights), cream walls #FFFDF8. Do not use saturated cobalt blue or saturated amber as area colors (reserved for UI). Overall bright (no area darker than mid-gray), gently saturated, calm, tidy, adult-friendly, quietly charming — precise but not busy.
```

**NEGATIVE（各プロンプトの末尾）**

```
NEGATIVE — none of the following may appear: any text, letters, numbers, kana, kanji, Chinese or Latin characters, or pseudo-letters / scribbles that look like writing (no written signboards, license plates, posters, carved inscriptions, clock numerals); logos, brand colors or brand stripes; UI elements (buttons, pins, markers, padlocks, stars, flags, progress bars, arrows, frames, borders, vignettes, watermarks); people, faces, or animals unless explicitly requested; swords, magic, monsters, fantasy castles, dragons, treasure chests, pixel art; stereotyped Japan icons (torii gates, red lanterns, pagodas, Mt. Fuji, cherry-blossom storms, samurai, ninja, geisha, koi, daruma, lucky cats); real famous landmarks (Tokyo Tower, Skytree, Rainbow Bridge); red-cross symbols, national flags, religious symbols; photorealism or 3D-render look; thick black outlines; childish or chibi styling; night, sunset, rain or snow; broken geometry (roads or bridges that lead nowhere, impossibly overlapping buildings, mixed camera angles, two suns).
```

**貼り方のコツ（CEO の手間を減らす）**: チャットの最初のメッセージで上の世界の説明＋STYLE LOCK＋NEGATIVE の全文を貼り、「以後のプロンプトで `[STYLE LOCK]` / `[NEGATIVE]` と書いたら、この全文をそのまま適用すること」と伝える。以降は各プロンプトのタグを置き換えずに貼ってよい。**ただし画像生成は直前の指示を優先しがち**なので、画風がぶれたと感じたら全文を貼り直す。

**参照画像として添付してよいもの（個人情報なし）**
- `docs/ai-course/design/before/worldmap-before-N2-combined-1440.png`（現行地図・合成テストデータ。**地理の参照だけ**。「アイコン・バッジ・ラベル・道は無視して完全に描き直す」と必ず添える）
- `public/images/ai-course/shoko-sensei-base.webp`／`yuto-sensei-base.webp`（⑦用）
- ②以降は**採用した①の背景**と**②のスタイルシート**
- **添付禁止**: 管理画面・実生徒の画面・会話ログ・購入情報のスクショ

---

### ① 基礎背景（方向性 A／B の 2 案）

**日本語の意図**: 地形・空・湾・川・砂浜・線路・畑だけの「土台」。建物・港・塔は描かない（別タイルで正確な位置に置くため）。回廊（道が通る帯）を平らにし、下半分だけでも絵として成立させる。A と B は**同じ構図で画風だけ違う**。CEO はどちらか 1 枚を採用し、以降の全素材の画風の基準にする。左右 5% は 3:5 に切るときに失われる前提。
**検品の要点**: バンド境界 y（0.17/0.42/0.57/0.78）、湾の位置、回廊に模様がないか、太陽が右上隅だけか、建物が描かれていないか、文字がないか、明度 L\* 70〜90。
**失敗時**: 建物が混ざる → 「remove all buildings」で再生成。バンドがずれる → 参照画像を添付して「keep the geography of the attached image」。

**プロンプト ①A（絵本調の水彩・アイボリーの朝）**

```
[STYLE LOCK]
Task: paint the full MAP BACKGROUND only — terrain, water and sky. Portrait orientation (2:3). Compose so that the outer 5% of the left and right edges are expendable (the final crop is 3:5). No border, no frame, no vignette; the painting runs to the edges.
Vertical layout, measured from the top edge:
1) 0–17%: pale morning sky fading into ivory haze at the horizon; two soft blue-gray peaks far away at the top-left and top-center; the sun is only a small soft glow tucked into the extreme upper-right corner (inside the top 5%); the rest of the sky stays plain and quiet. Two tiny distant gulls are allowed.
2) 17–42%: a beige highland plateau with faint contour lines, a few pale rock outcrops and small pine clusters near the edges. Leave two flat, empty clearings (for landmarks added later): one at 26% from the left / 23% from the top, one at 78% from the left / 35% from the top.
3) 42–57%: a band of soft green woodland; tree clusters only at the far left and far right, the middle is open meadow with a few single trees.
4) 57–78%: fresh green plains with faint field plots and footpaths. A thin pale-blue river winds from the upper right (86% from the left, 25% from the top) down into the bay (58% from the left, 78% from the top), crossed by two tiny wooden footbridges; a light-gray double line (a railway) runs across the right part of the plain. Leave flat clearings at (33%, 61%), (75%, 59%) and (69%, 74%).
5) 78–100%: a sandy shore and a calm bay shaped like a rounded rectangle spanning 10–90% of the width and 80–96% of the height, with a pale sand promenade all around it, gentle ripples and one or two small moored boats. Leave a flat clearing on the lower-left inner shore at (31%, 93%) for a harbor added later.
Keep a flat, undecorated corridor about 8% of the width wide along this zig-zag path (x%, y%): (47,89) (52,78) (14,74) (64,73) (24,62) (78,58) (31,50) (83,44) (22,38) (69,31) (31,25) (64,19) (70,12). Do NOT draw buildings, houses, towers or harbor structures anywhere — they are separate layers. Do not draw roads. The bottom half alone must also work as a complete picture.
If a reference image is attached, use it only for the geography (positions of bay, river, bands); restyle it completely and ignore its icons, badges, labels and roads.
Direction A look: storybook watercolor — ivory-tinted morning haze, a faint paper grain, softly bleeding edges between bands, gently muted colors, warm and quiet.
[NEGATIVE]
```

**プロンプト ①B（澄んだ初夏のクリーンフラット）** — ①A の本文をそのまま使い、最後の「Direction A look:」の行だけ次に差し替える。

```
Direction B look: clean modern flat illustration — crisp yet soft-edged color fields with subtle gradients, no paper grain, a slightly clearer sky and sea, tidy and bright like a premium travel-app map; thin light contour lines and field plots are the only texture.
```

---

### ② 地域・建物の画風（スタイルシート → 8 街のタイル）

**日本語の意図**: まず「建物の画風見本」を 1 枚作って、視点・線・色・縮尺が背景と合っているかを確認する（ここで画風を固定してから個別タイルへ進む）。次に 8 街を**1 タイルずつ**、白地で生成して切り抜く。各タイルは「主役 1〜2 ＋ 脇役 2〜4」、余白 40%。主役の大きさはタイル幅に対する割合で指示する（表示幅が決まっているため）。
**検品の要点**: 視点が背景と同じか（正面＋屋根、ファサードが下向き）、影が左下か、縮尺（一軒家 ≈ タイル幅の 18%：ヒノデ台基準）、看板・時計に文字がないか、赤十字・ロゴがないか、切り抜き後の縁に白フリンジがないか。
**失敗時**: 角度が違う → 「same camera as the attached background, 60° top-down, parallel projection」を強調。文字が出る → 「all signboards are blank」。

**②-0 スタイルシート（画風の確認用。納品しない）**

```
[STYLE LOCK]
Match the attached approved background exactly in palette, camera angle, line weight and lighting.
Task: a STYLE SHEET of present-day Japanese town buildings for this map, on a plain pure-white background, landscape orientation (3:2). Arrange 12 items in two rows with generous spacing, each isolated, all at the same scale (a two-story detached house is about 1/14 of the image width):
1 a small railway station with a canopy and a blank signboard; 2 a two-car local train, cream with a pine-green stripe; 3 a two-story detached house with a terracotta roof; 4 a four-story apartment block with balconies and a laundry line; 5 an eight-story glass office building; 6 a city hall — a wide civic building with a flat canopy entrance and a flagless pole; 7 a small elementary school with a clock tower (clock face without numerals); 8 a white hospital block with an entrance canopy (no cross symbol); 9 a row of three small shops with striped awnings; 10 a white lighthouse with a terracotta top; 11 a small ferry terminal with a curved roof; 12 a slender white observation tower with a glass ring near the top and a pine-green spire.
Soft contact shadow toward the lower left under each item. Nothing else in the image.
[NEGATIVE]
```

**②-1〜②-9 タイル共通ヘッダ**（各タイルのプロンプト本文の前に付ける）

```
[STYLE LOCK]
Match the attached approved background and the approved style sheet exactly (same camera: 3/4 top-down, parallel projection, facades facing the bottom; same light from the upper right; same line weight and palette).
Output on a plain pure-white background (or a transparent background if you can), with nothing outside the subject except a soft contact shadow toward the lower left. The subject is centered, its base sits at about 88% from the top, and it fills about 85% of the image width. Include one or two short path stubs that fade out before reaching the edge, so the scene can connect to a road drawn later.
```

| # | 街 | 出力の向き | プロンプト本文（ヘッダの後に続ける） |
|---|---|---|---|
| ②-1 | **ミナト（港）** | 横長 3:2 → 2:1 に切る | `MINATO harbor cluster, wide composition. A white lighthouse with a terracotta top stands slightly left of center and is the tallest element; to its right a small ferry terminal with a curved roof; a wooden pier extends to the right with bollards and a coiled rope; one small white-and-pine-green fishing boat is moored at the pier; a few crates, a bench, two potted plants. Keep it pastel and low-contrast (interactive buttons will sit on top of it). Flat base line.` |
| ②-2 | **ヒノデ台（住宅街＋小学校）** | 正方形 | `HINODE-DAI hillside neighborhood: a terraced slope with stone steps; five small detached houses with terracotta and muted-brown roofs and cream walls (a single house is about 18% of the image width); one small elementary school with a clock tower at the back (clock face without numerals); a laundry line with colorful cloth; a tiny playground with a slide; three trees.` |
| ②-3 | **トオリミチ（駅）** | 正方形 | `TOORIMICHI station: a small modern station building with a canopy and a blank signboard; one platform; a two-car cream local train with a pine-green stripe stopped at the platform; a railway crossing with a striped barrier (no writing); a bus-stop pole with a blank round sign; a bicycle rack with three bicycles; two trees.` |
| ②-4 | **イチバ通り（商店街）** | 正方形 | `ICHIBA shopping street: a short row of six small shops with striped awnings (terracotta/cream and pine/cream); a short arcade roof over part of the row; two market tents with crates of vegetables and fruit; potted plants; a bench; a blank-faced vending-machine-like box. No writing anywhere, no logos.` |
| ②-5 | **ユカリの森 A（木立）** | 正方形 | `YUKARI grove, variant A: a cluster of six broadleaf trees of varied heights, a wooden bench, a lamp post, a winding footpath that fades out at the edges. Nothing else.` |
| ②-6 | **ユカリの森 B** | 正方形 | `YUKARI grove, variant B: five trees including two conifers, a small wooden footbridge over a tiny stream, a bench. Nothing else.` |
| ②-7 | **ハタラキ街（オフィス街＋役所＋病院）** | 正方形 | `HATARAKI business district: three mid-rise glass office buildings (six to ten stories, one building is about 25% of the image width) with rooftop equipment; a wide civic city-hall building with a flat canopy entrance and a flagless pole in front; a white hospital block with an entrance canopy (no cross symbol); a small plaza with four trees and a bus shelter.` |
| ②-8 | **カタチの遺跡（史跡公園）** | 正方形 | `KATACHI historic-ruins park: six weathered sandstone pillars of varied heights arranged in an arc; one flat, slightly tilted stone slab with abstract carved grooves and notches that are clearly NOT letters; moss patches; a gravel path; a bench; two pine trees. No torii, no shrine.` |
| ②-9 | **ソラノ塔（展望塔）** | 縦長 2:3 → 1:2 に切る | `SORANO observation tower: a slender white tower with a glass observation ring near the top and a pine-green spire, standing on a small circular plaza with two trees and a low hedge. The tower occupies only the lower 60% of the image height — the upper 40% stays empty white. Nothing else.` |

---

### ③ 現在地マーカー（CEO が 3a／3b を選ぶ）

**日本語の意図**: 「私はいまここ」を 24〜44px で読ませる印。3a は世界観どおりの**主人公の後ろ姿**（顔なし・性別を固定しない）。青 `#2563EB` を帽子とリュックに入れて現在地の色言語を維持する。3b は人物なしの青い旗。足元中心がアンカー。脈動リングは CSS のまま。
**検品の要点**: 32px に縮小してシルエットが読めるか、顔が見えていないか、青がボタンの青と同系か、足元が 92% 位置か。

**3a 旅人の後ろ姿**

```
[STYLE LOCK]
Plain pure-white background (or transparent). A small traveler seen from directly behind, gender-neutral, face not visible: short dark hair under a cobalt-blue (#2563EB) cap, a cobalt-blue backpack, a terracotta scarf, an ivory shirt, standing upright on a tiny patch of ground and looking toward the distance. Bold, simple silhouette that stays readable at 32 pixels; portrait framing 4:5 centered in a square image, feet at about 92% from the top; soft contact shadow toward the lower left. Nothing else.
[NEGATIVE]
```

**3b 青い旗**

```
[STYLE LOCK]
Plain pure-white background (or transparent). A small cobalt-blue (#2563EB) pennant flag on a thin wooden pole with a tiny round base, the flag pointing to the right, a subtle white highlight on the flag; portrait framing 4:5 centered in a square image, base at about 92% from the top; soft contact shadow toward the lower left. Nothing else.
[NEGATIVE]
```

---

### ④ 今日のおすすめ（next ノードのピン）

**日本語の意図**: 「次はここ」を示す金のピン（現行は琥珀の ∨ バッジが跳ねる）。done の金と同じ色族だが**形で区別**（done は台座、next はピン）。18〜24px 表示なので細部は不要、白い星 1 つだけ。
**検品の要点**: 先端が 92% 位置、グローが強すぎないか（背景を汚さない）、文字なし。

```
[STYLE LOCK]
Plain pure-white background (or transparent). A glossy warm-gold map pin (#F4BE4C lit side, #F59E0B shadow side) with a rounded head and a tiny white five-point star on it, a faint soft golden glow behind the head; portrait framing 4:5 centered in a square image, the pin tip at about 92% from the top. Simple, readable at 20 pixels. Nothing else.
[NEGATIVE]
```

---

### ⑤ 完了（done）と ⑥ ロック（locked）— 台座 4 状態を 1 シートで

**日本語の意図**: ノードの足元に敷く「地面の円盤」を 4 状態ぶん、**同じ大きさ・同じ角度**で 1 枚に並べて作る（揃えるため）。done＝金＋グロー、current＝青＋白縁＋外輪、next＝白地に金縁、locked＝灰青でマット＋霧のひと筋。中のミニ絵・錠・★・旗は HTML／SVG が出すので**記号を描かない**。
**検品の要点**: 4 枚が同寸・同角度（楕円 1:0.55）、色が UI 予約色と一致、locked が暗すぎないか（L\* ≥ 70）、分割後 256×256 で中心が揃うか。

```
[STYLE LOCK]
Plain pure-white background (or transparent), square image. A 2×2 grid of four ground discs — flat ellipses seen from the same 60-degree top-down angle, width : height = 1 : 0.55 — generously spaced, identical size, each isolated:
top-left DONE: a warm gold disc (#F59E0B) with a soft radial glow (#FDE68A) and a thin white rim;
top-right CURRENT: a cobalt-blue disc (#2563EB) with a white rim and a second thin blue ring just outside it;
bottom-left NEXT: a white disc with a 2-pixel warm-gold rim and a faint gold glow;
bottom-right LOCKED: a pale gray-blue disc (#B6C2D1), matte, no glow, with one soft wisp of white fog drifting across its top.
No icons, no symbols, no stars, no padlocks, no text.
[NEGATIVE]
```

**⑤-b 頂上の金星（任意）** — 全攻略で旗と入れ替える。

```
[STYLE LOCK]
Plain pure-white background (or transparent). One warm-gold five-point star (#F4BE4C with #F59E0B shading), slightly beveled, with a soft glow, no outline; portrait framing 4:5 centered in a square image. Nothing else.
[NEGATIVE]
```

---

### ⑥ ロック用の霧パフ（黒地で生成 → 輝度をアルファに）

**日本語の意図**: 未解放ノードの上に 1〜3 個重ねる白い霧。雲海と同じ質感。黒地に白で描くと、白さをそのまま透明度にできる（切り抜き不要）。
**検品の要点**: 純白〜灰の階調だけ（青みや灰のハロー禁止）、縁が柔らかい、3 サイズが離れている。

```
Plain black background, landscape orientation (3:2). Three isolated soft white fog puffs, horizontally elongated (about 2:1), fluffy edges that fade out gently, slightly pearly highlights from the upper right, no hard edges, arranged in one row with large gaps: small, medium, large. Pure white to soft gray on black only — no blue tint, no gray halos, no other elements, no text.
```

---

### ⑦ キャラ案内（翔子先生／悠斗先生のバストアップ）

**日本語の意図**: 雲海をタップしたときの吹き出しに添える「案内役」。**既存キャラと同一人物**であることが最優先（画像を添付して「同一人物」指定。7/25 に同じ方法で 4 ポーズを作った実績）。2 人を**同じ枠**で作り、先生選択で差し替える。地形の光ではなく既存ポーズと同じ正面光。
**検品の要点**: 顔・髪・メガネ・衣装の色が既存と一致、枠（頭頂 8%・胸下で切る）が 2 人で揃う、小物・文字なし、切り抜き後の髪の縁が汚れていないか。

**翔子先生**（`shoko-sensei-base.webp` を添付）

```
The same person as the attached illustration — identical face, black chin-to-shoulder bob with side-swept bangs, black rectangular glasses, warm brown eyes, a gentle smile with a hint of blush, a terracotta cardigan with a deep-green trim over an off-white top — in exactly the same semi-realistic soft illustration style and the same soft frontal lighting as the attachment. Bust-up framing: body turned slightly to her right, presenting toward the viewer's right with an open palm like a friendly guide showing the way; top of the head at about 8% from the top edge, cropped just below the chest, centered; plain pure-white background (or transparent); square image. No text, no props, no new accessories, no background objects.
[NEGATIVE]
```

**悠斗先生**（`yuto-sensei-base.webp` を添付）

```
The same person as the attached illustration — identical face, short black hair, black rectangular glasses, warm brown eyes, a bright friendly smile, a terracotta cardigan with a deep-green pocket square over a white band-collar shirt — in exactly the same semi-realistic soft illustration style and the same soft frontal lighting as the attachment. Bust-up framing: body turned slightly to his right, presenting toward the viewer's right with an open palm like a friendly guide showing the way; top of the head at about 8% from the top edge, cropped just below the chest, centered; plain pure-white background (or transparent); square image. No text, no props, no new accessories, no background objects.
[NEGATIVE]
```

---

### ⑧ 補助背景（雲海帯・漂う雲）

**日本語の意図**: 雲海は「目標より先はまだ霧の中」を表す最大の進行表現。N5 目標では画像の 7 割を覆うので、**上端を完全な白で均一**にし（上に白い矩形を継ぎ足す）、**下端の 1/3 は透けて**下の地形が 2〜4 割見えるようにする。現行の「薄い灰の板」に見える問題を、真珠色のハイライトとふわりとした縁で解消する。横にタイル可能にする。
**検品の要点**: 上端 1 行が完全な白で切れ目なし、下 1/3 のアルファが 40〜60%、左右が繋がる、青みなし、雲の上に文字状の模様がない。

**雲海帯**

```
Plain black background, landscape orientation (3:2). A horizontal sea of soft white cumulus clouds filling the upper 65% of the image and becoming completely solid white at the very top edge (the top edge must be a flat, fully opaque white line with no gaps). Along the lower edge, a gently scalloped row of cloud tops with pearly highlights from the upper right; the lowest third of the cloud mass thins into translucent wisps over the black. Seamless left-to-right so it can be tiled horizontally. White and soft gray only — no sky color, no blue tint, no other elements, no text.
```

**漂う雲 2 種**

```
Plain black background, landscape orientation (3:2). Two isolated small fluffy white clouds, wide and flat (about 8:3), soft edges, pearly highlights from the upper right, one slightly larger than the other, a large gap between them. White and soft gray on black only — no blue tint, no other elements, no text.
```

---

## 5. 検品チェックリスト（画像が届いたら Claude が実施）

### 5-1. 全素材共通

- [ ] 指定の縦横比・納品サイズ（§3-2）に加工できる。透過が必要な素材はアルファを持ち、縁に白フリンジ・黒ハローがない
- [ ] **文字・偽文字ゼロ**。拡大して看板・標識・石碑・ビルの窓・時計・ナンバープレートを確認
- [ ] **UI の焼き込みゼロ**（ピン・錠・星・旗・進捗・枠・ビネット・透かし）
- [ ] 人物・動物が指定外に入っていない。顔のある人物がいない（⑦以外）
- [ ] 禁止モチーフ（§2-11）がない。実在ランドマーク・ブランド色・赤十字・鳥居類
- [ ] **視点が同一**（60° 見下ろし・平行投影・ファサード下向き）。**光が右上・影が左下**。**季節が初夏の午前**
- [ ] 線が細く均一で、黒の太線がない。形が面の明度差で読める
- [ ] 背景・タイルに UI 予約色（`#2563EB`・`#60A5FA`・`#F59E0B`・`#FBBF24`）が**面として**出ていない
- [ ] 画風が採用した①と揃っている（コンタクトシートで並べて目視。揺れがあれば再生成）

### 5-2. 背景 #1

- [ ] バンド境界 y = 0.17 / 0.42 / 0.57 / 0.78（±0.02）。湾が x 0.10〜0.90 × y 0.80〜0.96 の角丸矩形
- [ ] 建物・港・塔・道が描かれていない。回廊（§3-6）に高コントラストの模様がない
- [ ] 太陽が x ≥ 0.92 かつ y ≤ 0.05。N2 旗ラベル帯 (0.536〜0.862 × 0.021〜0.078) と重ならない
- [ ] 下半分（y 0.5〜1.0）だけ切り出しても絵として成立する
- [ ] 明度 L\* 70〜90。回廊・セーフエリア内の 44px 四方の明度差 L\* 20 以内
- [ ] 375 幅（343px）に縮めて、44px ボタン・18px バッジ・11px ラベルの白地が沈まない。金 `#F59E0B` と青 `#60A5FA` の線が 3:1 以上で浮く
- [ ] 雲海（N5: y < 0.70）で覆っても下の地形が 2〜4 割透けて見分けられる

### 5-3. ランドマークタイル #2

- [ ] 主役が中央、足元が 88%、幅 85%。短い小道の切れ端が縁で消えている
- [ ] 縮尺が揃う（一軒家 ≈ ヒノデ台タイル幅の 18%。§3-7 の表示幅で置いたとき 8 街の建物が同じ大きさに見える）
- [ ] ソラノ塔が下 60% に収まる。ミナトが淡い（会話ノードが上に乗る）
- [ ] 配置アンカーに置いたとき、回廊・旗ラベル帯・隣のタイルと衝突しない（`scripts/ai-course/world-map-render-static.ts` で静的描画 → Playwright で 375/768/1440 を撮って `before/` と並べる）

### 5-4. 台座・マーカー・ピン・星

- [ ] 台座 4 枚が同寸・同角度（楕円 1:0.55）、分割後 256×256 で中心一致。locked の L\* ≥ 70
- [ ] マーカー・ピンの足元／先端が 92%。32px・20px に縮小して読める
- [ ] 3a の顔が見えない・性別を固定していない

### 5-5. 雲・霧

- [ ] 雲海の上端 1 行が完全な白で切れ目なし。下 1/3 のアルファ 40〜60%。左右が繋がる
- [ ] 青み・灰のハローなし。雲の形が文字に見えない

### 5-6. キャラ案内

- [ ] 既存 `*-base.webp` と同一人物（髪型・メガネ・衣装色 §2-10）。2 人の枠が揃う
- [ ] 小物・文字・背景物なし。切り抜き後の髪の縁がきれい

---

## 6. 納品・組み込み

### 6-1. 置き場所とファイル名（`INTEGRATION.md` の規約に合わせる。版はファイル名ではなくマニフェストと provenance で持つ）

```
public/ai-course/map/
  world-bg@1x.webp  world-bg@2x.webp   # 720×1200 / 1440×2400（採用した A/B。任意で同名 .avif）
  lm-minato.webp                        # 1024×512
  lm-hinode.webp  lm-toorimichi.webp  lm-ichiba.webp
  lm-yukari-a.webp  lm-yukari-b.webp
  lm-hataraki.webp  lm-katachi.webp
  lm-sorano.webp                        # 512×1024
  node-done.webp  node-current.webp  node-next.webp  node-locked.webp   # 256×256
  marker-current.webp                   # 256×320（3a or 3b）
  pin-next.webp                         # 128×160
  star-summit.webp                      # 128×160（任意）
  cloud-sea.webp                        # 1440×480
  fog-puff.webp                         # 256×128
  cloud-drift-a.webp  cloud-drift-b.webp   # 256×96
  guide-shoko.webp  guide-yuto.webp        # 640×640
```

- 背景だけ @1x/@2x のペア（`<img srcset>` 用）。それ以外は SVG `<image>` で使うので 1 ファイル
- 変換は `scripts/ai-course/optimize-map-images.mjs`（PNG → WebP。背景: `--name world-bg --avif`／透過素材: `--ratio any`）。WebP 品質 80〜85、透過はロスレスアルファ。容量目安は §3-2
- 原本（PNG）・プロンプト版（`MB-v1`）・生成日・採用した方向性（A/B）を `docs/ai-course/design/provenance.md` に記録する（次工程で作成）
- 差し替えは同名で上書き → デプロイ。戻すときはファイルを消して再デプロイすれば 404 で全員が旧 SVG に自動で戻る（INTEGRATION.md §4）

### 6-2. マニフェスト（正規化座標で持つ。px は持たない）

既存の `src/lib/aiLesson/course/adventure/advWorldMapAssets.ts`（背景 `WORLD_MAP_BG` が既にある）へ、2 枚目以降を次の形で**追記**する（INTEGRATION.md §5 の `{ src, anchor:[nx,ny], w }` に `aspect`・`ghost`・`flipX` を足したもの）。

```ts
// advWorldMapAssets.ts に追記する形（値は本ブリーフ §3-7 と同じ。次工程で実装）
export const WORLD_MAP_ASSET_VERSION = 'MB-v1';
export const WORLD_MAP_LANDMARKS = [
  { id: 'minato',     src: '/ai-course/map/lm-minato.webp',     anchor: [0.31, 0.93], w: 0.34, aspect: 2 },
  { id: 'hinode',     src: '/ai-course/map/lm-hinode.webp',     anchor: [0.69, 0.74], w: 0.15, aspect: 1 },
  { id: 'toorimichi', src: '/ai-course/map/lm-toorimichi.webp', anchor: [0.75, 0.59], w: 0.12, aspect: 1 },
  { id: 'ichiba',     src: '/ai-course/map/lm-ichiba.webp',     anchor: [0.33, 0.61], w: 0.14, aspect: 1 },
  { id: 'yukari-1',   src: '/ai-course/map/lm-yukari-a.webp',   anchor: [0.19, 0.48], w: 0.07, aspect: 1 },
  { id: 'yukari-2',   src: '/ai-course/map/lm-yukari-b.webp',   anchor: [0.46, 0.45], w: 0.05, aspect: 1 },
  { id: 'yukari-3',   src: '/ai-course/map/lm-yukari-a.webp',   anchor: [0.82, 0.49], w: 0.07, aspect: 1, flipX: true },
  { id: 'hataraki',   src: '/ai-course/map/lm-hataraki.webp',   anchor: [0.78, 0.35], w: 0.13, aspect: 1, ghost: true },
  { id: 'katachi',    src: '/ai-course/map/lm-katachi.webp',    anchor: [0.26, 0.23], w: 0.16, aspect: 1, ghost: true },
  { id: 'sorano',     src: '/ai-course/map/lm-sorano.webp',     anchor: [0.70, 0.12], w: 0.10, aspect: 0.5, ghost: true },
] as const;
export const WORLD_MAP_NODE_PADS = { done: 'node-done.webp', current: 'node-current.webp', next: 'node-next.webp', locked: 'node-locked.webp' };
export const WORLD_MAP_MARKERS   = { current: 'marker-current.webp', next: 'pin-next.webp', summit: 'star-summit.webp' };
export const WORLD_MAP_CLOUDS    = { sea: 'cloud-sea.webp', seaH: 0.2, puff: 'fog-puff.webp', drift: ['cloud-drift-a.webp', 'cloud-drift-b.webp'] };
export const WORLD_MAP_GUIDE     = { shoko: 'guide-shoko.webp', yuto: 'guide-yuto.webp' };
```

`anchor` は足元中心、`w` は地図幅比、`aspect` は幅/高さ。論理座標への変換は `x = nx*360, y = ny*600`、高さは `w*360/aspect`。`ghost: true` のタイルは雲海の上に白半透明で重ねる（現行のゴースト輪郭 SVG を置き換える）。

### 6-3. 組み込み手順と修正候補

組み込みの実手順（背景 1 枚目の置き方・staging 確認・既定の切替・ロールバック）は **`docs/ai-course/design/INTEGRATION.md`** §1〜§4 が正。2 枚目以降（ランドマーク・台座・雲海）は同 §5。画像とは別の修正候補（`before/safe-area.md` §4-3）:

1. 会話ルートの旗ラベル左端 2px 見切れ → `flagX` の下限 56 → 60
2. N2 の旗ラベルと太陽の重なり → 画像側で太陽を右上隅へ（本ブリーフで対応済み）
3. `groundBlobColor(y)` のバンド境界は画像が §3-6 を守れば変更不要
4. `CloudSea` のゴースト輪郭 → タイル画像の白半透明重ねに置換

### 6-4. 承認フロー・権利・個人情報

- 全素材は `VisualAsset` の状態モデル **imported_draft → human_review_candidate → approved** に従う。**人間（CEO）承認前に approved にしない**（`illustration-policy.md`）
- コンタクトシート（全素材を 1 枚に並べた静的 HTML）で画風の揺れを一度に確認する（`render-growth-map-sheet.tsx` と同じ流儀。`window.matchMedia` 未定義で現在失敗する件は別途修正）
- 権利: すべて新規生成。既存作品の意匠・キャラ・ロゴを参照しない。ChatGPT の出力の権利は利用規約上 利用者に帰属する（2026 年 1 月時点の理解。最新規約を確認）
- 個人情報: 参照画像はテストデータの地図と既存キャラ画像のみ。管理画面・実生徒の画面は添付しない
- staging（`staging.badminton-platform.pages.dev`）で CEO 確認 → 本番。**本番直接デプロイ禁止**

---

## 7. Phase 2（この次に作るもの。今回は作らない）

| 素材 | 用途 | サイズ | 備考 |
|---|---|---|---|
| ノード内ミニ絵 17 種 | `MiniLandmark` の中身（24px） | 各 96×96 透過 | §2-12 の翻訳表で 1 種ずつ生成。状態色は台座で出すので絵は 1 版でよい |
| 地域カードの風景 17 種 | `LandmarkScene`（160×110 slice、見えるのは中央の横長帯 ≈ 160×49〜57） | 各 800×550（16:11） | 主役は中央・地面線 y=82/110 基準。8 色調は当面 CSS フィルタか 1 色調のみ |
| ヒーロー帯の背景 | 現在地の風景（暗幕＋白文字） | 同上を流用 | 文字が乗るので上 40% を平坦に |
| セレモニー背景 | `AdvCelebrationOverlay`（放射 amber） | 1024×1024 透過 | 金の紙吹雪・光の筋。文字なし |
| 季節差分（桜・紅葉・雪） | オモイデ庭園の再訪演出 | 背景の差分レイヤー | 世界観「同じ場所も季節で違う顔」。和風記号にならない範囲で |
| 相棒の地図用ポーズ | 現在地の「私」の横に立つ 24px | 各 256×256 透過 | 既存 `companions/*.webp`（絵本調・スカーフと鞄）と同一人物指定 |

---

## 付録 A. 根拠ファイル

| ファイル | 何の根拠か |
|---|---|
| `docs/ai-course/design/before/inventory.md` | 構成要素・画像素材・状態表現・クリック領域・ブランド配色・ja/zh 文字量 |
| `docs/ai-course/design/before/safe-area.md`（＋ `safe-area-layout.json`・`safe-area-dom-measure.json`） | 座標系・セーフエリア・バンド境界・回廊・ランドマークアンカー・素材一覧 |
| `docs/ai-course/design/before/assets-loaded.md` | 現行のアセット読込（画像リクエスト 0 本・JS 1.41MB）→ 容量予算 |
| `docs/ai-course/design/before/worldmap-before-*.png`・`screenshots/` | 現行の見た目（合成テストデータ・個人情報なし） |
| `docs/ai-course/rpg/original-world-bible.md` | ミナモ列島・10 エリア・世界のルール・禁止事項 |
| `docs/ai-course/rpg/rpg-visual-direction.md` | 「静かな冒険」・明度/彩度/線・エリア別モチーフ・霧の表現 |
| `docs/ai-course/illustration-policy.md` | 承認フロー・文字を描かない・既存 IP 不使用 |
| `docs/ai-course/adventure-v2/growth-map-visual-overhaul-report.md` | 「小さく描くと差が消える」「霧が濃いと白い板になる」の教訓 |
| `src/components/ai-course/adventure/AdvWorldMapScenery.tsx`（`WORLD_PALETTE`） | 現行パレット HEX・バンド境界・世界の縦積み |
| `src/lib/aiLesson/course/adventure/advMapModel.ts` | `LandmarkKind` 17 種・`MapTone` 8 種・stage/会話との対応 |
| `src/lib/aiLesson/course/adventure/advRoute.ts`（`DESTINATION`） | 目的地 4 街（N5 ミナト／N4 トオリミチ／N3 遺跡／N2 塔） |
| `public/images/ai-course/shoko-sensei-base.webp`・`yuto-sensei-base.webp`・`companions/*.webp` | 既存キャラの色（本ブリーフの HEX は画像から実測） |
| メモリ `project_shoko-sensei-character.md` | 翔子先生・悠斗先生の確定仕様と生成手順（同一チャット・同一人物指定・U²-Net 切り抜き） |

## 付録 B. 用語

- **正規化座標**: 地図の viewBox 360×600 を (0〜1, 0〜1) にしたもの。画像の幅・高さに対する割合と同じ
- **回廊**: 道（SVG stroke）が通る帯。画像側は平らな地面にしておく
- **アンカー**: ランドマークタイルの足元中心を置く正規化座標
- **雲海**: 目標レベルより先の地域を覆う白い雲。コードが高さを決める
- **台座**: ノードボタンの中央に敷く楕円の地面。状態（done/current/next/locked）ごとに 1 枚
- **STYLE LOCK／NEGATIVE**: 全プロンプトに付ける共通文。画風の固定と禁止事項
- **MB-v1**: このブリーフの版。素材名・マニフェスト・provenance に記録する

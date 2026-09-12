# Adventure V2「冒険の世界地図」改善のための引き継ぎ資料

> **対象は `src/components/ai-course/adventure/AdvAdventureMap.tsx` の画面。**
> 同じリポジトリに「ミナモ列島マップ」（`src/components/ai-course/rpg/IslandsMap.tsx`）という
> **別系統の地図**があるが、**そちらは対象ではない**（本番の実在学習者0人）。
> 2つの見分け方は下の「最初に読む」を参照。

版: 2026-09-12 ／ 作成: Claude（調査のみ・コード変更なし）／ 宛先: Codex / Astra
対象リポジトリ: `~/badminton-sales`（ブランチ `ux-audit/quick-wins-2026-09-09`・commit `732d885b`）

**この資料は実際のコード・本番DB・本番URLを確認して書いた。** 推測は「推測」と明記し、
確認できなかったものは「不明」と書いた。

---

## ⚠️ 最初に読む：地図は2つある。改善するのは片方だけ

この製品には**別系統の「地図」が2つ**あり、名前が混ざっている。

| | ① Adventure V2「冒険の世界地図」 | ② RPG「ミナモ列島マップ」 |
|---|---|---|
| 入口 | `AdvShell` → `AdvAdventureMap` | `WorldHomeShell` → `IslandsMap` |
| データ | `advMapModel.buildAdventureMap()` | `rpg/worldAtlas.WORLD_AREAS` |
| 絵 | `public/ai-course/map/`（ChatGPT生成の水彩画像36枚） | コード内SVG＋`pixelAssets.tsx` |
| 出る条件 | `learner.settings.adventureV2.enabled === true` | 上記が false のとき |
| **本番の実在学習者** | **11人／11人（全員）** | **0人** |

本番DBを読んで確認した（2026-09-12・読み取りのみ）:

```
learners=11  v2_enabled=11  has_mastery=11   （is_test=false のみ）
```

**→ 改善対象は① Adventure V2 の地図。** ②（`IslandsMap` / `WorldHomeShell` / `worldAtlas`）は
**現在どの実在学習者にも表示されていない。**

ただし混乱しやすい点が1つある: **世界の地名（ミナモ列島の10エリア）は①も②も共有している。**
`worldAtlas.ts` の `areaId`（`area01-minato` 〜 `area10-omoide`）を、V2側の
`advRoute.DESTINATION` と `advHomeAssets.HERO_ID_BY_AREA` がそのまま参照している。
**だから `worldAtlas.ts` の areaId を消す・改名するとV2の絵が壊れる。**（→ §9）

---

## 1. 対象URLとユーザー導線

### 1-1. URL一覧（2026-09-12 に HTTP 応答を実測）

| 用途 | URL | 実測 | ログイン |
|---|---|---|---|
| 本番サイト（バドミントン。AIコースとは別事業） | `https://kawabado.com/` | — | 不要 |
| **AIコース 販売LP** | `https://kawabado.com/zh/ai-course` | 200 | 不要 |
| 同・日本語 | `https://kawabado.com/ja/ai-course` | 200 | 不要 |
| **学習者ログイン** | `https://study.kawabado.com/zh/ai-course/login` | 200 | — |
| **学習アプリ本体**（＝ログイン済みで `/ai-course` を開くと出る） | `https://study.kawabado.com/zh/ai-course` | — | **必要** |
| 個人専用URL（踏むだけでログイン） | `https://study.kawabado.com/zh/learn/<12桁コード>` | — | これ自体がログイン |
| ステージング | `https://staging.badminton-platform.pages.dev/zh/ai-course` | 200 | LPは不要／アプリは必要 |
| 地図の背景画像（直接） | `https://kawabado.com/ai-course/map/world-bg@2x.webp` | 200 image/webp | 不要 |

`study.kawabado.com` は本番向きのプロキシで、実体は同じ Cloudflare Pages プロジェクト
（`badminton-platform`）。生徒へ配るURLはこちら。

### 1-2. ルーティング（`src/App.tsx`）

`/:lang/*` の下に生える（`lang` は `ja` | `zh`）。

| パス | 要素 | 備考 |
|---|---|---|
| `ai-course` | `<AiCourseEntry />` | **未認証＝販売LP／認証済＝学習アプリ** の振り分け（App.tsx:64, 190） |
| `ai-course/login` | `<AiCourseEntry forceApp />` | LPと分離した受講者ログイン（192） |
| `learn/:code` | `<LearnCodePage />` | 個人専用URL（189） |
| `invite` | `<InviteLandingPage />` | 招待リンク着地（192の1つ上） |
| `ai-course/admin` | `<AiCourseAdminPage />` | 管理画面 |
| `ai-course/{terms,privacy,...}` | `<LegalPage />` | 法務8ページ。**catch-all より前**に置く必要がある |
| `ai-course/*` | `<AiCourseCatchAll />` | 不明URLはコース入口へ戻す |
| `/learn/:id`（lang無し） | `zh/learn` へリダイレクト | 中国語話者が主なので zh 固定 |

### 1-3. 実際の導線

```
https://kawabado.com/zh/ai-course           販売LP（未ログイン）
  └ ログイン導線 →  /zh/ai-course/login      メール+6桁OTP / 学習コード / ID+PW の3方式
        └ ログイン成功 → /zh/ai-course       学習アプリ（AiCoursePage）
              ├─ ナビ「今日の冒険」          AdvShell view='home'  ← 既定
              ├─ ナビ「冒険マップ」          AdvShell view='map'   ★ 改善対象
              │     ├ ヒーロー帯（現在の章・地域・Lv）
              │     ├ 「今日の一歩」Primary CTA
              │     ├ 冒険の世界地図（画像）  ← ノードをタップ
              │     ├ 攻略バッジの間
              │     └ 地域カード（各カードに必ずCTA）
              │           ├ 「今日の冒険へもどる」  → view='home'
              │           ├ 「間違えた問題の解き直し」→ view='battle'
              │           ├ 「AI会話を始める」      → 親のAI会話step
              │           └ 「ミニ模試を受ける」    → openMock
              └─ ナビ「設定」
```

### 1-4. ログインが必要な範囲

| | 未ログイン | ログイン後 |
|---|---|---|
| 販売LP（価格・先生紹介・実画面スクショ） | ✅ 見える | 見えない（アプリに切り替わる） |
| 法務8ページ | ✅ 見える | ✅ 見える |
| **冒険マップ** | ❌ 一切見えない | ✅ |
| 学習コンテンツ（語彙・文法・読解・模試） | ❌ | ✅ |
| AI会話 | ❌ | ✅（プラン枠あり） |

**冒険マップにURLは無い。** `AdvShell` 内部の `useState<View>` で切り替わるだけで、
クエリパラメータもハッシュも無い（`AdvShell.tsx:212, 450` / `AiCoursePage.tsx:1225`）。
**→ 地図へ直接リンクすることはできない。必ずログイン→ナビタップの2手が要る。**

### 1-5. QA用アカウント

**この資料の作成者（Claude）は地図の実画面をブラウザで見ていない。** 認証情報の入力ができないため。
代わりに、LPに貼ってある**実アカウントから撮った本物のスクリーンショット**
（`public/images/ai-course/screens/map-{ja,zh}@{1x,2x}.webp`）で画面を確認した。§3-8 はこれに基づく。

Codex / Astra が実画面を見るには、次のどれかが要る（**CEOに依頼すること**）:

| 方法 | 必要なもの |
|---|---|
| A. 学習コードの個人URL | `node scripts/ai-course/issue-alumni-code.mjs --count 1 --confirm` をCEOが実行 → `/zh/learn/CODE` を受け取る。**メール不要・パスワード不要**。いちばん速い |
| B. 既存の検証アカウント | `n5copy` 等のID+パスワード。CEOが保持 |
| C. ローカル開発 | `npm run dev` + 本番Supabaseへの接続。結局ログインが要る |

**A を推奨。** 本番DBに検証用の学習者が1人増えるだけで、実在生徒のデータには触れない。

---

## 2. 冒険マップ関連のコード構成

### 2-1. 表示（React コンポーネント）

| ファイル | 行数 | 役割 | 呼び元 | 変更時の注意 |
|---|---|---|---|---|
| `src/components/ai-course/adventure/AdvAdventureMap.tsx` | 803 | **地図画面そのもの。** ヒーロー帯／今日の一歩CTA／世界地図／バッジ／地域カードを縦に積む | `AdvShell.tsx:2539` | **純表示コンポーネント。** supabase も localStorage も import していない（確認済）。状態の再計算をしない設計なので、ここは比較的安全に触れる |
| `AdvWorldMapImage.tsx` | 177 | 画像版の世界地図。背景`<picture>`＋タイル＋マーカー＋台座を敷く。`AdvWorldMapSwitch` をexport | `AdvAdventureMap.tsx:36` | **画像が404/デコード失敗なら自動でSVG版へ落ちる。** この落とし方を壊さないこと |
| `AdvWorldMap.tsx` | 336 | SVG版の世界地図。道・ノード・旗・雲海の**座標系と操作の本体**（画像版もこれを土台にする） | `AdvWorldMapImage.tsx:23` | viewBox 360×600 固定。座標を変えると全タイルのanchorがずれる |
| `AdvWorldMapScenery.tsx` | 435 | 自作SVGの風景（地形・港・森・遺跡・塔・雲海・霧）。**画像版では読み込み完了まで見えるプレースホルダ** | `AdvWorldMap.tsx` | 画像が既定なので通常は一瞬しか見えない。消すと画像404時に真っ白になる |
| `AdvMapLandmarks.tsx` | 575 | 地域カードのシーン絵（`LandmarkScene`）とアイコン（`LandmarkIcon`）。全部自作SVG・17種×8色調 | `AdvAdventureMap.tsx:33`, `AdvMapBadges.tsx` | **ここは画像化されていない。** 地図本体だけ水彩画像で、カードの絵はSVGのまま＝画風が2系統ある（→ §8） |
| `AdvMapBadges.tsx` | 96 | 攻略バッジの間。done地域＝金コイン／未done＝シルエット | `AdvAdventureMap.tsx:34` | 新しい数字を作らない（実測の別ビュー） |
| `CompanionAvatar.tsx` | — | 相棒キャラのアイコン | `AdvAdventureMap.tsx:24` | |
| `AdvShell.tsx` | 4370 | 学習アプリの本体。`view==='map'` のとき上を描く。**地図に渡す全propsをここで計算** | `AiCoursePage.tsx:1768` | **巨大。他セッションが編集していることが多い。触る前に `git status` を必ず見る** |
| `AdvNextRoadCard.tsx` | — | 「次の道」（全攻略後に目標を上げる導線） | `AdvShell.tsx` の `nextRoadSlot` | |

### 2-2. データ・ロジック（TypeScript・純関数）

| ファイル | 行数 | 役割 | 変更時の注意 |
|---|---|---|---|
| `src/lib/aiLesson/course/adventure/advMapModel.ts` | 575 | **地図データの組み立ての中心。** `buildAdventureMap()` が地域配列・現在地・次の目的地を返す。地名／能力名／章名／色調／ランドマーク種別の対応表もここ | **現在地は必ず1つ**という不変条件をここが保証している。`firstOpen < 0`（全攻略）の扱いに過去バグ（先頭地域が「次の目的地」に化ける）があったので、添字計算を触るときは `advMapModel.test.ts` を必ず通す |
| `advWorldSpine.ts` | 285 | 道のジオメトリ（純関数）。試験レーン＝13点のつづら折り `SPINE`、会話レーン＝湾の環状路 `RING`。ベジェを16分割して弧長で点を打つ | **DOM API を使わない**（jsdomに`getTotalLength`が無い）。全ノードペアの最小距離44pxを `advWorldSpine.test.ts` が強制している。座標を動かすとここで落ちる |
| `advWorldMapAssets.ts` | 125 | 画像素材のマニフェスト（パス・実寸・anchor・widthFrac） | **anchor は背景画像の地形に合わせた実測値。** 背景を差し替えたら全タイルを合わせ直す必要がある（ファイル内コメントに明記） |
| `advWorldMapVariant.ts` | 79 | 表示方式（`image` / `svg`）の決定。`?map=image` / `?map=svg` / `?map=reset`、localStorage `adv.worldMap.variant`、既定 **`image`** | DBは触らない。`?map=svg` がいつでも戻れる非常口なので残すこと |
| `advPlanGate.ts` | 58 | プランによる地域ゲート。`gateAdventureMapForPlan(map, limit)` が4地域目以降を locked にする | **お金に直結。** 体験パス(¥600)と無料枠(free-7d)は `contentRegionLimit = 3`。ここを緩めると有料の境界が消える |
| `advHomeAssets.ts` | 128 | ヒーロー帯（`HOME_HEROES`）とstepアイコン。`HERO_ID_BY_AREA` が `worldAtlas` の areaId を参照 | areaIdの綴りに依存 |
| `advRoute.ts` | — | 学習ルート（stage列）。`DESTINATION` が目標レベル→areaId を持つ | 地図の「目的地」表示の出所 |
| `advMastery.ts` | — | 攻略判定の台帳（passPct 71 / requiredDays 3 等） | 攻略済み地域の根拠。触らない |
| `advXp.ts` / `advLevelTitles.ts` | — | Lv.と称号（「Lv.1・見習いの旅人」） | |

### 2-3. 旧系統（ミナモ列島・現在は誰にも表示されていない）

| ファイル | 行数 | 状態 |
|---|---|---|
| `src/components/ai-course/rpg/IslandsMap.tsx` | 243 | `WorldHomeShell` からのみ呼ばれる。**実在学習者0人** |
| `src/components/ai-course/rpg/WorldHomeShell.tsx` | 173 | `AiCoursePage.tsx:1911`（`!isAdvEnabled` のときだけ） |
| `src/components/ai-course/rpg/pixelAssets.tsx` | 340 | ドット絵アセット（V1） |
| `src/lib/aiLesson/course/rpg/worldAtlas.ts` | 215 | **V2も areaId を参照している。消さないこと** |
| `src/lib/aiLesson/course/rpg/{adventureState,chapterRegistry,chapter*Data}.ts` | — | V1の章データ |

### 2-4. スタイル

- **Tailwind CSS v4**（`@tailwindcss/vite` 4.3）。設定ファイルは無く、`src/index.css` の `@import "tailwindcss"` とCSS変数で完結している。`tailwind.config.js` は**存在しない**
- 地図の演出は `src/index.css` の先頭（3〜55行目付近）:
  - `@keyframes kb-fog-drift`（霧・11秒）/ `kb-beacon`（次の目的地・2.6秒）/ `kb-glow-breathe`（9秒）/ `kb-trail-draw`（道を描く・1.5秒）
  - クラス `.kb-map-fog` `.kb-map-beacon` `.kb-map-glow` `.kb-map-trail`、遅延は `--kb-delay`
  - **`prefers-reduced-motion` で全部止める**（意図的。装飾なので止めて困らない）
- ブランドのCSS変数: `--color-kb-navy` `--color-kb-blue` 等（`src/index.css` 59行〜、ライト/ダーク2組）

### 2-5. 状態管理・hooks

- **グローバルな状態管理ライブラリは無い**（Redux / Zustand / Jotai いずれも未導入）
- 地図の画面状態は `AdvShell` の `useState<View>`
- 学習データの本体は `learner.settings.adventureV2`（jsonb 1枚）。`AiCoursePage` が読み、`AdvShell` に渡す
- 保存は `courseRepository.updateLearner({ settings })` → RPC `ai_save_learner_settings`（§5）
- ブラウザ保存: `localStorage`（`adv.worldMap.variant`、学習データのキャッシュ、紹介コード）

### 2-6. Supabase 処理

**`AdvAdventureMap` は Supabase を一切呼ばない。** 呼ぶのは親（`AdvShell` / `AiCoursePage` / `courseRepository`）。

### 2-7. アセット

§6 に一覧。

---

## 3. 現在のマップ仕様

### 3-1. 全体構造（`buildAdventureMap`）

地域リストは**2つのレイヤー**を連結して作る。

| レイヤー | 出所 | 件数 | 攻略計測 |
|---|---|---|---|
| `exam`（試験） | `advRoute` の stage列（診断結果で変わる） | 目標レベル次第（N5で3、N2で8前後） | **あり**（mastery台帳） |
| `conversation`（会話） | 固定12週＋上級6週＝最大18 | 12（既定表示は現在地を含む12地域の窓） | **なし**（測っていない＝`null`のまま） |

ルート種別 `MapRouteKind` は3つ: `combined`（総合・既定）/ `exam` / `conversation`。
`combined` では目的に応じて主レイヤーを先に置き、もう一方を後ろへ連結して `mergeIndex` を持つ。

### 3-2. エリア一覧（世界の地名・10 areaId）

`worldAtlas.ts` が正準。V2の `advRoute.DESTINATION` と `advHomeAssets.HERO_ID_BY_AREA` が同じ綴りを使う。

| areaId | 名前 | 役割 |
|---|---|---|
| `area01-minato` | ミナト（霧の港町） | N5の目的地・出発点 |
| `area02-hinode` | ヒノデ台（暮らしの丘） | |
| `area03-toorimichi` | オウライ街道（交通の道） | N4の目的地 |
| `area04-ichiba` | イチバ通り（買い物市場） | |
| `area05-yukari` | ユカリの森（つながりの森） | N3エリア |
| `area06-hataraki` | ハタラキ街（仕事の街） | |
| `area07-katachi` | カタチの遺跡（文法の遺跡） | N3の目的地 |
| `area08-sorano` | ソラノ塔（ことばの塔） | N2/N1の目的地・世界の頂 |
| `area09-katari` | カタリ港（会話の港） | 会話ルートの目的地 |
| `area10-omoide` | オモイデ庭園（記憶の庭） | 復習 |

**注**: 画像タイルは10個のうち9個（`yukari-a` として1つ）。`toorimichi` はタイル名が
`tile-toorimichi` で、worldAtlas の名前は「オウライ街道」。**名前とファイル名が一致していない**（→ §8）。

### 3-3. 解放条件・未解放の表現

- `RegionState` は `'done' | 'current' | 'next' | 'locked'` の4つ
- **done の判定**: `mastered.has(stage.stageId)`。`mastered` は `AdvShell.tsx:2524` で
  「mastery台帳のtargetID集合 ∪ `deriveMasteredStageIds()` の結果」として作られる
  （※ 台帳のtargetIDだけを渡していた時期にバグがあった。コメントに経緯あり）
- **current**: `regions.findIndex(r => r.state !== 'done')` ＝未攻略の先頭。**必ず1つだけ**
- **next**: current の次
- **locked**: それ以降。加えてプランゲート（`gateAdventureMapForPlan`）が4地域目以降を locked にする
- **未解放の表現**（色だけに頼らない設計）: 霧パフ（`.kb-map-fog`）／枠線の太さ／`Lock` アイコン／
  ラベル／`aria-label` の**5重**
- **会話レイヤーは霧にしない**: 会話は今日から使えるので、今週の地域は `next` のまま CTA を保つ
  （`advMapModel.ts:446`付近。「AI会話は今日できる」という事実と地図を矛盾させないため）

### 3-4. プレイヤー位置・マーカー

- 現在地マーカー: 既定は**青い旗**（`WORLD_MAP_MARKERS.flag` / `marker-flag@{1,2}x.webp`）。
  2026-08-22 CEO決定「男女どちらでも・誰でも主人公に重ねられるため旗」
- **旅人の後ろ姿版（`marker-traveler`）も素材はあるが、コード上どこからも渡されていない**（→ §6 未使用）
- 台座（`ped-done/todo/next/locked`）がノードの足元に敷かれる。**意味はHTML側**（バッジ記号・aria-label）が持ち、
  画像は装飾

### 3-5. クリック/タップ可能箇所

| 要素 | 押すと |
|---|---|
| 地図上のノード（44px） | 親が該当**地域カードへスクロール**する（画面遷移しない） |
| 雲海 | 説明の吹き出し（「目標を上げると道が伸びる」）。地域カードへは飛ばさない |
| バッジ | 該当地域カードが開く |
| 地域カードのCTA | `today` / `review` / `conversation` / `mock` の4種（→ §3-6） |
| 「一覧で見る／地図で見る」 | 地図⇄リストの表示切替（地図が読めない人向け） |
| 「← 今日の冒険へ戻る」 | `view='home'` |

**44px のタップ領域が重ならないことを `advWorldSpine.test.ts` が機械的に強制している**（`MIN_NODE_GAP = 44`）。

### 3-6. エリア遷移と学習コンテンツへの接続

地図内に「エリア画面」は無い。**地域カードのCTAが直接、学習の実行画面へ飛ばす。**

| `RegionActionKind` | 行き先 | 実装（`AdvShell.tsx`） |
|---|---|---|
| `today` | 今日の冒険（ホーム） | `onStartToday` → `setView('home')` |
| `review` | 間違えた問題の解き直しバトル | `onOpenReview` → `setMistakeKeys(reviewKeys)` + `setBattle({...returnTo:'map'})` + `setView('battle')` |
| `conversation` | AI会話 | `onStartConversation` → 親の `props.onStartConversation()` |
| `mock` | ミニ模試 | `onOpenMock` |

**原則15「行き止まりを作らない」**: どの地域も `action` を必ず持つ。使えない行き先
（復習0件・会話未開放）は `AdvAdventureMap` 側で `today` に倒れる（`AdvShell.tsx:2505` のコメント）。

### 3-7. 学習後にマップへ戻る処理

バトル生成時に `returnTo: 'map'` を積む（`AdvShell.tsx:2570`）。終了後にそこへ戻る。
**地図から解き直した場合は `fromStepIdx` を渡さない**＝今日のstepを完了扱いにしない（意図的）。

### 3-8. 実際の画面（本物のスクショで確認）

`public/images/ai-course/screens/map-ja@2x.webp`（実アカウントから撮影・750×1500）で確認した、
上からの実際の並び:

1. `← 今日の冒険へ戻る` ／ 右上に `☰ 一覧で見る`
2. 見出し **「成長マップ」** ＋ 「ことばの霧を晴らしながら、目的地へ進もう」
3. ヒーロー帯（イラスト＋「会話の旅1 話しはじめる」「⚑ 自己紹介の村」「鍛える力：自己紹介と今の生活」、
   右上に「⭐ Lv.1・見習いの旅人」）
4. 「目的地：会話の実戦・カタリ港」＋進捗バー＋**0 / 12 地域**、「次の目的地：思い出の道」
5. **「今日の一歩」カード＋Primary CTA「今日の冒険を始める」**（青の大ボタン）
6. 見出し「冒険の世界地図」→ 水彩の俯瞰マップ画像

**コードの意図（§2-1 のヘッダコメント「Primary CTA は地図より上」）と画面は一致している。**

このスクショは会話ルートの学習者（0/12地域）のもの。試験ルートの見え方は未確認。

### 3-9. スマホとPCの違い

- レスポンシブの分岐は**ごく少ない**。`AdvAdventureMap.tsx` 内の Tailwind 分岐は `sm:` が2箇所だけ
  （ヒーロー帯の高さ `h-24 sm:h-28` / `h-28 sm:h-32`）
- 地図本体は viewBox 360×600 の**縦長 3:5 固定**で、幅に対して拡大縮小する
- 想定実寸（DESIGN_BRIEF §1-1）: 375px幅 → 343×572px ／ 768px以上 → 544×907px
- **PC専用のレイアウト（横並び・大画面活用）は無い。** スマホの縦1カラムをPCでも出している（→ §8）

### 3-10. コードと画面の差

現時点で**明確な食い違いは見つからなかった**。ただし次の2点は「コード上あるが画面で未確認」:

| | 状態 |
|---|---|
| `marker-traveler`（旅人マーカー） | 素材はあるがコードから渡されておらず、**画面には出ない** |
| `ped-*`（4状態の台座画像） | `WORLD_MAP_PEDESTALS` の `heightVb` が全て `0`。描画幅は `PEDESTAL_WIDTH_VB = 26` を使うので動くはずだが、**実際に見えているかは未確認（不明）** |

---

## 4. 学習システムとの接続

### 4-1. 地図が読んでいるもの（入力）

`AdvShell.tsx:2506〜2595` で計算して `AdvAdventureMap` に渡す。

| prop | 出所 | 種類 |
|---|---|---|
| `profile` | `learner.settings.adventureV2` | 読み取り |
| `route` | `advRoute`（診断結果から導出） | 読み取り |
| `mastered` | mastery台帳のtargetID ∪ `deriveMasteredStageIds()` | 読み取り |
| `planRegionLimit` | `planById(accessPlanId).contentRegionLimit` | 読み取り・**課金に直結** |
| `currentWeek` / `conversationEntryWeek` | 会話カリキュラム | 読み取り |
| `quest` / `nextStepTitle*` / `todayDone` | 今日のクエスト | 読み取り |
| `reviewAvailable` | `reviewKeys.length > 0` | 読み取り |
| `conversationAvailable` | 親（利用権・回数枠） | 読み取り |
| `sheetsVisible` / `interviewVisible` | プロファイル | 読み取り |
| `paceNote*` | `computePace()` の推定 | 読み取り |

### 4-2. 地図上の操作が影響する学習状態・DB

**地図そのものは何も書かない。** 書き込みが起きるのは、地図のCTAから遷移した**先**。

| 地図での操作 | 直後 | 最終的にDBに何が起きるか |
|---|---|---|
| ノードをタップ | 地域カードへスクロール | **なし** |
| 一覧⇄地図の切替 | 画面内 state | **なし** |
| `?map=svg` で表示方式を変える | `localStorage` に保存 | **なし**（DBは触らない・設計上明記） |
| 雲海をタップ | 吹き出し | **なし** |
| 「今日の冒険へもどる」 | `view='home'` | **なし** |
| **「間違えた問題の解き直し」** | バトル開始 | バトル終了時に `settings.adventureV2.mastery` / `questLog` / `learningDays` が更新され、`ai_save_learner_settings` で保存 |
| **「AI会話を始める」** | 親のAI会話step | `ai_start_session` RPC で**回数枠を消費**、`ai_learning_sessions` / `ai_usage_daily` / `ai_session_utterances` に書き込み |
| **「ミニ模試を受ける」** | 模試 | `settings.adventureV2.mockLog` を更新 |
| 画面表示・遷移 | — | `ai_log_course_event` / `ai_record_funnel_event`（イベントログ。`AdvAdventureMap` 自身は `track*` を呼んでいない。呼ぶのは親） |

### 4-3. 各機能との関係

| 機能 | 地図との関係 |
|---|---|
| 語彙・文法 | 試験レイヤーの地域＝`advRoute` の stage。攻略判定は mastery台帳 |
| 読解 | stage `reading_listening` に含まれる |
| 会話・AI会話 | 会話レイヤー12〜18地域。**攻略計測なし**（地図上は常に `null`） |
| 音声 | 地図とは無関係（`public/audio/ai-course/*.m4a` は聴解問題の音源） |
| 復習 | 地域カードの `review` CTA →「間違えた問題の解き直し」。`reviewKeys` は親が計算 |
| 学習履歴 | `settings.adventureV2.questLog` / `learningDays` / `mastery` |
| Chapter / Lesson | 地図の「章」は `advMapModel` の `STAGE_CHAPTER` / `conversationChapter()` が生成。V1の `chapterRegistry` とは**別物** |
| 学習進捗 | `doneCount / totalCount`、進捗バー |
| 利用権 | `ai_course_access`。無ければ学習画面に入れない（地図以前の問題） |
| 回数管理 | AI会話のみ。`ai_start_session` がサーバー側で判定 |
| ログイン | `supabase.auth`。3方式（OTP / 学習コード / ID+PW） |
| ユーザー情報 | `ai_learners`（`user_id` 1行）。名前と `settings` |

---

## 5. Supabase / DB

### 5-1. 結論：**地図の改善にDB変更は不要**

地図は `ai_learners.settings`（jsonb）を**読むだけ**で、スキーマにもRPCにも依存を追加しない。
絵・レイアウト・アニメーション・操作性の改善は**すべてフロントだけで完結する。**

新しい「地図の状態」を保存したくなった場合だけ `settings.adventureV2` に**キーを足す**形になるが、
その場合は §9 の保存RPCの保護リストを必ず読むこと。

### 5-2. 関わるテーブル

| 名前 | 用途 | 地図から | RLS | 危険度 |
|---|---|---|---|---|
| `ai_learners` | 学習者1行。`settings` jsonb に `adventureV2` 全部が入る | **読み取りのみ**（書くのは学習の実行画面） | ✅ | **最高。** ここが壊れると全学習履歴が消える |
| `ai_course_access` | 利用権（期間・plan_id） | 読み取り（`planRegionLimit` の元） | ✅ | **高。** 課金の境界 |
| `ai_course_events` | 画面イベントログ | 書き込み（親が） | ✅ | 低 |
| `ai_item_progress` | 旧コースの項目進捗 | 使わない | ✅ | 中（V1資産） |
| `ai_learning_sessions` / `ai_session_utterances` / `ai_usage_daily` | AI会話の記録・原価 | 会話CTAの先で書き込み | ✅ | **高。** お金 |
| `ai_config` | 各種設定（`plan_ai_budgets` 等） | 間接 | — | 高 |

RLSは上記すべてで有効（2026-09-12 に `pg_class.relrowsecurity` を実測）。

### 5-3. 関わるRPC

| 名前 | 用途 | 読/書 | 地図から |
|---|---|---|---|
| `ai_save_learner_settings(p_settings)` | **settings保存の唯一の入口。** 保護キーはDB側の現在値が勝ち、クライアントが知らないキーも温存する | 書 | 間接（学習の実行後） |
| `ai_start_session` | AI会話の開始・**回数枠の判定** | 書 | 会話CTAの先 |
| `ai_log_course_event` / `ai_record_funnel_event` | イベント記録 | 書 | 親が |
| `ai_my_conversation_budget` | 残り回数 | 読 | 親が |
| `ai_record_usage` | 原価記録 | 書 | 会話の先 |

**`ai_save_learner_settings` の保護キー**（最新定義: `supabase/migrations/20260907010000_ai_conversation_off_protection.sql`）:
`adventureV2.answerSheets` / `personalPacks` / `aiConversationOff` / `interviewPrep.enabledAt` / `teacherNotes`。
これらは**先生が発行したもの**で、生徒側の保存で消えてはいけない。

### 5-4. 本番で変更すると危険な箇所

- `ai_learners.settings` の**構造そのもの**（1枚のjsonbに全部入っている。マイグレーション不能な形で書き換えると復旧できない）
- `ai_save_learner_settings` の保護リスト（減らすと先生の発行データが消える）
- `ai_plan_rank` / `plan_ai_budgets`（無料枠が有料を上書きする／タダで会話できる事故の経路）

---

## 6. 既存アセット一覧

### 6-1. 世界地図（`public/ai-course/map/` — 36ファイル・1.2MB）

すべて **WebP**（背景のみ AVIF 併存）。登録先は `advWorldMapAssets.ts`。

| # | ファイル | 1x / 2x | 中身 | 使用箇所 | 備考 |
|---|---|---|---|---|---|
| 背景 | `world-bg@{1,2}x.webp` + `.avif` | 60.6K/186.3K（webp）, 50.9K/158.7K（avif） | 地形・空・湾・川（3:5・非透過） | `WORLD_MAP_BG` | 論理512×768 |
| 港 | `tile-minato@{1,2}x.webp` | 7.3K/20.3K | ミナト（港） | `WORLD_MAP_TILES` | anchor [0.53,0.84] |
| 丘 | `tile-hinode@{1,2}x.webp` | 12.7K/39.2K | ヒノデ台（畑） | 〃 | [0.69,0.80] |
| **駅** | `tile-toorimichi@{1,2}x.webp` | 11.7K/36.2K | トオリミチ（線路の上の駅） | 〃 | [0.84,0.72]。※地名は「オウライ街道」 |
| **商店街** | `tile-ichiba@{1,2}x.webp` | 9.7K/29.6K | イチバ通り | 〃 | [0.20,0.68] |
| 森 | `tile-yukari-a@{1,2}x.webp` | 12.4K/40.6K | ユカリの森A | 〃 | [0.44,0.52] |
| **オフィス** | `tile-hataraki@{1,2}x.webp` | 11.9K/37.0K | ハタラキ街（低コントラスト案を採用） | 〃 | [0.70,0.36] |
| **遺跡** | `tile-katachi@{1,2}x.webp` | 13.7K/42.5K | カタチの遺跡 | 〃 | [0.28,0.28] |
| **港（会話）** | `tile-katari@{1,2}x.webp` | 23.5K/75.1K | カタリ港 | 〃 | [0.66,0.775] |
| **庭園** | `tile-omoide@{1,2}x.webp` | 27.9K/93.4K | オモイデ庭園 | 〃 | [0.15,0.79] |
| **展望塔** | `tile-sorano@{1,2}x.webp` | 11.3K/29.5K | ソラノ塔（縦長） | 〃 | [0.60,0.175] |
| マーカー | `marker-flag@{1,2}x.webp` | 7.4K/20.1K | 青い旗 | `WORLD_MAP_MARKERS.flag`（**既定**） | |
| マーカー | `marker-traveler@{1,2}x.webp` | 12.1K/33.5K | 旅人の後ろ姿 | **どこからも渡されていない** | ⚠️ **実質未使用** |
| 台座 | `ped-done@{1,2}x.webp` | 3.5K/10.1K | 完了 | `WORLD_MAP_PEDESTALS.done` | |
| 台座 | `ped-todo@{1,2}x.webp` | 2.6K/7.4K | 現在地 | `.current` | |
| 台座 | `ped-next@{1,2}x.webp` | 3.4K/9.8K | 次 | `.next` | |
| 台座 | `ped-locked@{1,2}x.webp` | 2.3K/6.3K | ロック | `.locked` | |

### 6-2. ホーム帯（`public/ai-course/home/` — 20ファイル・660K）

3:1 のヒーロー帯。地図の街と同じ場所・同じ画風。`advHomeAssets.HOME_HEROES` に登録。
`hero-{minato,hinode,toorimichi,ichiba,yukari,hataraki,katachi,sorano,katari,omoide}@{1,2}x.webp`
（10地域ぶん揃っている。9.1K〜74.2K）。実寸1152×384。

### 6-3. stepアイコン（`public/ai-course/step/` — 18ファイル・96K）

`step-{words,grammar,battle,review,talk,reading,listening,kana}@{1,2}x.webp` ＋ `goal-chest@{1,2}x.webp`。
1.2K〜5.5K。`advHomeAssets.ts:98` で使用。**地図画面では使っていない**（ホーム用）。

### 6-4. キャラクター

| ファイル | サイズ | 用途 |
|---|---|---|
| `public/images/ai-course/shoko-sensei-{base,wave,cheer,teaching}.webp` | 48〜104K | 翔子先生（AI講師）4ポーズ |
| `public/images/ai-course/yuto-sensei-{base,wave,teaching}.webp` | 38〜108K | 悠斗先生 3ポーズ |
| `public/images/ai-course/coach-sho.webp` | 68K | 安田翔（実写） |
| `public/images/ai-course/companions/{haru,natsu,aki}.webp` | 20〜29K | 相棒キャラ3体（`advCompanion.ts`） |

地図画面には `TeacherAvatar` と `CompanionAvatar` の形で登場する。

### 6-5. 無いもの

| | 状態 |
|---|---|
| **BGM / SE** | **1つも無い。** `public` 配下の音声は聴解問題の音源（`public/audio/ai-course/*.m4a`）のみで、UI音は存在しない |
| 病院・市役所・学校・住宅・フェリーターミナルの個別素材 | **無い。** 依頼文にあった建物のうち、素材として独立しているのは 駅・港・商店街・オフィス・遺跡・庭園・展望塔 のみ。住宅や学校は背景画像（`world-bg`）の中に描き込まれている |
| 地域カードのシーン絵の画像版 | **無い。** `AdvMapLandmarks.tsx` の自作SVGのまま（→ §8） |

### 6-6. 未使用素材

| ファイル | 理由 |
|---|---|
| `marker-traveler@{1,2}x.webp`（45.6K） | `markerAsset` prop を誰も渡しておらず、既定は `flag` |

---

## 7. 世界観・デザインルール

**ルールは文書化されている。** `docs/ai-course/design/DESIGN_BRIEF.md`（版 MB-v1・2026-08-22・69KB）が正準。
Codex / Astra は絵に触る前にこの §2 を必ず読むこと。要点だけ:

| 項目 | ルール |
|---|---|
| 舞台 | **現代日本**を舞台にした完全オリジナルの学習アドベンチャー。海辺の町と内陸の高地 |
| 画風 | 手描きの温かさを少し残した**洗練されたデジタルイラスト**。水彩のにじみ・紙の質感は「少し」。ポップな太線・ドット絵・3Dレンダ・写実は**禁止**。幼児向け・チビキャラにしない（大人が使う） |
| 視点 | **俯角約60°の3/4見下ろし・平行投影（消失点なし）**。建物は正面ファサードと屋根の両方が見え、ファサードは画面下を向く |
| 光 | **初夏の午前9〜10時**。光源は**右上**。影は**左下へ短く**、色は黒ではなく**くすんだ青灰**（`#8FA3B8` 20〜30%） |
| 線 | 細く均一。純黒の線・太いカートゥーン線は禁止。形は線ではなく**面の明度差（L*差15以上）**で読ませる |
| 季節 | 初夏（5月下旬〜6月上旬）・晴れ・午前。桜・紅葉・雪・夕焼け・夜は**この一式では使わない** |
| 色（背景） | アイボリー `#FBF5EC` / 空 `#DFF0FE→#F6FBFF` / 海 `#8ECBE8`,`#6DB2D8` / 砂浜 `#F2E2B8` / 平野 `#CFE8B0`,`#AED592` / 森 `#8CC48B`,`#5F9E6D` / 高地 `#DCCFAE`,`#C3B28C` / 遠峰 `#A9C1DD` / 川 `#7CC3E8` |
| 色（差し色・20%以下） | コーラル `#EE7A56`/`#D65E3B` ／ パイン `#1E5C57`/`#CFE4DF` ／ ゴールド `#F4BE4C`/`#FBEAC0` |
| **UI予約色（背景に面として使わない）** | 現在地 `#2563EB`・道 `#60A5FA` ／ 攻略済・次 `#F59E0B`,`#FBBF24`・グロー `#FDE68A` ／ 未解放 `#B6C2D1`,`#94A3B8` ／ 霧・雲海 `#F1F5F9`,`#E2E8F0`,`#EEF2F7` |
| 明度 | 背景は **L\* 70〜90**。L\* 55未満の色面を背景に作らない（白ラベルと44pxボタンが沈む） |
| 人物 | 背景・タイルに**人物を描かない**。生活の気配は洗濯物・自転車・電車・船・ベンチで出す |
| **文字** | **画像の中に文字・数字・看板の文字・ロゴ・UIを一切入れない。** 地名も状態もアプリがHTMLで描く（日本語/中国語の2言語のため） |
| **道** | **画像に道を描かない。** アプリが実データで描く。道が通る「回廊」は平らな地面にしておく |
| 彩度差 | 地図背景は地域カードのシーン絵より**一段くすませる**（カードの絵が引き立つように） |

### 統一されていない点（正直に）

- **地図本体は水彩画像、地域カードのシーン絵（`AdvMapLandmarks`）は自作SVG** の2系統。
  DESIGN_BRIEF は後者を「Phase 2」と位置づけており、**まだ画像化されていない**
- `AdvWorldMapScenery.tsx`（SVG版風景）の `WORLD_PALETTE` は DESIGN_BRIEF の色とほぼ同じだが、
  **別々に定義されている**（同期を強制する仕組みは無い）
- 地名とファイル名の不一致が1件（`toorimichi` ⇄「オウライ街道」）

---

## 8. 現在の問題点（事実と提案のみ・修正はしていない）

| 観点 | 事実 | 提案（実装しない） |
|---|---|---|
| **世界観の分断** | 地図本体は水彩画像なのに、地域カードのシーン絵・バッジのアイコンは自作SVG（`AdvMapLandmarks.tsx` 575行）。**同じ画面に2つの画風が同居している** | DESIGN_BRIEF の Phase 2 を実行する＝カードのシーン絵も画像化する。ここが没入感の最大の穴 |
| **ゲーム感** | 演出はCSSアニメ4種（霧・灯り・呼吸・道を描く）のみ。**効果音・BGMは1つも無い**。獲得の瞬間の演出は `AdvCelebrationOverlay` のみ | 音は原価0で没入感が上がる余地。ただし学習中の再生可否はCEO判断が要る |
| **学習との一体感** | 会話レイヤー12〜18地域は**攻略を計測していない**ので、地図上で永久に「未判定」のまま。試験レイヤーだけが色づく | 会話にも実測できる達成の定義を置くか、地図上で「測っていない」ことをもっと明示するか |
| **操作性** | ノードをタップしても**画面遷移せずスクロールするだけ**。地図が「見るもの」に留まり「進むもの」になっていない | ノードから直接その地域のCTAへ飛べるようにする案。ただし原則15（行き止まり禁止）と原則3（主要CTAは1つ）を壊さないこと |
| **スマホ／PC** | レスポンシブ分岐が `sm:` 2箇所だけ。**PCでもスマホの縦1カラムのまま**で、大画面では地図が小さく余白が広い | PC用に地図と地域カードを横並びにする案 |
| **URLが無い** | 地図に固有URLが無く、深いリンク・共有・戻るボタンが効かない | `?view=map` を足す案。ただし `AdvShell` の `View` state の扱いを変えることになる |
| **パフォーマンス** | 地図画像だけで1.2MB。背景2xは186KB（AVIF 158KB）。画像はすべて `loading` 属性の指定を確認していない（**不明**）。CLS対策は入っている（`aspect-ratio` と `width/height` 明示） | 実測（Lighthouse）をしてから判断するのが順当 |
| **保守性** | `AdvShell.tsx` が**4370行**。地図に渡すpropsの計算が約90行その中にある | 地図まわりのprops計算を切り出す案。ただし他セッションが同ファイルを編集していることが多い |
| **アセット管理** | anchor座標が背景画像の地形に対する**手作業の実測値**。背景を差し替えると11タイル全部を合わせ直す必要がある（ファイル内コメントに明記） | 背景差し替えを伴う改善は、anchor再調整の工数を最初から見込むこと |
| **未使用素材** | `marker-traveler@{1,2}x.webp`（45.6K）がどこからも参照されていない | 消すか、切替を実装するか |
| **技術的負債** | V1の地図系統（`IslandsMap` / `WorldHomeShell` / `pixelAssets` / `worldAtlas` / `chapter*Data`、合計2000行超）が**誰にも表示されないまま残っている** | **今は消さないこと。** `worldAtlas.ts` の areaId をV2が参照している（§9） |
| 命名 | 「ミナモ列島」はV1の世界名。V2の画面には出てこない（V2は「冒険の世界地図」「成長マップ」） | 用語を1つに決めるかどうかはCEO判断 |

---

## 9. 絶対に壊してはいけない箇所

### 🔴 触らない（このタスクの範囲外・壊れると実害が出る）

| 領域 | 具体的なファイル／対象 | 壊れたときに起きること |
|---|---|---|
| 認証 | `src/lib/aiLesson/course/courseAuth.ts`、`supabase/functions/ai-course-auth`、`ai-course-code-login` | 実在生徒11人がログインできなくなる（2026-08-28 に実際に起きた） |
| 決済 | `planCheckout.ts`、`supabase/functions/ai-course-{checkout,stripe-webhook}` | 売上 |
| 利用権・プラン | `planCatalog.ts`、`planEntitlements.ts`、`planAiBudget.ts`、**`advPlanGate.ts`** | 無料枠が有料の境界を越える。`contentRegionLimit`（=3）は地図に直結するので特に注意 |
| 学習履歴 | `ai_learners.settings`、`courseRepository.updateLearner`、`ai_save_learner_settings` の**保護キー** | 全学習履歴・先生の発行データの消失 |
| AI会話・回数消費 | `ai_start_session`、`ai_my_conversation_budget`、`aiQuota.ts` | 原価（音声1回≒¥100） |
| 本番Supabase / RLS | `supabase/migrations/` の適用、RLSポリシー | 個人情報の露出・データ消失 |
| Cloudflare | `scripts/generate-worker.mjs`（1826行）、`public/_headers`、`public/_routes.json` | サイト全体が落ちる |
| 本番環境変数 | `.env.production`、Cloudflare Pages の設定 | |
| SEO | `src/lib/seo/`、`staticSeo.json`、`generate-lp-prerender.mts` | 検索流入 |
| 言語ルーティング | `/:lang/` の構造、`src/locales/aiCourse.ts` の**キー構造** | 中国語話者が主なので致命的 |
| **`worldAtlas.ts` の areaId** | `area01-minato` 〜 `area10-omoide` の**綴り** | V2のヒーロー帯・目的地表示が消える |
| **`advWorldSpine.ts` の座標** | `SPINE` / `RING` / `MIN_NODE_GAP=44` | タップ領域が重なる。テストが落ちる |
| **`AdvShell.tsx`** | 4370行・他セッションが編集中のことが多い | コンフリクト。触る前に必ず `git status` |

### 🟢 触ってよい（改善の主戦場）

| 領域 | ファイル | 理由 |
|---|---|---|
| **地図画面のレイアウト・演出** | `AdvAdventureMap.tsx`（803行） | **純表示コンポーネント。** supabase / localStorage / fetch を一切import していない（確認済）。propsを描くだけ |
| 地域カードの絵 | `AdvMapLandmarks.tsx` | 自作SVGのみ。DBに触れない |
| バッジ | `AdvMapBadges.tsx` | 実測の別ビュー |
| 世界地図の見た目 | `AdvWorldMap.tsx` / `AdvWorldMapImage.tsx` / `AdvWorldMapScenery.tsx` | **ただし viewBox 360×600 と44pxタップ領域は動かさない** |
| 地図のCSS演出 | `src/index.css` の `kb-map-*` | `prefers-reduced-motion` の停止は残すこと |
| 画像素材 | `public/ai-course/map/` の差し替え・追加 | `advWorldMapAssets.ts` の登録もセット。背景を替えたら anchor 再調整 |
| 表示文言 | `advMapModel.ts` の地名・能力名・章名の**文字列** | **日本語と中国語の両方**を必ず同時に直す |

### ⚠️ 触るなら慎重に

- `advMapModel.ts` の**ロジック**（現在地が必ず1つ、という不変条件をここが守っている）
- `advWorldMapVariant.ts`（`?map=svg` の非常口は残す）

---

## 10. 開発・テスト・デプロイ

### 10-1. 環境

| | 値 |
|---|---|
| Node | **`.nvmrc` は `20`**。ただし手元の実行環境は v22.22.2（npm 10.9.7）で動いている |
| package manager | **npm**（`packageManager` フィールドは未設定・`package-lock.json` あり） |
| ビルド | Vite 8 / React 19.2 / TypeScript ~6.0 / Tailwind v4 / vitest 3.2 |
| ホスティング | Cloudflare Pages プロジェクト `badminton-platform`（wrangler 4.95） |

### 10-2. コマンド

```bash
npm ci                 # install（lockfile 準拠）
npm run dev            # 開発サーバー（vite）
npm run dev:staging    # staging モード・port 5176
npm test               # vitest run（全件。約7分・5,200件超）
npm run lint           # eslint .
npx tsc -b             # 型検査 ★ tsc --noEmit -p tsconfig.json は何も検査しない（solution tsconfig）
npm run build          # 言語整合性チェック → tsc -b → vite build → LPプリレンダ → worker生成
npm run preview        # ビルド結果のプレビュー
```

**地図だけを速く回すとき:**

```bash
npx vitest run src/components/ai-course/adventure/advAdventureMap.test.tsx \
               src/components/ai-course/adventure/advWorldMap.test.tsx \
               src/components/ai-course/adventure/advWorldMapImage.test.tsx \
               src/components/ai-course/adventure/advMapMotion.test.ts \
               src/components/ai-course/adventure/advMapMockCta.test.tsx \
               src/lib/aiLesson/course/adventure/advMapModel.test.ts \
               src/lib/aiLesson/course/adventure/advWorldSpine.test.ts \
               src/lib/aiLesson/course/adventure/advMapAllClear.test.ts \
               src/lib/aiLesson/course/adventure/advMapChapterLevels.test.ts
```

**E2Eフレームワークは存在しない**（Playwright / Cypress どちらも未導入）。
テストは vitest + @testing-library/react のコンポーネントテストのみ。

### 10-3. デプロイ

```bash
./scripts/deploy-staging.sh      # staging.badminton-platform.pages.dev（kawabado.com に影響しない）
./scripts/deploy-production.sh   # kawabado.com（★ CEOの承認が要る）
```

**本番デプロイには5つの門があり、1つでも×なら中断する（`--force` の抜け道は意図的に無い）:**

| 門 | 内容 |
|---|---|
| (a) | 現在のブランチが `scripts/DEPLOY_BRANCH`（= `integration/unify-2026-08-28`）と一致するか |
| (b) | このワークツリーに未コミットが無いか |
| (c) | 他ブランチに取り込み忘れが無いか |
| (d) | 他ワークツリーに未コミットが無いか |
| (e) | コードが呼ぶDB関数・テーブルが本番DBに本当にあるか |

門が厳しい理由: **Cloudflare Pages は差分ではなく全置換**で、ワークツリーが4つあるため
「実行したフォルダの姿に本番が入れ替わる」事故が 2026-08-28 だけで3回起き、
実在生徒3人がログインできなくなった（`deploy-production.sh` 冒頭に経緯が書いてある）。

`DRY_RUN=1` はアップロードだけ飛ばす。**門はDRY_RUNでも全部通る。**

### 10-4. 必要な環境変数（名前だけ）

| 名前 | 用途 |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | **必須。** これが無いと何も動かない |
| `VITE_STRIPE_PUBLISHABLE_KEY` | 決済 |
| `VITE_AI_COURSE_CHECKOUT` | 決済導線のフラグ |
| `VITE_TURNSTILE_SITE_KEY` | bot対策 |
| `VITE_GA4_ID` / `VITE_META_PIXEL_ID` | 計測 |
| `VITE_CAMPAIGN` / `VITE_GAME_MODE` / `VITE_DEFAULT_ANSWERS` / `VITE_AI_LESSON_DEMO_CODE` / `VITE_AI_INTERRUPTION_STAGE` | 各種フラグ |
| `SUPABASE_ACCESS_TOKEN`（または `~/.supabase_backup_token`） | 運用スクリプト用。**フロントには不要** |

ファイル: `.env`（開発）/ `.env.staging` / `.env.production`。
検査: `npm run validate:ai-course-env`。

**地図の改善に必要なのは `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` の2つだけ。**

---

## 11. Git / ブランチ運用

| | |
|---|---|
| リモート | `git@github.com:shocchan/badminton-platform.git` |
| 現在のブランチ | `ux-audit/quick-wins-2026-09-09`（commit `732d885b`） |
| **本番ブランチ** | **`integration/unify-2026-08-28`**（`scripts/DEPLOY_BRANCH` が正本） |
| stagingブランチ | 専用ブランチは無い。`deploy-staging.sh` はどのブランチからでも打てる（wrangler の `--branch=staging` はCloudflare側のラベル） |
| PR | **使っていない。** リモートには `origin/main` と `auto-backup/*` しか無く、`integration/unify-2026-08-28` はリモートに存在しない（**ローカル運用**） |
| 直接push | リモートは自動バックアップ用。デプロイとは連動していない |

**ワークツリーが4つある。混同すると本番事故になる:**

```
~/badminton-platform       [security/rls-hardening-and-quality]
~/badminton-aicourse       [feature/ai-course-adventure-v2-final-completion]
~/badminton-sales          [ux-audit/quick-wins-2026-09-09]   ← ★ここで作業する
~/badminton-secure-runtime [feature/ai-course-secure-runtime-review]
```

**作業手順の推奨:**

```bash
cd ~/badminton-sales
git status                                   # 他セッションの未コミットを必ず確認
git checkout -b feature/map-immersion-2026-09   # ux-audit/quick-wins-2026-09-09 から切る
# ... 作業 ...
npx tsc -b && npm run lint && npx vitest run <地図のテスト>
git add <触ったファイルだけ>                   # ★ git add -A は使わない（他セッションの作業を巻き込む）
git commit
```

**rollback:**

| 状況 | 方法 |
|---|---|
| コミット前 | `git checkout -- <file>` |
| コミット後・未デプロイ | `git revert <sha>` |
| **本番へ出してしまった** | 直前の良いコミットへ戻して `deploy-production.sh` を**もう一度実行**する。Cloudflare Pages は全置換なので、これで本番は前の姿に戻る。Cloudflare ダッシュボードの Deployments から過去ビルドへの Rollback も可能（**未検証・不明**） |
| DB | このタスクではDB変更が不要（§5-1）。もし触るなら各migrationに `.rollback.sql` がある |

**`git stash` は使わないこと。** stashスタックは4つのワークツリーで共有されており、
他セッションの作業をpopしてしまう危険がある。退避するなら一時コミット。

---

## 12. Codex / Astra へ渡す要約

> ### 何を改善するのか
> **Adventure V2 の「冒険マップ」画面**（`AdvAdventureMap.tsx`）の世界観・没入感・ゲーム性・学習との一体感。
> 本番の実在学習者**11人全員**がこの画面を使っている。
>
> **「ミナモ列島マップ」（`IslandsMap.tsx` / `WorldHomeShell.tsx`）は別系統で、現在は誰にも表示されていない。そちらではない。**
> ただし世界の地名（`worldAtlas.ts` の `area01-minato`〜`area10-omoide`）はV2も参照しているので消さないこと。
>
> ### どこを見るのか（この順で読む）
> 1. `docs/ai-course/PRODUCT_CANON.md` — 18の絶対原則（特に 原則3「主要CTAは1つ」／11・12／13「数字を作らない」／15「行き止まりを作らない」／16「CTAは地図より上」）
> 2. `docs/ai-course/design/DESIGN_BRIEF.md` §2 — 画風・視点・光・線・色・季節の統一ルール（**絵に触る前に必読**）
> 3. `src/components/ai-course/adventure/AdvAdventureMap.tsx`（803行）— 画面本体。**純表示。DBに触らない**
> 4. `src/lib/aiLesson/course/adventure/advMapModel.ts`（575行）— 地図データの組み立て
> 5. `src/lib/aiLesson/course/adventure/advWorldSpine.ts`（285行）— 道の座標
> 6. `src/lib/aiLesson/course/adventure/advWorldMapAssets.ts`（125行）— 画像素材の登録
> 7. `public/ai-course/map/`（36ファイル・1.2MB）— 水彩の背景・タイル・マーカー・台座
>
> ### 何を壊してはいけないのか
> - **認証・決済・利用権・AI会話の回数消費・学習履歴・本番Supabase/RLS・Cloudflare設定・SEO・言語ルーティング**
> - `advPlanGate.ts` の `contentRegionLimit`（体験パスと無料枠は3地域まで＝**課金の境界**）
> - `advWorldSpine.ts` の座標と **44px のタップ領域**（テストが機械的に強制している）
> - `AdvShell.tsx`（4370行・他セッションが編集中のことが多い。触る前に `git status`）
> - 画像の中に**文字を入れない**（日本語/中国語の2言語で出すため）
> - `prefers-reduced-motion` でアニメーションを止める実装
> - **DB変更は不要。** スキーマにもRPCにも手を入れずに改善できる
>
> ### どうテストするのか
> ```bash
> npx tsc -b && npm run lint
> npx vitest run src/components/ai-course/adventure/advAdventureMap.test.tsx \
>                src/components/ai-course/adventure/advWorldMap.test.tsx \
>                src/components/ai-course/adventure/advWorldMapImage.test.tsx \
>                src/lib/aiLesson/course/adventure/advMapModel.test.ts \
>                src/lib/aiLesson/course/adventure/advWorldSpine.test.ts
> ```
> E2Eフレームワークは無い。実画面を見るには**ログインが必要**で、CEOに
> `issue-alumni-code.mjs` で個人URL（`/zh/learn/<コード>`）を1本発行してもらうのが最短。
>
> ### どうデプロイするのか
> ```bash
> ./scripts/deploy-staging.sh      # staging.badminton-platform.pages.dev で確認
> ./scripts/deploy-production.sh   # ★ CEOの承認が要る。5つの門があり1つでも×なら中断
> ```
> 本番ブランチは `integration/unify-2026-08-28`（`scripts/DEPLOY_BRANCH` が正本）。
> **Cloudflare Pages は差分ではなく全置換**なので、実行するワークツリーを間違えると本番が別の姿になる。
> 作業は必ず `~/badminton-sales` で行う。

---

## 付録: この資料で「不明」のままのもの

| # | 不明な点 | 埋めるのに必要なもの |
|---|---|---|
| 1 | 地図の**実画面**（作成者はブラウザで見ていない。LPに載っている実スクショで代替した） | 学習者アカウント（CEOが `issue-alumni-code.mjs` で発行） |
| 2 | 試験ルート（N2/N3目標）の地図の見え方 | 同上。手元のスクショは会話ルートのもの |
| 3 | 台座画像（`ped-*`）が実際に見えているか | 同上 |
| 4 | 地図のパフォーマンス実測（LCP / CLS / 画像の遅延読込の有無） | 実機での Lighthouse |
| 5 | Cloudflare ダッシュボードからの Rollback が実際に効くか | 未検証 |
| 6 | `integration/unify-2026-08-28` へどう取り込んでいるか（merge か fast-forward か） | CEOの運用。現状は HEAD が1コミット先行しているだけ |
| 7 | Node 20 と 22 のどちらを正とするか（`.nvmrc` は 20、実行環境は 22） | CEO判断 |

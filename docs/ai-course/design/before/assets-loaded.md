# 改善前記録: 冒険マップ画面で読まれるアセット（staging・2026-08-22）

対象: https://staging.badminton-platform.pages.dev の Adventure V2「冒険マップ」「今日の冒険」
計測者: Claude（Playwright + Node fetch + curl）。個人情報は一切含まない（ログイン不要の公開静的ファイルのみ計測）。

## ⚠️ 状態: スクリーンショット6×2枚は未取得（ログイン不可）

- testアカウント（ID `test` / PW `testfe0129`）で `/ja/ai-course?app=1` のIDフォームからログインすると、
  Supabase Auth（`jdkwijdphlkrcoiggfqw.supabase.co` = 本番と同一プロジェクト）が
  `400 {"code":"invalid_credentials"}` を返す（メール `test@id.badminton-platform.pages.dev` で送信されていることは確認済み）。
- つまり **testアカウントのパスワードが変わっているか、アカウントが存在しない**。ロックアウト回避のため再試行は3回で止めた。
- `before-map-{ja|zh}-{375|768|1440}.png` / `before-home-…png` は **このディレクトリに未保存**（誤って保存したログイン画面の撮影は破棄）。
- 再撮影は同ディレクトリの `capture-before.mjs` で可能（CEOが testアカウントのPWを確認 or 再設定したら
  `AI_COURSE_TEST_ID` / `AI_COURSE_TEST_PW` 環境変数を渡して1コマンドで6×2枚＋ネットワーク実測が出る。手順は同ファイル冒頭）。

以下は **ログインなしで計測できた分**（JSチャンク・画像は公開静的ファイルなので、画面で読まれるものを静的解析＋実測した）。

## 1. 結論（デザイン改修の前提として重要な点）

1. **冒険マップの絵は画像ファイルではなく、全部 JSX のインラインSVG**（`AdvWorldMap.tsx` / `AdvWorldMapScenery.tsx` / `AdvMapLandmarks.tsx` / `AdvMapBadges.tsx`）。
   ネットワーク上は `AdvShell-*.js` チャンクの一部として届く。→ 画像としての個別リクエストは**0本**。
2. マップ画面で読まれる**ラスター画像は「相棒アバター」1枚だけ**（`/images/ai-course/companions/{haru|natsu|aki}.webp`、20〜30KB、24px表示）。
   未配置・失敗時はモノグラムSVGにフォールバック（`CompanionAvatar.tsx`）。
3. 先生イラスト（shoko/yuto `*.webp` 58〜110KB）はログイン画面・ホーム側（`CourseIllustration` = `AiCoursePage` チャンク）の参照で、マップ本体からは参照されない。
4. フォントは外部読込なし（`index.html` / `index.css` に `@font-face` / Google Fonts なし → システムフォント）。
5. マップ画面を開くまでに落ちてくるJSは **約1.6MB（brotli転送）/ 5.4MB（展開後）**。うち「語彙コンテンツ」`ai-course-vocab-content` が転送の4割（654KB）。
   ChatGPT画像（WebP）を追加する余地の判断材料: 画像を1枚100KB級で5枚足しても、現行のJS転送量の3割程度。

## 2. インラインSVG（マップ本体）の中身 — `AdvShell-BjqmTZzu.js` 内

| 項目 | 値 | 補足 |
|---|---|---|
| チャンク転送サイズ（br） | **158,655 B（155KB）** | 展開後 525,702 B（513KB）・所要 ≈85ms（東京・CF経由） |
| `<svg>` ルート数 | 20 | LandmarkScene（viewBox `0 0 160 110`）/ LandmarkIcon（`0 0 48 48`）/ lucideアイコン（`0 0 24 24`）/ AdvWorldMap（動的viewBox） |
| `<path>` | 169（`d=` 総文字数 5,382） | 風景・建物はほぼ rect/ellipse/circle の組合せ（単純図形のみ・既存IP不使用の方針どおり） |
| `<rect>` / `<circle>` / `<ellipse>` | 121 / 28 / 28 | |
| `<image>` / `<text>` | 0 / 0 | 文字はHTML側で出す設計（翻訳のため） |
| `linearGradient` | 4 | フィルタ（blur/turbulence）は 0 |
| ソース（TSX）サイズ | Scenery 21.2KB・Landmarks 30.3KB・WorldMap 14.8KB・Badges 4.8KB・AdventureMap 46.5KB | |

## 3. マップ画面で実際に発生する画像リクエスト（実測）

| ファイル | 形式 | サイズ | 所要ms（実測・キャッシュなし） | 表示箇所 |
|---|---|---|---|---|
| `/images/ai-course/companions/haru.webp` | WebP | 20,518 B（20.0KB） | 53 | 相棒アバター（24px・選択中の1人だけ読む） |
| `/images/ai-course/companions/natsu.webp` | WebP | 29,626 B（28.9KB） | 52 | 同上 |
| `/images/ai-course/companions/aki.webp` | WebP | 21,174 B（20.7KB） | 49 | 同上 |
| `/favicon-64.png?v=3` | PNG | 7,810 B（7.6KB） | 22 | タブアイコン |

※ 画像は無圧縮配信（content-encoding なし）なので「サイズ＝転送量」。ms は `curl` の `time_total`（Node fetch 初回は 257〜366ms と振れたので、2回目以降の値を採用）。

## 4. 「今日の冒険」ホーム／ログイン画面で読まれる画像（参考・実測）

| ファイル | 形式 | サイズ | 所要ms | 参照元 |
|---|---|---|---|---|
| `/images/ai-course/shoko-sensei-base.webp` | WebP | 59,450 B（58.1KB） | 32〜72 | ログイン画面アバター（Playwright実測でも同値） |
| `/images/ai-course/shoko-sensei-cheer.webp` | WebP | 61,164 B（59.7KB） | 29〜93 | `CourseIllustration`（ホーム系） |
| `/images/ai-course/shoko-sensei-wave.webp` | WebP | 104,562 B（102.1KB） | 29〜121 | `CourseIllustration`（ホーム系） |
| `/images/ai-course/yuto-sensei-base.webp` | WebP | 73,690 B（72.0KB） | 65 | 先生切替時 |
| `/images/ai-course/yuto-sensei-wave.webp` | WebP | 110,372 B（107.8KB） | 85 | 先生切替時 |
| `/images/ai-course/coach-sho.webp` | WebP | 67,742 B（66.2KB） | 73 | LP/コーチ表示 |

## 5. マップ到達までに読まれるJS/CSS（実測・brotli）

| ファイル | 転送（br） | 展開後 | 所要ms | 役割 |
|---|---|---|---|---|
| `/assets/index-BW1evym_.js` | 166,432 | 593,671 | 85 | エントリ（サイト全体） |
| `/assets/index-DQ2WH3Fe.css` | 21,714 | 161,385 | 57 | 全CSS（Tailwind） |
| `/assets/AiCourseEntry-BqnB1VLN.js` | 14,554 | 54,650 | 53 | LP/アプリ振り分け |
| `/assets/AiCoursePage-BsOWVlWZ.js` | 76,264 | 314,747 | 67 | 学習アプリ本体（ログイン画面含む） |
| `/assets/AdvShell-BjqmTZzu.js` | **158,655** | 525,702 | 85 | **Adventure V2（マップSVG込み）** |
| `/assets/advProfile-2Iuq9tUG.js` | 26,431 | 68,098 | 61 | 相棒・プロフィール |
| `/assets/advContent-IoQWFbiy.js` | 9,916 | 25,593 | 53 | 冒険コンテンツ定義 |
| `/assets/ai-course-vocab-content-CA9djGpN.js` | **654,360** | 2,080,675 | 218 | 語彙出題プール（静的import・最大） |
| `/assets/ai-course-reading-CpP_vD5K.js` | 192,962 | 649,954 | 87 | 読解プール |
| `/assets/ai-course-listening-IQo4Lkdb.js` | 82,498 | 335,994 | 81 | 聴解プール |
| `/assets/n3GrammarDrafts-CSet8Sql.js` | 45,555 | 155,830 | 67 | N3文法 |
| `/assets/unitRuntime-CI6fXdiQ.js` | 14,558 | 42,235 | 52 | |
| `/assets/chunk-4N6VE7H7-Dk22IJCG.js` | 14,849 | 41,071 | 54 | 共通 |
| **合計（上記）** | **≈1,478,748 B（1.41MB）** | ≈5,050,000 B | | |

※ `AdvShell` の静的依存一覧は `AdvShell-*.js` 内の import 文字列から取得（vite manualChunks: vocab-content / reading / listening は別チャンク化されているが**静的importのため初回に同時ロード**。`vite.config.ts` のコメントどおり、初回転送を減らすなら動的import化が必要＝別P2）。

## 6. 再計測の手順

```bash
# PW は CEO から受け取り、ファイルには書かない
cd /private/tmp/claude-501/-Users-shocchan-ai-company/48dc179d-521e-4e4c-bd89-fbc003f614db/scratchpad/pw   # playwright@1.57 を npm install 済みの場所
AI_COURSE_TEST_ID=test AI_COURSE_TEST_PW='<pw>' node /Users/shocchan/badminton-aicourse/docs/ai-course/design/before/capture-before.mjs
```
出力: `before-{home|map}-{ja|zh}-{375|768|1440}.png`（フルページ）＋ `assets-network.json`（画像/フォントの URL・type・bytes・ms・phase）。
撮影前に `document.body.innerText` を scratchpad に落とし、表示名が「テスト」系であることを目視確認すること（実名らしきものがあれば撮り直し/マスク）。

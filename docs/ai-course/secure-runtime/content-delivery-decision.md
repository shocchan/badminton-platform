# 教材配信方式の決定（P0）

2026-08-02。branch `feature/ai-course-secure-runtime-review`。

**結論：ビルド時に問題を実体化してページ単位の非公開オブジェクトにし、R2 に置き、Worker が
`contentDelivery.decideDelivery()` を通してから 1 ページ分だけ切り出して返す。**

---

## 1. 実測した前提（推測ではなく数字で選ぶ）

### 公開露出（`npm run build:staging` 後）

| | 値 |
|---|---|
| 教材本文を含む公開チャンク | **36 ファイル / 3,617,390 bytes** |
| うち source map | 0（`vite.config.ts` は sourcemap 未有効。**この状態を維持する**） |

依頼書が名指しした3バンク（語彙・読解・聴解）は 1.72MB だが、実際の露出はその倍以上。
文法draft・foundation・語彙会話練習も同じく公開されている。

### 実体化したときの大きさ（`vocabPool` / `readingPool` / `listeningPool` を JSON 化して実測）

| プール | 問題数 | bytes |
|---|---|---|
| vocab N3 | 9,767 | 11,833,357 |
| vocab N2 | 10,125 | 12,277,392 |
| reading N3 / N2 | 100 / 120 | 242,133 / 310,714 |
| listening N3 / N2 | 100 / 100 | 198,355 / 218,679 |

**語彙だけで 1 レベルあたり約 12MB。** これが方式選択を決めた。

理由：語彙は 2,000 語の原文（1.1MB）から `buildVocabQuestions` が
1 語あたり 4〜6 観点 × 選択肢・誤答解説を生成するため、**原文の約 10 倍に膨らむ**。

---

## 2. 候補の比較

| | A. Supabase DB | B. R2（採用） | C. Worker 埋め込み | D. KV |
|---|---|---|---|---|
| 公開露出 | なし | なし | なし | なし |
| 認証・利用権の強制 | Edge Function 側 | **Worker 側（1か所）** | Worker 側 | Worker 側 |
| 12MB を置けるか | 置けるが DB が肥大 | **可（10GB 無料）** | **不可** | 可（1値25MB） |
| 教材更新のコスト | SQL 移行が要る | **オブジェクト差し替え** | 全体再デプロイ | 書き込み上限に当たる |
| 取得単位 | 行単位 | **ページ単位** | メモリ全展開 | ページ単位 |
| 将来の増加 | DB 肥大 | **線形に伸びるだけ** | 早晩破綻 | 書き込み上限で破綻 |
| local 検証 | 共有プロジェクトに触る | **`wrangler dev` の local R2 で可** | 可 | local KV で可 |
| コスト | DB 負荷が乗る | **egress 無料** | — | 読みは安い |

### C（Worker 埋め込み）を落とした理由

実体化後 12MB。Worker script の上限（圧縮後 3MB / 有料 10MB）を**確実に超える**。
仮に原文だけ（1.1MB）を載せてリクエスト毎に生成しても、
起動コスト・CPU 時間・教材追加のたびの全体再デプロイが残る。
依頼書の「将来教材が増えても破綻しない」を満たさない。

### D（KV）を落とした理由

読み取り性能は最良だが、**無料枠の書き込みが 1日1,000回**。
教材を作り直すと数百〜数千ページを書くため、1回のコンテンツ更新で上限に当たる。
R2 は Class A 操作が月100万まで無料で、この用途に上限が効かない。

### A（Supabase DB）を落とした理由

staging と production が**同じプロジェクト `jdkwijdphlkrcoiggfqw` を共有**している。
教材 12MB をこの DB に入れると、バドミントン本体と同じ DB の運用リスクに教材が乗る。
加えて Worker → Supabase は binding ではなく HTTP 往復になり、
1問取得ごとにレイテンシと service-role 鍵の取り回しが増える。
（過去に匿名キーでの公開読み取り穴があった経緯もあり、共有 DB に機密を増やす判断は取らない。）

---

## 3. 採用する構成

```
[ビルド時]
  banks(.ts) ──vite-node──> 実体化 ──> content-dist/v1/<kind>/<level>/<target>/<page>.json
                                        + manifest.json（件数とhashのみ・本文なし）
       ↑ dist/ の外。公開されない。gitignore。

[デプロイ時]  wrangler r2 object put  → 非公開バケット（CEO承認後）

[実行時]
  client ──fetch /api/ai-course/content──> Worker
                                             ├ 認証（Supabase JWT 検証）
                                             ├ decideDelivery()  ← 既存の判断層
                                             ├ R2 から該当ページだけ取得
                                             └ toDeliverable() で内部IDとsourceを落として ≤5件返す
```

### なぜページに分けるか

Worker は 1 リクエストで R2 オブジェクトを丸ごと読む。
target 単位（語彙 N2 で 12MB）だと 1 問のために 12MB 読むことになる。
1 ページ = 20 問（実測でおおむね 20〜60KB）に切り、step から必要なページだけ読む。

### 露出しない根拠

- `content-dist/` は `dist/` の外にあるので Pages のアセットとして配信されない
- R2 バケットは公開アクセスを有効にしない（binding 経由でしか読めない）
- client の import グラフから bank を外し、**vite の alias で再混入を機械的に止める**
- `npm run measure:ai-course-content-exposure` が 0 になることで確認する

---

## 4. local で検証できること／できないこと

`wrangler dev --local` は miniflare の local R2 を使うため、
**remote を一切触らずに** HTTP レベルの 401 / 403 / 200 を実証できる。

remote が要るのは「本番で実際に配信する」段階だけ：

| 必要な remote 変更 | 状態 |
|---|---|
| R2 バケット作成 | **未実行・CEO承認要** |
| Pages プロジェクトへの R2 binding 追加 | **未実行・CEO承認要** |
| `AI_COURSE_CONTENT_TOKEN_SECRET` の設定 | **未実行・CEO承認要** |
| 教材ページの R2 アップロード | **未実行・CEO承認要** |

---

## 5. この決定で解決しない既知の露出（別件・P1）

**`dist/audio/ai-course/` に聴解音声が 49MB、認証なしで公開されている。**

聴解の音声は教材そのものなので、テキストを非公開化しても音声が公開のままなら
聴解教材は実質的に取得できる。本文と同じ扱いにするなら R2 + 署名付き URL が要る。

今回の P0（`measure:ai-course-content-exposure` はテキストのみを測る）の範囲外だが、
**P0 完了後も残る露出**として記録する。CEO 判断を仰ぐ。

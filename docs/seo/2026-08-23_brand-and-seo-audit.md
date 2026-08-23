# kawabado 全体 SEO・ブランド監査（2026-08-23）

対象: kawabado.com（バドミントン事業＋AI日本語伴走学習事業）
調査元: `~/badminton-aicourse`（現在の本番デプロイ元）・`~/badminton-platform`・本番実測・Supabaseバックアップ実データ

---

## A. Executive Summary — 最重要課題 TOP10

| # | 課題 | 影響 | 状態 |
|---|---|---|---|
| 1 | **中国語ページの素のHTMLが日本語** — `<html lang="ja">`＋日本語タイトルのまま配信。微信・小紅書・LINE・X・BaiduはJSを実行しないので、中国語ページをシェアすると日本語バドミントンのカードが出る | 軸1の主要導線（SNS）が丸ごと死んでいる | ✅ 修正・未デプロイ |
| 2 | **バドミントン事業の法務ページが本番に存在しない** — `/ja/privacy` `/ja/tokushoho` `/ja/terms` は HTTP 200 で 404 画面（ソフト404）。実装は未マージの `~/badminton-platform` にだけある | 決済を伴う事業で特商法表記が無い。法務・E-E-A-T両方 | 🔴 CEO判断（マージ要） |
| 3 | **本番デプロイ元の分岐が未解消** — `badminton-platform` 側に画像最適化・大会詳細刷新・未入金管理UI・法務ページ等 220ファイル分の差分が本番未反映 | 直したはずのものが本番に無い状態が続く | 🔴 CEO判断 |
| 4 | **非公開URLがインデックス可能だった** — robots.txt は `Disallow: /admin` の1行だけ。実URLは `/ja/admin`。管理画面・マイページ・受講者アプリ入口・サブグループ管理画面が全部素通り | 個人情報を含む画面が検索対象 | ✅ 修正・未デプロイ |
| 5 | **ブログの一覧・詳細に title が無かった** — ja/zh 両方がフォールバックの同一タイトル。記事本体は sitemap に1本も載っていない | 大会レポート＝独自コンテンツが検索に出る経路ゼロ | ✅ 修正・未デプロイ |
| 6 | **フッターの内部リンクが言語を無視** — `/faq` 等の接頭辞なしURL。中国語で見ている人がフッターを踏むと日本語ページへ飛ぶ | 中国人ユーザーの離脱・リダイレクトホップ | ✅ 修正・未デプロイ |
| 7 | **sitemap が自分でnoindexにしたURLを送っていた** — `/ai-course/shoko` `/yuto` | Search Console のエラーが恒常化 | ✅ 修正・未デプロイ |
| 8 | **AI日本語コースの検索接点がLP1枚だけ** — コンテンツクラスタが無い | 検索流入がブランド名頼み | ⬜ Phase 7 |
| 9 | **中国語圏の決済手段が未対応**（Alipay/WeChat Pay 未申請） | 小紅書・微信からの流入が決済で落ちる | 🔴 CEO作業（Stripe申請） |
| 10 | **相談経由リードにUTMが付かない**（`ai_plan_applications` は実測0件） | 10万円コースの唯一の入口の流入元が不明 | ⬜ P1-14 |

---

## B. ブランド診断

### 現在のブランドの見え方

- ヘッダー・フッター・OGP・Organization schema はすべて **「川口・蕨バドミントン交流会」**。
  `kawabado` は英字サブタイトルとして出るだけで、ブランド名として立っていない。
- AI日本語コースは、LPに入った瞬間に別ブランド（**「日本語の相棒 / 你的日语搭档」**・和マーク・アイボリー基調）へ切り替わる。
  サイト共通ヘッダーは chromeless で非表示、独自ナビになる。
- 両者をつなぐ接点は **フッターの「関連サービス」1リンクだけ**（2026-08-22 追加）。

### 問題

1. **`kawabado` という語が、何のブランドなのかサイト上で一度も説明されていない。** ドメイン名として存在するだけ。
2. バドミントンのページから見ると、AI日本語コースは「なぜここにあるのか」が分からない。逆も同じ。
3. Organization schema が「川口・蕨バドミントン交流会」＋`sport: バドミントン` 固定なので、
   AIコースのページも構造化データ上はバドミントン団体の配下に見える。

### 推奨: パターン2＋4のハイブリッド（Endorsed Brand）

4案のうち、**「日本×中国をつなぐ交流ブランド kawabado」を親に置き、事業別に子ブランドを立てる**のが実態に一番近い。

- 共通しているのは競技でも教育でもなく、**「日本にいる中国語話者と日本人が交わる場を作っている」**という一点。
  バドミントン交流会（多国籍・中国語対応・WeChat申込）とAI日本語コース（中国語話者向け）は、この軸でだけ自然につながる。
- ただし **umbrella brand として1つの言葉で括る（パターン3）のは今は避ける。** 括った瞬間、
  どちらの検索意図にも刺さらない曖昧なメッセージになる。親は「同じ運営者である」ことの保証に徹する。
- 具体案（実装は承認後）:
  - 親: **kawabado** — 「日本と中国をつなぐ、川口発のコミュニティ」
  - 子1: **川口・蕨バドミントン交流会**（by kawabado）
  - 子2: **日本語の相棒 / 你的日语搭档**（by kawabado）
  - 各子ブランドのフッターに「運営: kawabado」＋運営者ページへの1リンク。それ以上は混ぜない。

**「バドミントンサイトを見に来た人が、なぜ日本語学習システムがあるのか理解できるか」→ 現状は理解できない。**
理解させるには「同じ人が、同じ目的（日本にいる中国語話者が困らない場を作る）でやっている」を1ページで説明する必要がある（＝運営者ページ／about）。これは同時に E-E-A-T の穴も塞ぐ。

---

## C. ドメイン / URL アーキテクチャ

### 現状

```
kawabado.com
├── /ja/ /zh/                       バドミントン（トップ＝大会案内）
│   ├── activity  activity/:id      通常活動
│   ├── tournaments/:id             大会詳細
│   ├── level-guide venues faq contact join cancel-policy blog blog/:id
│   ├── results/vol1..3             大会結果
│   ├── game tactics-board          遊び（tactics-boardはコード上「非公開」だがヘッダーナビに露出）
│   ├── admin mypage login signup auth-landing password-reset*   非公開
│   └── ai-course                   ★AI日本語コース（LP）
│       ├── /login                  受講者アプリ（noindex）
│       ├── /shoko /yuto            広告用variant（noindex）
│       └── /terms /privacy /tokushoho /cancel-policy /ai-disclosure /data-deletion /account-deletion /contact
├── /chaoxianzu/:lang/*             限定公開サブグループ
├── /assistant/:lang/*              限定公開サブグループ
└── study.kawabado.com              生徒向けプロキシ（本番向き）
```

### 3案の比較

| 観点 | 案A 現状維持（kawabado.com/:lang/ai-course） | 案B learn.kawabado.com | 案C 独立ドメイン |
|---|---|---|---|
| Google SEO | 中〜高。ドメインの評価を引き継げるが、トピックが割れる | 中。サブドメインは概ね同一サイト扱いだが評価の伝播は弱まる | 低（初期）。ゼロから積む |
| topical authority | **弱い**。バドミントンと日本語教育が同居し、どちらのトピックでも純度が落ちる | やや改善 | 最も高い（長期） |
| ブランド理解 | 弱い（B参照） | 中 | 高 |
| 中国人ユーザーから見た理解 | **悪い**。`kawabado`＝羽毛球の語感。日语课程のURLに badminton の綴りが入る | 中 | 高 |
| backlink / DA | 現状の被リンクをそのまま使える | ほぼ使える | 使えない |
| 多言語SEO | 現状の /ja /zh 構造をそのまま使える（良い） | 再設計が必要 | 再設計が必要 |
| 将来の中国語学習版（日本人→中国語） | **破綻する**。`kawabado.com/ja/ai-course` に中国語学習を足すとURLが意味不明になる | 収まる | 収まる |
| 決済 / 認証 | 変更なし | Cookieドメイン・Supabase redirect の見直しが要る | 全部作り直し |
| analytics / Search Console | 1プロパティで済む | プロパティ追加（切り分けはむしろ楽になる） | 完全に別 |
| migration risk | ゼロ | 中（301・sitemap・OGP・Stripe戻りURL） | 高 |
| 広告LPとの整合 | 現状OK | OK | OK |
| 開発・運用コスト | 最小 | 中（Worker・_redirects・env） | 大 |

### 結論

- **今すぐ必要か → No。** 現状のURL設計は破綻していない。移転より先に、B〜Fの中身（言語別プリレンダー・コンテンツ・信頼要素）を埋めるほうが桁違いに効く。
  被リンクもインデックスも小さい今、移転コストは低いが、移転して得られるものも小さい。
- **将来必要か → Yes。条件つきで。** 次のどれかが起きた時点で **案B（learn.kawabado.com）** へ。案Cは推奨しない（運営者の信用＝kawabadoの実績を捨てることになる）。
  1. 日本人→中国語版を出すと決めたとき（`kawabado.com/ja/ai-course` に中国語学習は載らない）
  2. AI日本語コースの検索流入が月1,000セッションを超え、バドミントンのトピックと競合し始めたとき
  3. 学習アプリを独立した製品として売る（B2B・法人研修等）と決めたとき

移転する場合の前提: 全URLの1対1 301、sitemap分割、OGPの再検証、Stripe の success/cancel URL、Supabase の redirect allowlist、GA4のクロスドメイン計測。**承認前には実行しない。**

---

## D. テクニカルSEO

### 構成の理解（重要）

kawabado.com は **Cloudflare Pages の Advanced mode**。`dist/_worker.js`（`scripts/generate-worker.mjs` が生成）が全リクエストを受ける。
そのため **`functions/` ディレクトリは一切実行されない**。`functions/sitemap.xml.ts` と `functions/api/admin/shuttle-log.ts` は**死んだコード**。
sitemap も OGP も Worker 側が正。→ 残タスク O-4 参照。

### 見つけた問題と対応

| 問題 | 詳細 | 対応 |
|---|---|---|
| 素のHTMLが全ページ日本語 | `<html lang="ja">`・`<title>川口・蕨バドミントン交流会</title>`・`og:locale=ja_JP` 固定 | ✅ 9ページ×ja/zh を Worker が差し替え |
| canonical が JS 依存 | 大会・ブログ・AIコース以外は Helmet 頼み | ✅ 静的9ページは素のHTMLにも入る |
| hreflang が素のHTMLに無い | 同上 | ✅ ja/zh/x-default を注入 |
| robots.txt が実URLと不一致 | `Disallow: /admin`（実URLは `/ja/admin`） | ✅ 全面書き換え＋Worker の `X-Robots-Tag` |
| sitemap ↔ noindex の矛盾 | `/ai-course/shoko` `/yuto` を送信 | ✅ 除外 |
| ブログ記事が sitemap に無い | 一覧のみ。記事は0本 | ✅ 公開記事を追加 |
| `/zh/blog` が日本語の重複ページ | 記事本文に中国語版なし | ✅ 日本語版へ canonical・sitemapから除外 |
| ブログ・キャンセルポリシーに Helmet 無し | フォールバックtitleで ja/zh が同一 | ✅ 追加 |
| ソフト404 | 未知URLが HTTP 200 ＋ 404画面 | ⬜ 残（`NotFoundPage` は noindex 済みなので実害は限定的） |
| 大会・活動詳細の hreflang | 個別ページに ja/zh 相互リンクが無い | ⬜ Phase 5 |
| `/ja/results/vol1..3` の言語別メタ | 未確認 | ⬜ Phase 5 |

### Search Console 観点（コードで解けるもの / 待つもの）

- **コードで解けた**: noindexページのsitemap送信（#7）／重複タイトル（ブログ・キャンセルポリシー）／`/zh/blog` の重複／記事の未送信
- **再クロール待ち**: 上記を本番反映した後、Indexed が増えるまで数日〜2週間。sitemap の再送信は反映後に1回
- **Excluded 約35 の内訳の推定**: 旧URLの301（意図どおり・放置でよい）／noindexページ／重複タイトルのブログ・キャンセルポリシー／ソフト404

---

## E. バドミントン SEO

### 現状の強み

- `venues`（会場ガイド・SportsActivityLocation schema）、`level-guide`、`faq`（FAQPage schema）、`activity`（FAQPage schema）、`tournaments/:id`（Event schema）が既にある。ローカル検索の土台は出来ている。
- 大会詳細の OGP は Worker が日付・会場・参加費まで入れて生成している（LINEシェアで効く）。

### 検索意図とページの対応

| 検索意図 | 受けるページ | 判定 |
|---|---|---|
| 川口 バドミントン 大会 / 蕨 バドミントン 大会 | `/ja/`（トップ＝大会案内） | ○ title・descriptionに地名あり |
| 埼玉 バドミントン 大会 | なし | ✕ 「埼玉県」がトップのtitle/H1に無い |
| バドミントン 大会 初心者 | `/ja/level-guide` | △ 「初心者」向けの説明はあるが「大会」との組合せが弱い |
| バドミントン 大会 一人参加 | `/ja/activity` のFAQに1問 | △ 専用の受け皿が無い |
| ミックスダブルス 大会 埼玉 | `/ja/tournaments/:id` に依存 | ✕ 大会が終わるとページごと消える＝恒常的な受け皿が無い |
| 川口 バドミントン / 蕨 バドミントン | トップ・`/ja/activity` | ○ |
| 埼玉 バドミントン サークル | なし | ✕ 「サークル」という語がサイト上にほぼ無い |
| バドミントン 一人参加 | `/ja/activity` FAQ | △ |
| バドミントン 初心者 埼玉 | `/ja/level-guide` | △ |
| 川口 国際交流 / 国際交流 バドミントン | **なし** | ✕ 最大の未回収。多国籍メンバー・中国語対応という独自性が、検索の受け皿を持っていない |
| 中国人 バドミントン 埼玉 / 外国人 バドミントン 埼玉 | なし | ✕ 同上 |

### keyword cannibalization

- トップ（`/ja/`）と `/ja/activity` が「川口・蕨 バドミントン」で競合しうる。ただし title は「大会」vs「通常活動」で分かれており、現状は軽微。
- `/ja/faq` と `/ja/activity` 内のFAQセクションが両方 FAQPage schema を出している。**同じ質問文を重複させないこと**（現状は別内容なのでOK。今後追記するときに注意）。
- `/ja/cancel-policy` と `/ja/ai-course/cancel-policy` はタイトルが似る。→ 前者を「大会キャンセルポリシー」と明示するようメタを修正済み。

### 打ち手（Phase 8）

1. **`/ja/international` — 国際交流ページ（新規）**。実際に来ている国籍（中国・ベトナム・インドネシア・フィリピン）、中国語での申込対応、WeChat窓口を、事実だけで書く。zh版も作る。「川口 国際交流」「外国人 バドミントン 埼玉」の受け皿。**これは軸1と軸2の自然な接点でもある**（SEOのために無理につなぐのではなく、実態としてつながっている唯一の場所）。
2. **`/ja/beginner` — 初参加ガイドの検索受け皿の強化**（Phase 4-3で作った初参加ガイドの内部リンクを増やす）。
3. **大会の恒常ページ**: `/ja/tournaments/:id` は終わると消える。「ミックスダブルス大会」「超初級ダブルス」など**種目ごとの恒常ページ**を作り、過去大会と次回募集をそこから束ねる。
4. トップの title に「埼玉」を入れるか検討（現在「川口・蕨」のみ）。→ 判断が要る（O-6）。

---

## F. AI日本語 SEO

### 現状

- LP（`/ja/ai-course` `/zh/ai-course`）は作り込みが厚い。Course schema・FAQPage schema・canonical・hreflang・OGP・Worker側プリレンダー・GA4イベント（view→pricing→application→lead→checkout→purchase）まで揃っている。
- 法務8ページも ja/zh で公開済み・sitemap掲載済み・Worker側でページ別タイトルを注入済み。
- **公開LPと認証アプリの分離は正しく出来ている**（§7の要件は満たしている）。`AiCourseEntry` が未認証→LP／認証済み→アプリへ振り分け、アプリ側は `noindex, nofollow`。管理画面・購入完了・デモも noindex。

### 問題

1. **検索の接点がLP1枚しかない。** クラスタが無いので、指名検索以外では出会えない。
2. Course schema に `hasCourseInstance` が無く、Googleのコースリッチリザルトの対象外だった → ✅ 追加
3. 広告用variantの hreflang が canonical と矛盾していた → ✅ 修正
4. **既定LP（duo）の `<title>` は「日本語の相棒」なのに、OGP（シェアカード）は「翔子先生とAI日本語会話コース」。** ページ名とシェアカード名が食い違っている → **O-1（CEO判断）**

### 検索需要について（推測で断定しない）

以下は **調査が必要なキーワード**。コードからは検索ボリュームが分からないため、順位や流入の見込みを断定しない。
Search Console の実データ（impressions が付いた語）と、Baidu/微信指数での確認が要る。

- 中国語: `AI学日语` / `AI日语学习` / `日语口语AI` / `AI日语对话` / `日语口语练习` / `日语会话练习` / `在日中国人 日语` / `JLPT N2 口语` / `JLPT N3 口语` / `日语会话` / `日语口语训练`
- 補足: **中国本土のユーザーはGoogleを使えない。** 中国語キーワードのGoogle検索需要は、主に**在日・在外の中国語話者**のもの。
  これは軸1のターゲット（在日中国人）と一致するので狙う価値はあるが、母数は中国本土向けSNS流入より小さいと見るべき。
  → **中国語ページはGoogle順位のためではなく「SNSから来た人が安心して申し込めるページ」として設計する**（§10の指摘どおり）。

---

## G. 中国語 UX / SEO

### 評価: SNSから来た中国人が安心して申し込めるか

| 項目 | 判定 | 根拠 |
|---|---|---|
| 中国語の自然さ（LP） | ○ | 「用半年，告别「看得懂却说不出」」等、日本語直訳感は薄い。ヘッダー・料金・FAQも zh 用に書き下ろされている |
| 中国語の自然さ（バドミントン側） | △ | 会場ガイド・FAQは自然。**ブログは日本語のみ**（今回 canonical で正直に処理） |
| シェアしたときの見え方 | **✕→○** | 素のHTMLが日本語だったため、微信・小紅書でシェアすると日本語カードが出ていた。今回修正 |
| CTA | ○ | LPに sticky CTA・料金への直行・体験パス |
| 料金説明 | ○ | 3プラン公開・比較表・PlanFit |
| 利用方法 | ○ | DailyLearningFlow・SixMonthRoadmap |
| 信頼要素 | △ | 実画面4枚は追加済み（P1-11）。**音声会話・レポート・成長記録の実画面が未提示**（P1-12・P0-1復旧後に撮影） |
| 返金 | ○ | `/zh/ai-course/cancel-policy` あり |
| 運営者 | △ | 特商法ページにはある。**LPからの導線は法務フッターのみで弱い** |
| 問い合わせ | ○ | `/zh/ai-course/contact`・WeChat ID コピー |
| FAQ | ○ | FAQPage schema 付き |
| mobile UX | ○ | 375px で実測済み（8/20） |
| WeChat等との相性 | **✕→○** | 上記のプリレンダー修正で解消。ただし**決済がカードのみ**（Alipay/WeChat Pay 未対応）＝ 最後で落ちる |

**最大のボトルネックは SEO ではなく決済。** 小紅書・微信から来た人がカードしか選べない（P0-6）。

---

## H. コンテンツ戦略

### AI日本語（Phase 7）

**AI生成の薄い記事は作らない。** 既に手元にある実データ・実教材・実会話ログに接続できるものだけを書く。

Pillar: **「読めるのに話せない」を終わらせる**（= LP）

| Cluster | 接続できる実体 | 優先 |
|---|---|---|
| JLPTに合格しても話せない理由 | 診断データ・N2 178項目の実在庫 | 高 |
| N2だけど話せない — 何が足りないのか | `effectiveContentLevel` の設計思想・実際の誤答傾向 | 高 |
| AIとの日本語会話練習は実際どうなのか | **実際の会話ログとレポート**（P0-1復旧済み。実発話ベースの言い直し素材が出る） | 高 |
| 日本で働くための日本語（会社・面接・電話） | 会話マップの実在チャプター | 中 |
| 場面別（コンビニ・病院・市役所・雑談） | 冒険マップの実在エリア | 中 |
| 日本語の敬語 | 敬語ミッションの実教材 | 中 |
| 日本語発音 | **接続できる実体が無い** → 今は書かない | 低 |

**書ける本数は「実体がある数」で決まる。無いものは書かない。**

### バドミントン（Phase 8）

E章の1〜3（国際交流ページ・初心者受け皿・種目別恒常ページ）。加えて、**大会レポート（ブログ）が今回はじめて sitemap に載る**ので、既存記事の効果をまず見る。

---

## I. 内部リンク

| 検出 | 内容 | 対応 |
|---|---|---|
| リダイレクト経由リンク | フッター9本が接頭辞なしURL | ✅ 修正 |
| 日本語→中国語の誤リンク | 上記により zh ユーザーが ja へ飛ばされていた | ✅ 修正 |
| 同上（ブログ） | 記事カード・戻るリンクが `/blog/:id` | ✅ 修正 |
| orphan page | `/ja/join` `/ja/shuttle-roadmap` `/ja/results/vol1..3` はナビから辿れない（sitemapのみ） | ⬜ Phase 5 |
| depthが深い | 大会結果 vol1-3 がトップから2クリック以上 | ⬜ Phase 5 |
| 重要なのにリンクが少ない | **AIコースLP**（フッター1本のみ） | ⬜ O-2（CEO判断） |
| 過剰リンク | なし |  |
| broken link | 検出なし |  |
| AI学習↔バドミントンの不自然なリンク | **現状は無い（良い）。** フッターの「関連サービス」に区切って置いてある形は妥当 | 維持 |

**方針: SEOのために2事業を無理にリンクしない。** 増やすなら「国際交流ページ」経由の、実態のある1本だけ。

---

## J. Schema

| 種別 | 使用箇所 | 判定 |
|---|---|---|
| Organization | トップ | △ `sport: バドミントン` 固定。AIコースも配下に見える → B章の親ブランド化と同時に見直す |
| WebSite | トップ | ○ |
| BreadcrumbList | 主要ページ＋今回ブログ・AIコースLPに追加 | ○ |
| Event | 大会詳細・活動詳細・results | ○ 実態と一致 |
| SportsActivityLocation | 会場ガイド | ○ |
| FAQPage | FAQ・活動一覧・AIコースLP | ○ |
| BlogPosting | ブログ詳細（今回追加） | ○ |
| Course | AIコースLP | ○ `hasCourseInstance` を追加 |
| Product / Offer | **使っていない** | **意図的にそのまま** |
| Person | 使っていない | 運営者ページを作るなら検討 |

**Course / Product / Offer のどれを使うべきか** → **Course（＋将来 offers）**。理由:
- 実態は「半年伴走の学習コース」であって物販ではない。`Product` は不適切。
- `offers` は**まだ出さない**。プランが3つあり、価格未確定のものが混ざる（`planCatalog` の draft）。実態と違う価格を schema で出すと、リッチリザルトに誤った価格が載る。価格が全て確定してから `Offer` を足す。
- LocalBusiness は**バドミントン側にも使わない**。実店舗を持たず、会場は公共施設の借用。`SportsActivityLocation`（会場）＋ `Organization`（団体）＋ `Event`（大会）の現構成が実態に合っている。Google Business Profile を作る場合も、住所を持たない団体としての扱いになる。

---

## K. コンバージョン

### 計測の到達点（GA4）

AIコース: `view_ai_course_lp` → `view_ai_course_pricing` → `begin_ai_course_application` / `click_ai_course_consultation` → `generate_lead` → `begin_checkout` → `purchase`。
バドミントン: `page_view` → `view_tournament` → `begin_application` → `generate_lead` → `begin_checkout` → `purchase`。
**§17の要求（organic landing → purchase まで追える）は満たしている。**

### 穴

1. **`ai_plan_applications` が実測0件**（バックアップ実データ）。相談経由＝10万円コースの唯一の入口が、DB上ゼロ。フォームが機能していないのか、単に到達者がいないのかの切り分けが要る → **O-3**
2. **相談リードにUTMが無い**（P1-14）。流入元が分からない。
3. **ファネルが1本で見られない**（P1-11）。前半GA4・後半DBで分断。
4. **決済がカードのみ**（P0-6）。中国語圏で最後に落ちる。
5. ログインできない人の復旧導線が無い（P1-8）。

### ページ別

| ページ | search intent | CTA | 判定 |
|---|---|---|---|
| `/ja/` トップ | 大会を探す | 大会カード＋特典登録バナー | ○ |
| `/ja/activity` | 一人で参加できる場を探す | 活動カード | ○ FAQ付きで意図に応えている |
| `/ja/level-guide` | どのクラスか判断 | **CTAが弱い**（判断した後の「申し込む」が無い） | △ Phase 9 |
| `/ja/venues` | 場所・アクセス確認 | **CTAが無い** | △ Phase 9 |
| `/ja/blog/:id` | レポートを読む | **CTAが無い**（記事末に次の大会への導線なし） | △ Phase 9 |
| `/ja/ai-course` | AI日本語学習を探す | sticky CTA・料金直行・体験パス | ○ |

---

## L. ブランディング / デザイン

- **バドミントン側**: ブルー基調・角丸2xl・カード・lucideアイコン。統一されている。8/14 の大会詳細ネイビー刷新は**本番未反映**（A-3）。
- **AIコース側**: アイボリー＋コーラル・`font-feature-settings: palt`・独自ヘッダー。**別サービスとして正しく分かれている。**
- **判定: 無理に同一デザインにする必要はない。** 現状の「別サービスとして理解しやすい」状態は保つべき。
- 直すべきは**接続部だけ**:
  - ヘッダーのブランド名が中国語ページでも日本語だった → ✅ 修正
  - AIコースLPのフッターに「運営: kawabado」の表記と運営者ページへの導線（B章）
  - `tactics-board` はコード上「非公開ページ・要認証ガード」と書かれているのに**ヘッダーナビに公開露出**している → **O-5**

---

## M. 優先度ロードマップ

| 優先 | 項目 | Impact | Effort | 状態 |
|---|---|---|---|---|
| **P0** | 中国語ページのプリレンダー | 高 | 中 | ✅ 実装済・本番デプロイ待ち |
| **P0** | 非公開URLの noindex 三重化 | 高 | 低 | ✅ 実装済・本番デプロイ待ち |
| **P0** | バドミントン法務ページの本番反映（特商法） | 高 | 低（マージのみ） | 🔴 CEO判断 |
| **P0** | 本番デプロイ元の分岐解消 | 高 | 中 | 🔴 CEO判断 |
| **P0** | Alipay / WeChat Pay 有効化 | 高 | 低（申請） | 🔴 CEO作業 |
| **P1** | ブログSEO（title/canonical/schema/sitemap） | 高 | 低 | ✅ 実装済 |
| **P1** | フッター言語別リンク | 中 | 低 | ✅ 実装済 |
| **P1** | sitemap の矛盾解消 | 中 | 低 | ✅ 実装済 |
| **P1** | 国際交流ページ（ja/zh） | 高 | 中 | ⬜ Phase 8 |
| **P1** | 相談リードのUTM・ファネル統合 | 高 | 中 | ⬜ Phase 9 |
| **P1** | 運営者ページ（about）＝ブランド接続＋E-E-A-T | 中 | 中 | ⬜ Phase 5 |
| **P2** | orphan page 解消・内部リンク整備 | 中 | 低 | ⬜ Phase 5 |
| **P2** | 大会・活動詳細の hreflang | 中 | 低 | ⬜ Phase 5 |
| **P2** | level-guide / venues / blog記事末のCTA | 中 | 低 | ⬜ Phase 9 |
| **P2** | 種目別の恒常ページ | 中 | 中 | ⬜ Phase 8 |
| **P3** | AI日本語コンテンツクラスタ | 高（長期） | 大 | ⬜ Phase 7 |
| **P3** | learn.kawabado.com への分離 | — | 大 | 🔴 条件成立時のみ |

## 実装フェーズ（再編）

- **Phase 5 — サイト構造・ブランド接続**: 運営者ページ、orphan解消、詳細ページのhreflang、Organization schemaの親ブランド化
- **Phase 6 — AI日本語LP仕上げ**: 実画面（音声・レポート・成長記録）の追加、OGP名称の統一、価格確定後の `Offer`
- **Phase 7 — コンテンツクラスタ**: 実体に接続できる記事だけ（H章の表の「高」から）
- **Phase 8 — Local / 国際交流**: 国際交流ページ、種目別恒常ページ、初心者受け皿
- **Phase 9 — Conversion**: UTM・ファネル統合・ページ別CTA・決済手段
- **Phase 10 — Growth Loop**: 紹介ループ（土台は P1-15 で実装済み・金額はCEO未確定）

---

## N. 今回実装した変更

| commit | 内容 | ファイル | テスト |
|---|---|---|---|
| `2512efd` | フッター内部リンクの言語対応・ヘッダーのブランド名中国語化 | `Footer.tsx` `Header.tsx` | 既存 |
| `6c185a8` | ブログ一覧・詳細のSEO（title/desc/canonical/OG/BlogPosting/パンくず/言語別リンク） | `BlogPage.tsx` `BlogDetailPage.tsx` `blogSeo.ts` | tsc |
| `478e3e7` | 素のHTMLの言語別化・非公開URLの noindex 三重化・sitemap修正・キャンセルポリシーのHelmet | `staticSeo.json` `privateRoutes.ts` `robots.txt` `generate-worker.mjs` `App.tsx` `CancelPolicyPage.tsx` | **新規 96件** |
| `05d7ae6` | AIコースLPの hreflang 矛盾解消・`hasCourseInstance`・BreadcrumbList | `AiCourseLandingPage.tsx` | 既存57件 |

- `tsc -b --noEmit`: エラー0
- `vitest run`: 2,968 / 2,973 pass。落ちる `advQuestParallel.test.ts` は**単体では成功し、変更前の状態でも同じ**＝既存の並列順依存のフレーク（今回の変更とは無関係）
- Worker はビルドして実応答を検証済み（`/zh/` が `lang="zh"`・中国語title・`zh_CN`、`/ja/admin` が `X-Robots-Tag: noindex`、sitemap から shoko/yuto が消え `/ja/blog` が残る）

**本番へは出していません。** `./scripts/deploy-staging.sh` → CEO確認 → `./scripts/deploy-production.sh` の順。

---

## O. 残タスク（CEOの判断・事実確認が必要）

| # | 内容 |
|---|---|
| **O-1** | **AIコースLPのシェアカード名。** ページタイトルは「日本語の相棒 / 你的日语搭档」なのに、OGP（微信・小紅書・LINEで出るカード）は「翔子先生とAI日本語会話コース / 翔子老师」。食い違っているので揃えたいが、**既に翔子老师の名前でシェアして認知が付いている可能性がある**ため勝手に変えていない。どちらに揃えるか |
| **O-2** | **AIコースへの導線をヘッダーにも出すか。** 現在フッター1本のみ。「SEOのために2事業を無理にリンクしない」方針と、コースを見つけてもらう必要のどちらを取るか |
| **O-3** | **`ai_plan_applications` が実測0件。** 相談フォームが壊れているのか、到達者がゼロなのか。実際に自分で1件送って確認してほしい |
| **O-4** | **`functions/` は実行されていない**（Worker が全部受けている）。`functions/sitemap.xml.ts` は古い内容の死んだコード、`functions/api/admin/shuttle-log.ts` も動いていない可能性がある。**シャトルログのAPIが必要な機能なら壊れている**。消してよいか／`shuttle-log` は使っているか |
| **O-5** | **`/ja/tactics-board`（戦術ボード）**。コードに「非公開ページ・認証ガードで囲んでください」と書いてあるのに、認証なしでヘッダーナビに出ている。今回 noindex にしたが、**ナビから外すか公開扱いにするか**は商品判断 |
| **O-6** | **トップページのタイトルに「埼玉」を入れるか。** 現在「川口・蕨」のみで「埼玉 バドミントン 大会」を取りこぼしている。ただしタイトル変更は既存順位に影響するので判断が要る |
| **O-7** | **`badminton-platform` ブランチの本番反映**（画像最適化・大会詳細刷新・未入金管理UI・**法務ページ**・entryDeadline 等 220ファイル）。特に**特商法・プライバシーポリシーが本番に無い**のは決済を伴う事業として先に塞ぐべき |
| **O-8** | Stripe の Alipay / WeChat Pay 有効化申請（CEO作業・P0-6） |

---

## P. リリース必須5項目

| # | 項目 | 判定 | 根拠 |
|---|---|---|---|
| ① | remote DB同期＋RLS | **INCOMPLETE** | `release-readiness-matrix.md` で `admin_overrides` が **fail（正式公開ブロッカー）**＝learnerが自己更新できるRLS問題が未解決のまま。remote適用（H2）も「CEOの承認待ち」で止まった記録のまま更新されていない。**staging と production が同一Supabaseを共有**しており、stagingでの検証が本番DBに書く構成 |
| ② | 実機確認 | **INCOMPLETE** | 8/23 の実生徒監査で P0 6件・P1 15件を検出。Edge Function 4本は本番デプロイ済みだが、**フロントエンドの本番反映が未実行**（CEOが実行する運びのまま）。P0-6（決済手段）・P1-8（ログイン復旧導線）は未着手 |
| ③ | 法務最小セット | **INCOMPLETE** | AIコース側は8ページ揃い公開済み（COMPLETE相当）。ただし**バドミントン側の特商法・プライバシー・利用規約が本番に存在しない**（`/ja/tokushoho` はソフト404）。さらに `legal-open-questions.md` に「特定継続的役務提供に当たるか未確認」が残っている |
| ④ | 公開教材範囲の人間確認 | **INCOMPLETE** | `release-readiness-matrix.md` の Curriculum に `human_decision` が4項目（root P0=1・P1=13・cognate不一致11語・fi-namae例文）。`copyright-and-rights-gate.md` の権利最終判断も人間のみと明記されている |
| ⑤ | バックアップ・監視・ロールバック | **COMPLETE** | バックアップ: launchd `com.kawabado.supabase-backup` が毎日 10:00 / 21:00 に全53テーブル＋auth_users をJSONダンプ。2026-08-23 分まで連続実行を実測確認（`✅ backup complete ... public 52テーブル + auth_users`）。監視: `daily-ops-check` launchd＋`ai_course_alerts` critical＋朝の点検ボード。ロールバック: Cloudflare Pages の deployment 一覧から直前へ戻す手順が `production-preflight.md` §7・`rollback-backup.md` に記載 |

**総合: ①〜④ INCOMPLETE / ⑤ COMPLETE。**
最初に塞ぐべきは **③のバドミントン側法務（決済を伴う事業で特商法が無い）** と **①の `admin_overrides` RLS**。

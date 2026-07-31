# 本番公開 入力パック（CEO記入用・これ1枚で完結）

作成: 2026-07-31 ／ 対象 RC: `ai-course-content-rc2`（code `57a8804`）

**このファイルに記入すれば、次の1セッションで本番公開まで進めます。**
記入後の実行手順は `pilot-release-execution.md`、
次セッションへ貼るpromptは `../autonomous-loop/production-release-prompt.md`。

記入の目安: 法務14項目 = 10〜15分 ／ 実機 = 20〜30分 ／ 教材目視 = 10分 ／ 環境確認 = 10分。

---

## A. 法務14項目

`src/lib/aiLesson/course/legal/legalFacts.ts` の `null` を埋めます。
**14項目すべてが必須**です（1つでも欠けると8ページは公開されません）。

「既存推奨案」は `legal-decision-packet.md` からの転記で、**私が新しく作った値ではありません**。
推奨案が無い項目は空欄です。事実は創作していません。

一括で承認する場合は **「L01〜L14、既存推奨案どおりで承認」** と書いてください。
推奨案が無い L01 / L12 / L14 だけは、必ず個別に値が要ります。

---

### L01 販売事業者名

- field: `operatorName`（string）
- 必須: はい
- 掲載: 特商法「販売事業者」
- 現在値: `null`
- 既存推奨案: 屋号「kawabado」＋**代表者名**（個人事業なら氏名の表示が要る）
- 根拠: `legal-decision-packet.md` #1
- **CEO入力**: `________________`
- validation: 2文字以上
- 未入力時: 特商法ページの「販売事業者」節が出ない＋8ページ全部が非公開

### L02 所在地

- field: `address`（string または `'on_request'`）
- 必須: はい
- 掲載: 特商法「所在地」
- 現在値: `null`
- 既存推奨案: `'on_request'`（「請求があれば遅滞なく開示します」方式）
- 根拠: `legal-decision-packet.md` #2。自宅住所を出さない一般的な運用
- **CEO入力**: `________________`
- validation: `'on_request'` か5文字以上の住所
- 未入力時: 特商法の「所在地」節が出ない＋全ページ非公開

### L03 電話番号

- field: `phone`（string または `'on_request'`）
- 必須: はい
- 掲載: 特商法「連絡先」
- 現在値: `null`
- 既存推奨案: `'on_request'`（メールは `info@kawabado.com`）
- 根拠: `legal-decision-packet.md` #2
- **CEO入力**: `________________`
- validation: `'on_request'` か数字を含む文字列
- 未入力時: 特商法の「連絡先」節が出ない＋全ページ非公開

### L04 販売価格（税込・円）

- field: `priceJpyTaxIncluded`（number）
- 必須: はい
- 掲載: 特商法「販売価格」
- 現在値: `null`
- 既存推奨案: `100000`（半年伴走コース ¥100,000 税込）
- 根拠: `legal-decision-packet.md` #4・CLAUDE.md の事業構成
- **CEO入力**: `________________`
- validation: 正の整数
- 未入力時: 特商法の「販売価格」節が出ない＋全ページ非公開

### L05 支払方法

- field: `paymentMethods`（string[]）
- 必須: はい
- 掲載: 特商法「支払方法」
- 現在値: `null`
- 既存推奨案: `['銀行振込']`（Stripeは休眠中のため、開始までは振込。稼働後に `'クレジットカード（Stripe）'` を追加）
- 根拠: `legal-decision-packet.md` #5・Stripeが未有効化である実装状況
- **CEO入力**: `________________`
- validation: 1件以上の文字列配列
- 未入力時: 特商法の「支払方法」節が出ない＋全ページ非公開

### L06 支払時期

- field: `paymentTiming`（string）
- 必須: はい
- 掲載: 特商法「支払時期」
- 現在値: `null`
- 既存推奨案: 申込時に一括
- 根拠: `legal-decision-packet.md` #5
- **CEO入力**: `________________`
- validation: 2文字以上
- 未入力時: 特商法の「支払時期」節が出ない＋全ページ非公開

### L07 役務の提供時期

- field: `serviceStartTiming`（string）
- 必須: はい
- 掲載: 特商法「役務の提供時期」
- 現在値: `null`
- 既存推奨案: 決済確認後、招待コードの発行をもって開始
- 根拠: `legal-decision-packet.md` #6
- **CEO入力**: `________________`
- validation: 2文字以上
- 未入力時: 特商法の「役務の提供時期」節が出ない＋全ページ非公開

### L08 返金・中途解約の方針

- field: `refundPolicy`（string）
- 必須: はい
- 掲載: 特商法「返品・キャンセル」＋キャンセル返金ページ「方針」（**2ページに出る**）
- 現在値: `null`
- 既存推奨案: 開始前は全額返金／開始後は未提供分を月割で返金
- 根拠: `legal-decision-packet.md` #7
- **CEO入力**: `________________`
- validation: 5文字以上
- 未入力時: 特商法とキャンセルページの両方から節が消える＋全ページ非公開

### L09 会話音声・履歴の保存期間

- field: `retentionPeriod`（string）
- 必須: はい
- 掲載: プライバシー「保存期間」
- 現在値: `null`
- 既存推奨案: なし（`../decision-packets/legal-draft-packet-20260730.md` §3-4 で「CEO方針待ち」とされている）
- 根拠: —
- **CEO入力**: `________________`（例の書式: 「受講終了後1年」「退会時に削除」など）
- validation: 2文字以上
- 未入力時: プライバシーの「保存期間」節が出ない＋全ページ非公開

### L10 削除申請への対応期限（日数）

- field: `deletionSlaDays`（number）
- 必須: はい
- 掲載: 学習データ削除「対応の期限」＋アカウント削除「対応の期限」（**2ページに出る**）
- 現在値: `null`
- 既存推奨案: `30`（申請から30日以内）
- 根拠: `legal-decision-packet.md` #10
- **CEO入力**: `________________`
- validation: 1〜180の整数
- 未入力時: 削除2ページから期限の節が消える＋全ページ非公開

### L11 学習者の発話を教材改善に使ってよいか

- field: `improvementUseAllowed`（boolean）
- 必須: はい
- 掲載: プライバシー「学習内容の改善への利用」
- 現在値: `null`
- 既存推奨案: `false` 寄り（#8「学習進捗の保存・学習内容の改善・連絡のみ。第三者提供なし」。ただし発話の二次利用可否は明示されていない）
- 根拠: `legal-decision-packet.md` #8（部分的）
- **CEO入力**: `true` / `false` → `________`
- validation: boolean
- 未入力時: プライバシーの当該節が出ない＋全ページ非公開
- 補足: `true` なら「個人を特定できない形に加工したうえで利用することがある」、`false` なら「利用しない」と表示されます

### L12 受講可能な最低年齢

- field: `minimumAge`（number）
- 必須: はい
- 掲載: 利用規約「第3条 受講資格」
- 現在値: `null`
- 既存推奨案: **なし**（`../decision-packets/legal-draft-packet-20260730.md` で「方針待ち」）
- 根拠: —
- **CEO入力**: `________`（18未満を認める場合は保護者同意の取り方も別途要検討）
- validation: 0〜30の整数
- 未入力時: 規約の第3条が出ない＋全ページ非公開

### L13 会話内容の送信先（外部AI事業者）

- field: `externalAiVendors`（string[]）
- 必須: はい
- 掲載: プライバシー「外部への送信」＋AI利用説明「外部の事業者へ送信されます」（**2ページに出る**）
- 現在値: `null`
- 既存推奨案: `['OpenAI']`（Edge Function の secret に `OPENAI_API_KEY` のみ存在することを実確認済み）
- 根拠: `../decision-packets/legal-draft-packet-20260730.md` §3-8＋`production-preflight.md` の secret 一覧
- **CEO入力**: `________________`
- validation: 1件以上の文字列配列
- 未入力時: プライバシーとAI説明の両方から送信先の節が消える＋全ページ非公開
- 補足: **プライバシー上いちばん重要な開示**です。他社を使っていれば必ず追加してください

### L14 準拠法・管轄

- field: `governingLaw`（string）
- 必須: はい
- 掲載: 利用規約「第7条 準拠法・管轄」
- 現在値: `null`
- 既存推奨案: **なし**（draft packet では「専門家確認前の希望」として日本法・運営者所在地の地裁を挙げているのみ）
- 根拠: —
- **CEO入力**: `________________`
- validation: 2文字以上
- 未入力時: 規約の第7条が出ない＋全ページ非公開

---

### 法務の公開条件（コードの実挙動）

| 条件 | 内容 |
|---|---|
| `LEGAL_PUBLISH` が true になる条件 | `pendingLegalFacts()` が空、つまり**上記14項目すべてが非null** |
| 8ページの公開 | `LEGAL_PUBLISH === true` のとき。false の間は route が404にならずコース入口へリダイレクト |
| LP footer 表示 | リンクは常時設置済み。公開前に踏むと入口へ戻る |
| 学習アプリ footer 表示 | 同上（8リンク・44pxタップ標的） |
| 申込同意チェック | `LEGAL_PUBLISH === true` のときだけ表示され、**未チェックでは送信不可**。false の間は表示しない（読めない文書に同意させないため） |
| AI利用説明 | 8ページの1つ。同意欄からもリンク |
| 学習データ削除の導線 | `/:lang/ai-course/data-deletion` ＋ プライバシーからの参照 |
| アカウント削除の導線 | `/:lang/ai-course/account-deletion` |
| `info@kawabado.com` | 問い合わせ・プライバシー・削除2ページ・キャンセルページに集約 |
| noindex | 未公開の間は `noindex,nofollow`。公開後は外れる |

**入力後に実行するcommand**

```bash
npm run validate:ai-course-legal
```

- 未入力fieldを一覧表示
- 形が不正なfieldをfield単位で表示
- `LEGAL_PUBLISH` の判定を表示
- ja/zh の route 対象数（16）を表示
- placeholder混入を検出
- PASS/FAIL を終了コードで返す

検査そのものが動くか確かめたい場合（実ファイルは変更しません）:

```bash
npm run validate:ai-course-legal -- --simulate-filled
```

---

## B. 実機チェック（20〜30分）

staging URL: **https://staging.badminton-platform.pages.dev/ja/ai-course?app=1**
中国語: 上の `/ja/` を `/zh/` に変えるだけ。

回答は **番号 + PASS / FAIL / NOT_TESTED** だけで結構です。FAILは一言添えてください。

### iPhone Safari

| # | 項目 | 期待 |
|---|---|---|
| D01 | login | 確認コードでログインできる |
| D02 | Home | 学習ホームが出る（白画面にならない） |
| D03 | World Map | ミナモ列島と10エリアが出る |
| D04 | Chapter | 章に入りQuestが進む |
| D05 | Vocabulary | ことば図鑑のカードに**絵が出ている** |
| D06 | N3 | N3エリアが開く |
| D07 | N2 | N2クエストが開く |
| D08 | AI text | テキスト会話で返事が返る |
| D09 | AI voice | 音声会話が始まる |
| D10 | microphone | マイク許可後に声が拾われる |
| D11 | audio output | 先生の音声が聞こえる |
| D12 | Chinese IME | 中国語キーボードで入力できる |
| D13 | reload | 再読み込みで続きから戻る |
| D14 | resume | 一度閉じても進捗が残る |
| D15 | Support | 「こまったとき」が開き送信できる |
| D16 | overflow | 横に見切れない・文字が切れない |

### Android Chrome

| # | 項目 |
|---|---|
| D17 | login |
| D18 | World Map |
| D19 | Chapter |
| D20 | Vocabulary |
| D21 | N3 |
| D22 | N2 |
| D23 | AI text |
| D24 | AI voice |
| D25 | microphone |
| D26 | audio output |
| D27 | Chinese IME |
| D28 | reload |
| D29 | cross-device resume（iPhoneで進めた続きがAndroidで見える） |
| D30 | Support |
| D31 | overflow |

### アクセシビリティ

| # | 項目 | 期待 |
|---|---|---|
| D32 | VoiceOver: Home / Map / Vocabulary | 絵の内容・読み込み中・AIの応答待ちが読み上げられる |
| D33 | TalkBack: 同上 | 同上 |
| D34 | 中国語表示での読み上げ | 中国語で読まれる（日本語が混ざらない） |

**回答欄**

```
D01 
D02 
...
D34 
```

---

## C. 公開教材の目視確認（10分）

**全140件を見る必要はありません。** Pilot公開を止めるほどの問題が無いかだけを確認します。

| # | 対象 | 見るところ |
|---|---|---|
| C01 | Chapter 1 と 8 | 開始→Quest 1完了までが破綻しない |
| C02 | ことば図鑑の一覧 | 絵が出ていて、明らかに意味と違う絵が無い |
| C03 | 方向語（行く/来る・入る/出る・乗る/降りる） | 矢印の向きが逆になっている |
| C04 | 自他の対（変わる/変える・決まる/決める） | 他動詞側にだけ人が描かれている |
| C05 | 感情語（嬉しい/悲しい/寂しい） | 表情と姿勢で区別できる |
| C06 | 抽象語（状況・理由・つまり） | 意味不明な図形になっていない |
| C07 | false friend / partial overlap 代表語 | 中国語の説明が誤解を生まない |
| C08 | 会話練習 3語ほど | その語に合った質問が出る |
| C09 | N3 / N2 代表教材 | 正解漏洩・複数正解が無い |
| C10 | Support / エラー文言 | 中国語表示で日本語が出ない |
| C11 | ja / zh 切替 | 主要画面で崩れない |

**回答**: `CONTENT_REVIEW_PASS` または `CONTENT_REVIEW_FAIL: <対象ID>`

この結果は **Pilot公開範囲のevidence** としてのみ使います。
教材の `human_reviewed` / `approved` を一括更新することはしません。

---

## D. 本番環境の確認

**秘密の値はこのファイルにもJSONにも書かないでください。** 状態だけを記入します。

記入値: `VERIFIED_PRESENT` / `SET_IN_CLOUDFLARE` / `MISSING` / `NOT_REQUIRED`

| # | 項目 | 用途 | client/server | 必須 | staging | production | 確認方法 | CEO記入 |
|---|---|---|---|---|---|---|---|---|
| E01 | Cloudflare project | 配信 | — | 必須 | `badminton-platform` | 同一project | `wrangler pages project list` | |
| E02 | production branch | 本番判定 | — | 必須 | `staging` | production branch | deploy時の `--branch` | |
| E03 | `VITE_SUPABASE_URL` | DB接続 | client | 必須 | 存在 | 同一（上書きなし） | `npm run validate:ai-course-env` | |
| E04 | `VITE_SUPABASE_ANON_KEY` | DB接続 | client | 必須 | 存在・`role=anon` 実確認 | 同上 | 同上 | |
| E05 | service_role が client に出ていない | 安全 | — | 必須 | **確認済み（露出0件）** | 同上 | 同上 | |
| E06 | Auth redirect URL | ログイン | server | 必須 | staging想定 | `kawabado.com` を許可 | Supabase Dashboard | |
| E07 | OAuth redirect | — | — | 任意 | 未使用 | 未使用 | — | `NOT_REQUIRED` |
| E08 | Edge Function URL | AI会話 | server | 必須 | 稼働 | 同一project | 会話が返ること | |
| E09 | `OPENAI_API_KEY` | AI応答 | **server only** | 必須 | 存在確認済み | 同一 | `supabase secrets list`（名前のみ） | |
| E10 | `STRIPE_SECRET_KEY` | 決済 | server | 任意 | 存在 | 休眠中 | 同上 | |
| E11 | `VITE_STRIPE_PUBLISHABLE_KEY` | 決済 | client | 任意 | — | 本番ビルド用に存在 | `.env.production` | |
| E12 | support email | 窓口 | — | 必須 | `info@kawabado.com` | 同一 | `validate:ai-course-legal` | |
| E13 | canonical base URL | SEO | — | 必須 | — | `https://kawabado.com` | 法務ページのcanonical | |
| E14 | CORS | API | server | 必須 | 稼働 | 本番originを許可 | 会話が返ること | |
| E15 | CSP | 安全 | — | 任意 | `public/_headers` | 同一 | — | |
| E16 | noindex | SEO | — | 必須 | 学習アプリはnoindex | 同一 | `validate:ai-course-env` | |
| E17 | source maps | 安全 | — | 必須 | 無効 | 無効 | 同上 | |
| E18 | monitoring | 運用 | — | 必須 | `daily-ops-check.mjs` | 同一 | launchd 10:00 | |
| E19 | previous production deploy ID | rollback先 | — | 必須 | — | **deploy直前に控える** | Cloudflare deployments | |
| E20 | rollback target | 復旧 | — | 必須 | — | 直前deployment | 同上 | |

**入力後に実行するcommand**

```bash
npm run validate:ai-course-env
```

現時点の結果: **P0 FAIL 0 / P1 FAIL 0**（構成側は問題なし）。
ダッシュボード上の実値確認は `VALUE_CONFIRMATION_DEFERRED_BY_CEO`。

---

## E. 本番リリース承認

上の A〜D が埋まったら、最後に次の行を追記してください。
**この文字列が無い限り、main統合も本番デプロイも実行されません。**

```
APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE
```

承認日: `__________`

---

## F. URL一覧（コードのrouteから抽出）

### staging（現在確認できる）

| 対象 | URL | 認証 |
|---|---|---|
| 日本語LP | https://staging.badminton-platform.pages.dev/ja/ai-course | 不要 |
| 中国語LP | https://staging.badminton-platform.pages.dev/zh/ai-course | 不要 |
| learner login / アプリ | https://staging.badminton-platform.pages.dev/ja/ai-course?app=1 | **認証必要** |
| World Map / Home | 同上（ログイン後の初期画面） | **認証必要** |
| Vocabulary | 同上 → 記憶の書庫 → カテゴリ選択 | **認証必要** |
| N3 | 同上 → Map → N3エリア | **認証必要** |
| N2 | 同上 → Map → ソラノ塔 | **認証必要** |
| Support | 同上 → 設定 → こまったとき | **認証必要** |
| 管理 | https://staging.badminton-platform.pages.dev/ja/ai-course/admin | **認証必要** |

法務16URL（未公開の間は `?legal=preview` を付けると中身が見えます）

| ja | zh |
|---|---|
| /ja/ai-course/terms | /zh/ai-course/terms |
| /ja/ai-course/privacy | /zh/ai-course/privacy |
| /ja/ai-course/ai-disclosure | /zh/ai-course/ai-disclosure |
| /ja/ai-course/tokushoho | /zh/ai-course/tokushoho |
| /ja/ai-course/cancel-policy | /zh/ai-course/cancel-policy |
| /ja/ai-course/data-deletion | /zh/ai-course/data-deletion |
| /ja/ai-course/account-deletion | /zh/ai-course/account-deletion |
| /ja/ai-course/contact | /zh/ai-course/contact |

### production（公開後の予定URL・同じrouteが `kawabado.com` に出る）

| 対象 | URL |
|---|---|
| 日本語LP | https://kawabado.com/ja/ai-course |
| 中国語LP | https://kawabado.com/zh/ai-course |
| learner login | https://kawabado.com/ja/ai-course?app=1（**認証必要**） |
| 法務16URL | `https://kawabado.com/{ja,zh}/ai-course/{terms,privacy,ai-disclosure,tokushoho,cancel-policy,data-deletion,account-deletion,contact}` |

---

## 記入テンプレート（コピーして返信）

```
【A. 法務】
L01〜L14、既存推奨案どおりで承認
（推奨案が無い項目は個別に）
L01 =
L09 =
L12 =
L14 =
（推奨案を変える項目だけ追記）

【B. 実機】
D01 PASS
...
D34 PASS

【C. 教材】
CONTENT_REVIEW_PASS

【D. 環境】
E01〜E20 確認済み（違う項目だけ記載）

【E. 承認】
APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE
```

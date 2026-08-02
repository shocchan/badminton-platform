# FLEXIBLE PLAN FOUNDATION 引継ぎ

作成: 2026-08-02
作成元 worktree: `~/badminton-aicourse`（branch `feature/ai-course-adventure-v2-final-completion`）
統合先 worktree: `~/badminton-sales`（branch `feature/ai-course-selfserve-sales`）

このセッションでは **migration適用・production deploy・main merge・Stripe変更・
bot対策の実装・別worktreeへの直接変更を一切していない。**

---

## 1. commit と push の状態

| 項目 | 実測値 |
|---|---|
| 対象commit | `eaae4ec` feat(ai-course): 商品カタログを正準化し、複数プランを表示・受付できる基盤を作る |
| branch | `feature/ai-course-adventure-v2-final-completion` |
| working tree | **clean**（未追跡・未コミットなし） |
| origin への push | ❌ **未push。** origin は `5ac9d9d` のままで、ローカルが **8 commits ahead** |

`origin` = `git@github.com:shocchan/badminton-platform.git`

### push しなくても統合できる

`~/badminton-aicourse` と `~/badminton-sales` は **同一リポジトリの git worktree** で、
オブジェクトDBを共有している。よって sales 側から `eaae4ec` を直接
cherry-pick / merge できる。**push は統合の前提条件ではない。**

push が要るのは次の場合だけ:
- 別マシンや別cloneから触る
- GitHub上にバックアップを残したい
- PRを作る

⚠️ push すると、同ブランチ上の**別セッションのcommit（`0257917` / `db1dcc4`）も一緒に公開される**。
実行前にそのセッションの了解を取ること。

---

## 2. 変更したファイル一覧（`db1dcc4..eaae4ec`）

### 新規（商品カタログまわり）

```
src/lib/aiLesson/course/plans/planCatalog.ts               ← 正準
src/lib/aiLesson/course/plans/planCatalog.test.ts
src/lib/aiLesson/course/plans/planApplication.ts
src/lib/aiLesson/course/plans/planApplication.test.ts
src/lib/aiLesson/course/plans/planApplicationRepository.ts
src/lib/aiLesson/course/legal/termsVersion.ts
src/lib/aiLesson/course/legal/termsVersion.test.ts
src/pages/ai-lesson/landing/ApplicationModal.tsx
src/pages/ai-lesson/landing/applicationModal.test.tsx
supabase/migrations/20260802000000_ai_course_plan_applications.sql   ← 未適用
docs/ai-course/PLAN_CATALOG.md
docs/ai-course/legal-open-questions.md
```

### 変更（カタログ参照へ切り替え・法務文言）

```
src/lib/aiLesson/course/legal/legalFacts.ts      価格をカタログから組み立て・返金を暫定表示へ
src/lib/aiLesson/course/legal/legalContent.ts    yen() 廃止 → pick()
src/pages/ai-lesson/landing/sectionsD.tsx        PricingSection をカタログ描画へ
src/pages/ai-lesson/landing/lpContent.ts         pricing から価格を削除・FAQ返金文言
src/pages/ai-lesson/landing/lpContent.test.ts
src/pages/ai-lesson/landing/AiCourseLandingPage.tsx  ApplicationModal と preview を接続
src/pages/ai-lesson/legal/legalPages.test.tsx
```

### 成長マップ改修（販売システムとは無関係。統合時に競合しにくい）

```
src/components/ai-course/adventure/AdvAdventureMap.tsx
src/components/ai-course/adventure/AdvMapLandmarks.tsx
src/components/ai-course/adventure/advAdventureMap.test.tsx
src/lib/aiLesson/course/adventure/advMapModel.ts
src/components/ai-course/CourseHeader.tsx        navHidden を追加
src/components/ai-course/courseHeader.test.tsx
src/pages/ai-lesson/AiCoursePage.tsx             V2入場画面のナビを隠す
scripts/ai-course/render-growth-map-sheet.tsx
docs/ai-course/adventure-v2/growth-map-visual-overhaul-report.md
docs/ai-course/adventure-v2/generated/growth-map-*.html / .css
```

⚠️ 成長マップ改修の**途中経過が、並行セッションの `git add -A` により `0257917`
（問題バンク監査）へ巻き込まれてcommitされている**。
巻き込まれたファイル: `AdvAdventureMap.tsx` / `AdvMapLandmarks.tsx` / `AdvShell.tsx` /
`advMapModel.ts` / `advMapModel.test.ts` / `render-growth-map-sheet.tsx` /
`growth-map-sheet.html`。
**`eaae4ec` だけを cherry-pick すると成長マップが壊れる。** 統合するなら
`db1dcc4..eaae4ec` の範囲、または `0257917` 以降をまとめて取ること。

---

## 3. 必要な migration 一覧

| ファイル | 状態 | 内容 |
|---|---|---|
| `supabase/migrations/20260802000000_ai_course_plan_applications.sql` | **未適用** | `ai_plan_applications` / `ai_terms_consents` の2テーブル＋RLS |

- **このセッションでは適用していない。** staging と production は同じ Supabase
  プロジェクト（`jdkwijdphlkrcoiggfqw`）を共有しているので、適用＝production変更になる
- `feature/ai-course-selfserve-sales`（`bc9dc4a`）は **migrationを1つも追加していない**（実測）
- 他の既存migrationの適用状態は、このセッションでは**確認していない**（DBに接続していないため）

### 適用前に決めること

販売システム側で Stripe決済・entitlement・再購入を持つなら、
申込テーブルの設計はそちらの購入テーブルと**重複する可能性が高い**。
先に統合方針を決めてから適用すること（下の §5-B）。

⚠️ 現在のRLSは **匿名ユーザーが insert できる**。広告を出す前に bot対策
（Turnstile 等、または Edge Function 経由のレート制限）が必須。
このセッションでは実装していない。

---

## 4. planCatalog の利用箇所

| ファイル | 使っているもの | 用途 |
|---|---|---|
| `src/lib/aiLesson/course/legal/legalFacts.ts` | `publishedPlans` / `PROVISIONAL_TERMS_NOTICE` | 特商法表記の販売価格・返金方針 |
| `src/pages/ai-lesson/landing/sectionsD.tsx` | `publishedPlans` / `allPlans` / `planView` / `acceptsApplication` | LP料金セクションの描画 |
| `src/pages/ai-lesson/landing/AiCourseLandingPage.tsx` | `isPlanPreview` / `PlanId` | preview判定・申込モーダルの開閉 |
| `src/pages/ai-lesson/landing/ApplicationModal.tsx` | `planById` / `planView` | 申込フォームの表示 |
| `src/lib/aiLesson/course/plans/planApplication.ts` | `planById` / `PlanConfig` / `PlanId` | 申込記録の組み立てと検証 |
| （テスト）`planCatalog.test.ts` / `planApplication.test.ts` / `applicationModal.test.tsx` | — | — |

`lpContent.ts` は**参照していない**（コメントで正準の場所を指しているだけ）。

**価格を書いてよいのは `planCatalog.ts` だけ。**
それ以外に商品価格が書かれていないことを `planCatalog.test.ts` の
「価格のハードコード」テストが機械検査している（教材の料金表とバドミントン側の参加費は除外）。

---

## 5. 別worktreeへ統合する際の注意点

### A.【最重要】PlanConfig が2つある

`feature/ai-course-selfserve-sales` は `1af1152` から分岐しており、
**`eaae4ec` を含まない**。その上で独自の PlanConfig を実装している。

| | このworktree（`eaae4ec`） | sales worktree（`bc9dc4a`） |
|---|---|---|
| ファイル | `lib/aiLesson/course/plans/planCatalog.ts` | `lib/aiLesson/course/sales/planConfig.ts` |
| 型名 | `PlanConfig` | `SalesPlanConfig` |
| プランID | `ai-trial-pass` / `ai-month` / `coach-6m` | **`ai-hour-pass`** / `ai-month` / `coach-6m` |
| 価格 | `priceLabelJa/Zh`（文字列のみ） | `priceAmount: number`（数値のみ） |
| 期間 | `durationLabelJa/Zh`（文字列） | `durationDays: number` / `validityDays` |
| AI時間 | `aiMinutes: number \| null` | `includedActiveMinutes: number \| null` |
| ctaMode | `apply` / `consult` / `checkout` | `checkout` / `consult`（`apply` なし） |
| version | あり（ハッシュで据え置き検出） | あり（同じ考え方で独立実装） |
| 返金文言 | `PROVISIONAL_TERMS_NOTICE`（暫定・断定しない） | 未確認 |
| アップセル/採算 | なし | `UpsellRule` / `PlanCostAssumption` あり |

**sales側のほうが機能的に上位**（Stripe・entitlement・アップセル・採算を持つ）。
統合の方向は **sales の `SalesPlanConfig` を正準にして、こちらの `planCatalog` を畳む**
のが自然。そのとき、こちらから持っていく価値があるのは次の4点:

1. **`priceLabelJa/Zh`（表示用の文字列）** — §6参照。未確定を「準備中」と書けるようにするため
2. **`PROVISIONAL_TERMS_NOTICE`** — 返金文言を商品ごとに固定せず暫定表示にする仕組み
3. **価格ハードコード0の機械検査**（`planCatalog.test.ts` の「価格のハードコード」describe）
4. **`displayedPriceLabel` を申込・購入記録に写し取る設計** — あとから価格を変えても
   「この人が見た価格」を再現できる

### B. 申込テーブルと購入テーブルの重複

こちらの `ai_plan_applications` は「申込を受けて人が個別に案内する」前提。
sales側は Stripe決済と entitlement を持つので、購入記録は別テーブルになるはず。
**両方を作らず、どちらかへ寄せること。** `ai_terms_consents`（同意記録）は
購入経路に依らず要るので、そのまま活かせる。

### C.【要確認】返金文言が撤回済みのcommitの上に乗っている

sales branch の分岐元 `1af1152` は
**「8日クーリング・オフ＋以降は原則返金なし」**を入れたcommit。
これは `eaae4ec` で **CEO判断により撤回**し、暫定表示へ置き換えている。

→ **sales worktree には現在、撤回済みの返金文言が残っている。**
統合前に `legalFacts.ts` の `refundPolicy` を確認し、暫定表示へ揃えること。
理由は `docs/ai-course/legal-open-questions.md`（特定継続的役務提供に当たるか未確認）。

### D. 料金の表示面が2つになる

- こちら: LP内の `PricingSection`（`sectionsD.tsx`・`#price`）
- sales側: 独立ルート `src/pages/ai-lesson/plans/PlansPage.tsx`

どちらを主にするか決めること。両方残すなら、**必ず同じ正準を読ませる**
（片方だけ古い価格が出るのが最悪）。

### E. 競合しないもの

成長マップ改修（`adventure/` 配下）と `CourseHeader.navHidden` は
販売システムと無関係。sales側が触っていないので、そのまま入る。

---

## 6.【引継ぎ】Stripe・採算計算には数値と表示の両方が要る

現在の `planCatalog` は**表示用の文字列しか持っていない**。
Stripe連携と採算集計には数値が要るので、統合後の正準は次の両方を持つこと。

```ts
priceAmount: number | null;   // 決済・採算計算に使う。未確定は null
priceLabelJa: string;         // 画面表示。未確定は「準備中」
priceLabelZh: string;         // 画面表示。未確定は「准备中」
```

ルール:
- **未確定価格は `priceAmount = null`、表示は「準備中」**
- `priceAmount === null` のプランは `status` を `published` にできない
  （＝決済できない商品を売り場に出さない）
- 表示は `priceLabel` を正とする。`priceAmount` から画面文字列を組み立てない
  （「累計60分まで」「6か月」など、数値だけでは表せない条件があるため）
- 申込・購入記録には **`displayedPriceLabel`（見た文字列）と `priceAmount`（請求額）の両方**を残す。
  片方だけだと「表示と請求が違った」ときに検証できない

sales側の現状は `priceAmount: number`（nullable でない）なので、
**`number | null` へ広げる変更が要る**。

⚠️ **この変更はこのセッションでは実装していない。販売システム側で行うこと。**

---

## 7. preview query `?plans=preview` の仕様

| 項目 | 内容 |
|---|---|
| 判定 | `isPlanPreview(search)` … `new URLSearchParams(search).get('plans') === 'preview'` |
| 実装 | `src/lib/aiLesson/course/plans/planCatalog.ts` |
| 読む場所 | `AiCourseLandingPage.tsx`（`window.location.search`）→ `PricingSection` の `preview` prop |
| ON のとき | `allPlans()` を描画（**`draft` も並ぶ**）。draft には「準備中（社内確認用）」バッジ |
| OFF のとき | `publishedPlans()` のみ。draft は DOM に出ない |
| 申込可否 | **preview でも `draft` は申込を受けない**（`acceptsApplication()` が false）。「いまは申込を受け付けていません」と表示 |
| 認証 | **なし。** URLを知っていれば誰でも見られる |
| 値の厳密さ | `?plans=1` や `?plans` では ONにならない（`preview` 完全一致のみ） |

確認URL: `https://staging.badminton-platform.pages.dev/ja/ai-course/shoko?plans=preview`

⚠️ 認証がないので、**未公開の価格をURLに載せて外部へ送らないこと**。
法務ページの `?legal=preview` と同じ流儀だが、あちらと同様に秘匿性は無い。

---

## 8. migration 未適用時の fallback 動作

`submitPlanApplication()`（`planApplicationRepository.ts`）は3値を返す。

| 戻り値 | 起きたこと | 画面 |
|---|---|---|
| `{ ok: true }` | 申込・同意の両方が保存できた | 「申込を受け付けました」＋プラン名と価格 |
| `{ ok: false, reason: 'store_unavailable' }` | テーブルが無い（**migration未適用**）。PostgREST の `42P01` / `PGRST205` / "does not exist" で判定 | 「いま申込を受け付けられませんでした」＋`info@kawabado.com` へのmailtoリンク |
| `{ ok: false, reason: 'failed', message }` | それ以外の保存失敗 | 同上 |

設計上の約束:

- **保存できなかったときに「送信できました」と出さない。**
  送れたと思わせて実際は消えている、が最悪の事故になる
- 失敗時は必ず**人へ繋ぐ導線**（メールアドレス＋件名にプラン名を入れた mailto）を出す
- 申込は入ったが同意が入らなかった場合、**申込は消さない**（連絡先は残したい）。
  同意の証拠が無いことは失敗として返し、人が拾えるようにする
- テストで固定済み（`applicationModal.test.tsx`）:
  「保存先が無いときは成功と言わず、メール連絡先を出す」
  「保存に失敗したときも成功と言わない」

### 現在の実効状態

全プランが `draft`（`ai-trial-pass` / `ai-month`）または `ctaMode: 'consult'`（`coach-6m`）なので、
**申込フォームは学習者に到達していない**。migration未適用でも実害は出ていない。

---

## 参照

- 運用手順: `docs/ai-course/PLAN_CATALOG.md`
- 法務の未確認事項: `docs/ai-course/legal-open-questions.md`
- 成長マップ改修: `docs/ai-course/adventure-v2/growth-map-visual-overhaul-report.md`

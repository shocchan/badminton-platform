# 商品カタログの運用（2026-08-02）

商品内容・価格・利用期間は今後変わる前提。**変更はこの1ファイルだけ**で完結する。

正準: [`src/lib/aiLesson/course/plans/planCatalog.ts`](../../src/lib/aiLesson/course/plans/planCatalog.ts)

---

## 1. 価格や内容を変えるとき

1. `planCatalog.ts` の該当プランを直す
2. **一度でも公開した版なら `version` を上げる**（申込記録に残るため）
3. `npm test` を走らせる。上げ忘れ・ハッシュのズレはテストが落ちて教えてくれる
4. テストが出す新しいハッシュを `planCatalog.test.ts` の `PLAN_FINGERPRINTS` に貼る

法務本文（`legalContent.ts` / `legalFacts.ts`）を直したときも同じ流れで
`termsVersion.ts` の `TERMS_VERSION` と `TERMS_CONTENT_HASH` を更新する。

### なぜ版が要るか

申込記録に残るのは `planVersion` と `termsVersion` だけ。
版を据え置いたまま内容を書き換えると、**「この人が何を見て、何に同意したか」を
あとから特定できなくなる**。争いになったとき手元に残る証拠がこれしかない。

---

## 2. 公開状態（status）

| 値 | 学習者に見えるか | 申込を受けるか |
|---|---|---|
| `draft` | 見えない（`?plans=preview` でCEOだけ見える） | 受けない |
| `published` | 見える | 受ける |
| `paused` | 見える（「受付を停止中」と出る） | 受けない |

価格が未確定のうちは `draft` にしておくこと。
`published` なのに価格が「準備中」だとテストが落ちる。

CEO確認用URL: `https://staging.badminton-platform.pages.dev/ja/ai-course/shoko?plans=preview`

---

## 3. ボタンの行き先（ctaMode）

| 値 | 動き |
|---|---|
| `apply` | 申込フォームが開く。申込と同意を記録し、人が確認して個別に案内する |
| `consult` | 個別相談（WeChat／メール）へ。いまの6か月コースはこれ |
| `checkout` | **使わない。** production Stripe を有効化していない（テストで使用を禁止している） |

---

## 4. いまの状態

| プラン | 価格 | 状態 | ボタン |
|---|---|---|---|
| AI体験パス | 600円（税込）／累計60分 | `draft` | `apply` |
| 1か月AIお試し | 準備中 | `draft` | `apply` |
| 6か月 AI日本語伴走コース | 100,000円（税込）／6か月 | `published` | `consult` |

**LPの見た目は改修前と変わっていない**（公開中は6か月コース1つ・CTAは無料個別相談）。
体験パスと1か月お試しは価格が確定していないので `draft` のまま。
確定したら `status` を `published` にするだけで出る。

---

## 5. 申込を実際に受けるには（未完了）

⚠️ **保存先テーブルのマイグレーションをまだ適用していない。**

`supabase/migrations/20260802000000_ai_course_plan_applications.sql`

staging と production は同じ Supabase プロジェクトを共有しているので、
適用＝production への変更になる。**CEOの許可を得てから実行すること。**

適用するまでは、申込フォームは送信に失敗し、
「いま申込を受け付けられませんでした」＋メール連絡先を出す。
**成功したふりはしない**（送れたと言って消えているのが最悪なので）。

いまは全プランが `draft` か `consult` なので、申込フォームは学習者に届いていない。

### 適用前にやること

広告を出して見知らぬ人が申し込む想定なら、**bot対策が先**。
いまの設計は匿名ユーザーが insert できるので、そのままだと荒らされる。
Turnstile などのCAPTCHAか、Edge Function経由のレート制限を挟むこと。

---

## 6. 今回やっていないこと

- 電子契約サービス連携
- 契約書面（概要書面・契約書面）の自動生成
- 返金額の自動計算
- production Stripe checkout
- 自動更新・年間プラン
- 商品ごとのDB設計変更

6か月伴走コースは、法的確認（→ [legal-open-questions.md](legal-open-questions.md)）が
終わるまで**手動契約フロー**とする。

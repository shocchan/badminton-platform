# Release Manifest — AI日本語コース Content RC1

作成: 2026-07-31 ／ 状態: **release candidate（本番未反映・main未merge・招待未送信）**

Phase B（会話文脈・Loading・横断品質・イラスト・lint）を終えた時点の凍結記録。
前段のインフラ側（migration/RLS/backup/rollback）は
`release-manifest-august-pilot.md` を参照。ここでは**中身の完成**だけを扱う。

---

## 1. コード

| 項目 | 値 |
|---|---|
| release branch | `feature/ai-course-learning-polish` |
| RC HEAD | 下記「RC tag」の指す commit |
| RC tag | `ai-course-content-rc2`（rc1 は `e85c3c8` を指したまま残す。上書きしない） |
| working tree | clean |
| origin push | 済 |
| main | 未merge（本番は従来系統のまま） |


### このRCで入ったcommit

| commit | 内容 |
|---|---|
| `14ae4f2` | 会話文脈140語のruntime接続を実証＋中国語訳の衝突を解消（B-2検収） |
| `702eb1d` | 待ち時間表示を共通化し主要20領域へ接続（B-3） |
| `af01f63` | 横断品質監査のP1修正（中国語learnerへの日本語露出）（B-5） |
| `df2580b` | 語彙イラスト140語を自前SVGで用意し学習者画面へ接続（B-4） |
| `ed92454` | 今回追加分のlintを0にする（B-6） |
| `8290177` | RC凍結の記録（docsのみ・コード変更なし） |
| `e72580d` | 法務8ページをja/zhで実装（Gate③のAI作業分） |
| （以降） | Gate①維持検証・認証済みstaging smoke・production preflight |

---

## 2. 検証結果（このHEADでの実測）

| 検査 | 結果 |
|---|---|
| tests | **1300 PASS / 0 FAIL**（Phase B開始時 1212 → +88） |
| tsc（`tsc -b`） | PASS |
| production build | PASS（`dist/_worker.js` 生成まで） |
| lint | 全体 **29E / 6W**（すべてバドミントン本体側の既存分）／**AIコース側 0E / 0W** |

> 注: `npx tsc --noEmit` は本環境のCLI proxy経由だと実エラーを取りこぼすことがあった。
> 型の判定は必ず `npm run build`（`tsc -b`）で行うこと。

---

## 3. 中身の完成度

| 項目 | 値 | 根拠 |
|---|---|---|
| Chapters | 10/10 playable | `696a515`・staging実測済み |
| 会話文脈データ | 140/140 | `conversationContextual.test.ts` |
| 会話文脈 runtime接続 | 140/140 | `conversationRuntime.test.tsx`（代表8分類を実レンダリング） |
| starter重複（ja/zh） | 0 / 0 | 同上 |
| dead context | 0 | `audit-conversation-contexts.mjs` |
| generic fallback誤落下 | 0 | `vocabConnectivity.test.ts` |
| Loading 接続 | 主要20領域 | `docs/ai-course/loading-manifest.md` |
| generic-only主要画面 | 0 | 同上 |
| イラスト asset | 140/140 | `vocabIllustration.test.ts` |
| イラスト learner visible | 140/140 | `vocabIllustrationRender.test.tsx` |
| broken asset | 0 | 同上 |
| human_approved（SVG） | 0（一括昇格していない） | `vocabIllustration.test.ts` |

---

## 4. 本番環境との差分

このRCはコード・教材・assetのみ。**DBスキーマ・RLS・Edge Function・環境変数の変更は含まない**
（それらは `release-manifest-august-pilot.md` の GATE① で適用済み）。

| 種別 | 差分 |
|---|---|
| migration | なし（このRCでは追加していない） |
| RLS | なし |
| Edge Function | なし |
| 環境変数 | なし |
| 静的asset | なし（イラストはSVGでコード内に持つ＝publicへのファイル追加なし） |

---

## 5. デプロイ手順（承認後に実行する）

```bash
# 1. RCの位置を確定する
git checkout feature/ai-course-learning-polish
git rev-parse HEAD          # ed92454 であることを確認

# 2. staging で最終確認（本番より先に必ず通す）
npm run build
npx wrangler pages deploy dist --project-name badminton-platform --branch staging

# 3. 本番は CEO の明示承認後のみ
#    承認文字列: APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE
```

## 6. post-deploy smoke（5分）

1. `/ja/ai-course` が開く（LPまたは学習アプリ）
2. `/zh/ai-course` で中国語表示になる
3. ことば図鑑を開き、語のカードに**絵が出ている**
4. 語を開いて会話練習を始め、その語固有の質問が出る
5. 章を1つ開いてQuestが進む
6. 設定の「こまったとき」を中国語表示で開き、日本語が出ていない
7. DevToolsのconsoleにerrorが出ていない

## 7. rollback

| 引き金 | 対応 |
|---|---|
| 学習画面が白い / chunk読み込み失敗 | 直前のPages deploymentへロールバック |
| 進捗が保存されない | 同上。DBは触っていないのでコード戻しだけで戻る |
| 絵が出ない・崩れる | 同上（SVGはコード内なのでasset欠落は起きない） |

前deployへの復帰は Cloudflare Pages の deployment 一覧から「Rollback」。
DB変更を含まないため、**このRCのロールバックにDB操作は不要**。

---

## 8. 既知の残（このRCに含めて出す）

### P2 — 仕様判断が要るもの（CEO確認待ち）

| ID | 内容 |
|---|---|
| P2-A | レッスンレポートの `achievements` / `encouragementJa` が日本語のみ（schema上そうなっている）。`todaySummaryZh` は中国語がある。日本語学習コースとして日本語で見せる設計なのか、中国語も要るのかは仕様判断 |
| P2-B | LPの学習画面スクリーンショットが未撮影のため枠ごと非表示（`SHOW_SCREENSHOT_FRAME = false`）。実画像が入ったら true に戻す |

### P3 — 後回しでよいもの

| ID | 内容 |
|---|---|
| P3-A | イラストのうち抽象語（中国・日本・状況・関係・情報・理由・副詞類）は絵として弱い。差し替え優先度1〜3を `illustration-policy.md` に記載 |
| P3-B | バドミントン本体側に素の `animate-spin` が残る（reduced-motionで止まらない）。`MyPage.tsx` の `aria-label="読み込み中"` も未i18n |

### lint 残 29件（すべてバドミントン本体側・AIコース側は0）

| file | rule | 件数 | risk | 直さなかった理由 | 安全な次手 |
|---|---|---|---|---|---|
| `src/components/TacticsBoard.tsx` | refs / immutability / preserve-manual-memoization | 13 | 高 | canvasの描画状態をrefで持つ作戦ボード。テスト無しで参照の持ち方を変えると描画が壊れる | 先にcanvas描画のテストを足してから着手 |
| `src/pages/AdminPage.tsx` | set-state-in-effect / immutability | 4 | 高 | 本番大会運営の管理画面。fetch effectの並びを変えると一覧取得が壊れる | 関数宣言の巻き上げ解消だけを単独PRで |
| `src/pages/MyPage.tsx` | set-state-in-effect | 2 | 中 | 参加者のマイページ。取得順の変更が表示に出る | 同上 |
| `src/pages/CancelEntryPage.tsx` | set-state-in-effect / immutability | 2 | 中 | キャンセル導線。誤動作が申込データに影響しうる | 同上 |
| `src/components/ui/Toast.tsx` | react-refresh/only-export-components | 2 | 低 | dev時のHMRのみの問題。exportの分離が全画面のimportへ波及する | 別PRでexportを分離 |
| `src/contexts/LanguageContext.tsx` | react-refresh/only-export-components | 1 | 低 | 同上（`useLanguage` の分離は影響範囲が広い） | 同上 |
| `src/components/seo/EventSchema.tsx` | react-refresh/only-export-components | 1 | 低 | 同上 | 同上 |
| `src/hooks/useTournaments.ts` / `useBlogPosts.ts` | set-state-in-effect | 2 | 中 | 大会・ブログ一覧の取得。全ページが依存する | 単独PRで検証つき |
| `src/components/admin/ShuttleAdminPanel.tsx` | set-state-in-effect | 1 | 中 | 管理画面 | 同上 |
| `src/pages/ActivityPage.tsx` | static-components | 1 | 中 | render中のcomponent生成。切り出しで再マウント挙動が変わりうる | 同上 |

warnings 6件はすべて `react-hooks/exhaustive-deps`（同ファイル群）。

**この29件を0と偽らない。** AIコースのリリースには影響しないが、残っている。

---

## 9. 人間ゲート（CEO決定 2026-07-31: 本番公開直前にまとめて実施）

CEOの決定により、以下は**本番公開直前・本番用の認証情報や承認を渡す前に**
CEO本人がまとめて実施する。コード側の完成を待たせないため、
BLOCKED ではなく **DEFERRED_BY_CEO_UNTIL_RELEASE** として扱う。

| ゲート | 状態 | コード側の準備 |
|---|---|---|
| ① Remote DB・RLS・Server Sync | **COMPLETE** | `gate1-integrity-recheck.md`（read-onlyで再照合・baseline完全一致） |
| ⑤ Backup・Monitoring・Rollback | **COMPLETE** | GATE⑤ |
| 実機確認（iPhone/Android/VO/TalkBack） | DEFERRED_BY_CEO_UNTIL_RELEASE | `device-check-packet.md`（20〜30分・番号にPASS/FAILで回答） |
| 法務事実の最終確認 | DEFERRED_BY_CEO_UNTIL_RELEASE | **Legal Code Complete**。`legalFacts.ts` の14項目を埋めるだけで公開される |
| 公開教材範囲の目視 | DEFERRED_BY_CEO_UNTIL_RELEASE | 教材はruntime接続・test・staging確認まで完了。昇格は未実施 |
| Learner account／invite | DEFERRED_BY_CEO_UNTIL_RELEASE | Release Operations Phase（今回は実装も発行もしない） |
| production認証情報・承認 | DEFERRED_BY_CEO_UNTIL_RELEASE | `verify-production-env.mjs` で構成側は P0 0 / P1 0 |

### 法務: コード側は完成済み

| 項目 | 状態 |
|---|---|
| 8ページ ja/zh | 完了 |
| route（16URL） | 完了・staging で全 **200** |
| LP footer | 8リンク（従来0本） |
| 学習アプリ footer | 8リンク |
| 申込前の同意チェック | 完了（未公開のあいだは同意欄自体を出さない＝読めない文書に同意させない） |
| 削除申請・アカウント削除の導線 | 完了 |
| mobile タップ標的 | 44px |
| noindex（未公開時） | 完了 |
| canonical / hreflang | 完了 |
| tests | 22件（legal 17 + consent 5） |

**残るのは `src/lib/aiLesson/course/legal/legalFacts.ts` の null 14項目のみ。**
値を入れると `LEGAL_PUBLISH` が自動で true になり、8ページが公開され同意チェックが有効になる。

`operatorName` / `address` / `phone` / `priceJpyTaxIncluded` / `paymentMethods` /
`paymentTiming` / `serviceStartTiming` / `refundPolicy` / `retentionPeriod` /
`deletionSlaDays` / `improvementUseAllowed` / `minimumAge` / `externalAiVendors` / `governingLaw`

専門家レビューは Public General Release の条件とし、August Pilot とは分離する。

## 10. 本番環境の検査

`node scripts/ai-course/verify-production-env.mjs` → **P0 FAIL 0 / P1 FAIL 0**

- `VITE_` 接頭辞での秘密露出 **0件**
- ソースへの秘密ベタ書き **0件**
- クライアント鍵が service_role でない（JWT `role=anon` を実確認）
- source map 無効 / 学習アプリ noindex / 窓口が info@kawabado.com に集約
- Supabase は staging と production で同一プロジェクト（既知の構成・fixture作法で運用）

ダッシュボード上の実値確認は **VALUE_CONFIRMATION_DEFERRED_BY_CEO**。

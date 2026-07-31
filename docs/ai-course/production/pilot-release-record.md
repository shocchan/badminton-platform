# August Pilot 本番リリース 実施記録（2026-07-31）

CEO承認 `APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE`（3名限定Pilot）に基づき実施。

## デプロイ

| 項目 | 値 |
|---|---|
| RC tag | `ai-course-content-rc3`（code `6bb024d`） |
| main HEAD | `026e226`（merge commit・push済） |
| production deployment | `https://f7b401b6.badminton-platform.pages.dev` → `kawabado.com` |
| **rollback先（直前のproduction）** | **`c27eba9b-77d6-413a-abc3-33befd9368e6`**（main `9f8838a`） |
| DB変更 | **なし**（migration / RLS / Edge Function / env の差分0）→ rollbackはコード戻しのみ |

### main統合で発生した事象（自動解決していないもの）

- ローカル`main`とorigin/mainが分岐していた（ローカル58先行／リモート4先行）。
  リモート4件は `.claude/settings.json`（Claude Code権限設定）のみ。先に `git merge origin/main` で取り込み（衝突なし）
- feature統合時に `.claude/settings.json` で add/add 衝突。**製品コードではない**ため停止せず、
  **CEOが直近に明示コミットした origin/main 側**を採用（payment/production のガードを保持する版）。
  製品コードの衝突は0件

## post-deploy smoke（kawabado.com・実測）

| # | 確認 | 結果 |
|---|---|---|
| 1 | `/ja/ai-course` | PASS（h1「読めるのに、話せない」を半年で終わらせる。） |
| 2 | `/zh/ai-course/tokushoho` | PASS（全文中国語・かな混入0） |
| 3 | 法務16URL（ja8+zh8） | **全200** |
| 4 | LP footer 法務リンク | 8本・タップ標的44px |
| 5 | 学習アプリ footer 法務リンク | 8本 |
| 6 | 申込同意チェック | 表示・**未チェックで送信ボタンdisabled**・3リンク正常 |
| 7 | ログイン（合成fixture） | PASS |
| 8 | World Map | PASS（ミナモ列島・10エリア） |
| 9 | ことば図鑑の語彙イラスト | **56枚描画**・`role="img"`・語ごとのalt |
| 10 | canonical | `https://kawabado.com/zh/ai-course/tokushoho` |
| 11 | hreflang | ja / zh |
| 12 | noindex除去 | 法務ページから外れた（学習アプリ本体はnoindexのまま＝正） |
| 13 | console error | **0** |
| 14 | 横スクロール | 0 |

### fixtureの出入り（前後完全一致）

| 指標 | 作成前 | 撤去後 |
|---|---|---|
| auth.users | 5 | **5** |
| ai_learners | 1 | **1** |
| ai_item_progress | 12 | **12** |
| ai_learning_sessions | 24 | **24** |
| `%.invalid` 残存 | 0 | **0** |

既存learner・Andyさんのデータには触れていない。

## 実施していないこと（CEO指示どおり）

- learner account の作成
- invite の送信
- Stripe本番課金の開始
- 一般公開（今回は3名限定Pilotの公開のみ）
- 教材の `human_reviewed` / `approved` への一括昇格

## 既知の残（P3）

- 中国語の特商法ページで販売価格が `100,000円（税込）` と日本語表記のまま
  （金額・通貨は伝わるが、`100,000日元（含税）` のほうが自然）。表示のみの軽微な問題
- バドミントン本体側 lint 29E/6W（AIコースとは無関係・既存分）

## rollback手順（必要になった場合）

```bash
npx wrangler pages deployment list --project-name badminton-platform
# c27eba9b-77d6-413a-abc3-33befd9368e6 へ Rollback（Cloudflare Dashboardからでも可）
```

DB変更を含まないため、**rollbackにDB操作は不要**。

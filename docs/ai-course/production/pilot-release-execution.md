# Pilot 本番リリース 実行手順

前提: `final-release-input.md` の A〜E がすべて記入済みであること。
**承認文字列 `APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE` が無い場合、Phase 3 以降へ進まない。**

対象 RC: `ai-course-content-rc2`（code `57a8804`）
branch: `feature/ai-course-learning-polish` → `main`

---

## Phase 1 — CEO入力の取り込み

| # | 作業 | 完了条件 |
|---|---|---|
| 1-1 | `legalFacts.ts` の14項目へCEOの値を記入 | `npm run validate:ai-course-legal` が **PASS** |
| 1-2 | 実機結果を `human-gate-evidence.md` へ日付・確認者つきで記録 | D01〜D34 が PASS / FAIL / NOT_TESTED で埋まる |
| 1-3 | 教材目視結果を同ファイルへ記録 | `CONTENT_REVIEW_PASS` または FAIL対象ID |
| 1-4 | 本番env確認結果（E01〜E20）を記録 | `npm run validate:ai-course-env` が P0 0 |
| 1-5 | 承認文字列の受領を記録 | 文字列が完全一致で存在 |

**FAILがある場合**: P0/P1 は Phase 2 へ進まず先に修正する。P2/P3 は known issues へ記録して続行してよい。

---

## Phase 2 — Preflight（すべてPASSで次へ）

```bash
cd /Users/shocchan/badminton-platform

git status --short --branch          # clean であること
git branch --show-current            # feature/ai-course-learning-polish
git rev-parse --short HEAD

npm run validate:ai-course-legal     # PASS（LEGAL_PUBLISH: true）
npm run validate:ai-course-env       # P0 FAIL 0
npx vitest run                       # 全PASS
npm run build                        # tsc -b + vite build + worker生成
npx eslint src/components/ai-course src/pages/ai-lesson src/lib/aiLesson   # AIコース側 0E/0W
node scripts/ai-course/audit-release-inventory.mjs   # chapters10・context140・illustration140
```

証跡の再確認（read-onlyのみ・remote writeしない）:

| 対象 | ファイル |
|---|---|
| migration / RLS / sync | `gate1-integrity-recheck.md`・`ceo-decisions-20260730.json` |
| backup / restore / rollback | `release-manifest-august-pilot.md`・`rollback-backup.md` |
| 認証済みsmoke | `authenticated-staging-smoke.md` |
| a11y / mobile | `accessibility-mobile-smoke.md` |

staging で法務公開後の姿を確認:

```bash
npm run build
npx wrangler pages deploy dist --project-name badminton-platform --branch staging
```

- `/ja/ai-course/terms` 〜 `/zh/ai-course/contact` の16URLが **preview無しで** 表示される
- LP・学習アプリ両方のfooterから8ページへ行ける
- ログイン画面に同意チェックが出て、未チェックでは送信できない
- console error 0

---

## Phase 3 — main統合（承認文字列がある場合のみ）

```bash
git checkout main
git pull origin main
git merge --no-ff feature/ai-course-learning-polish -m "feat(ai-course): August Pilot リリース（RC ai-course-content-rc2 + 法務事実）"
```

- merge方式: **`--no-ff`**（履歴に統合点を残す）
- **conflict が出たら即停止**し、解消方針をCEOへ確認してからにする。自動解決しない
- 統合後: `npx vitest run` と `npm run build` を再実行し、両方PASSであること
- expected: main の HEAD が新しいmerge commit、`git log --oneline -1` で確認

```bash
git push origin main
```

---

## Phase 4 — production deploy

```bash
# 直前のdeployment IDを控える（rollback先。控えるまでdeployしない）
npx wrangler pages deployment list --project-name badminton-platform | head -5

npm run build
npx wrangler pages deploy dist --project-name badminton-platform --branch main
```

- Cloudflare project: `badminton-platform`（`kawabado.com` と同一project）
- **`--branch` を間違えると意図せず本番/stagingへ出る。必ず確認する**
- expected: `Deployment complete!` と `kawabado.com` への反映
- 新しい deploy ID を `human-gate-evidence.md` へ記録

---

## Phase 5 — post-deploy smoke（kawabado.com・10分）

| # | 確認 | 期待 |
|---|---|---|
| 1 | `/ja/ai-course` | 日本語LPが開く |
| 2 | `/zh/ai-course` | 中国語LPが開く |
| 3 | login | 確認コードでログインできる |
| 4 | Home | 学習ホームが出る |
| 5 | World Map | 10エリアが出る |
| 6 | Chapter | 章に入りQuestが進む |
| 7 | Vocabulary | カードに絵が出る |
| 8 | N3 | エリアが開く |
| 9 | N2 | クエストが開く |
| 10 | AI text | 返事が返る |
| 11 | AI voice | 音声が始まる |
| 12 | 法務16URL | すべて表示（404なし） |
| 13 | 同意チェック | 表示され、未チェックで送信不可 |
| 14 | Support | 中国語表示で日本語が出ない |
| 15 | DB sync | 進捗が保存され、再読込で戻る |
| 16 | console | error 0 |
| 17 | mobile | 横スクロールなし |
| 18 | canonical | `https://kawabado.com/...` を指す |
| 19 | hreflang | ja/zh の相互参照がある |
| 20 | noindex除去 | **法務ページから noindex が外れている**（学習アプリ本体は noindex のままが正しい） |

---

## Phase 6 — rollback

### 引き金（1つでも該当したら即実行）

- 学習画面が白い / chunk読み込み失敗
- ログインできない
- 進捗が保存されない
- 法務ページが404
- console に継続的なerror
- 決済・課金まわりの異常

### 手順

```bash
npx wrangler pages deployment list --project-name badminton-platform
# Phase 4 で控えた直前のdeployment IDへ Rollback
```

Cloudflare Dashboard の Deployments 一覧から該当deploymentの **Rollback** でも可。

### DB変更の有無

**このリリースはDB変更を含まない**（migration・RLS・Edge Function・env の差分なし）。
したがって **rollbackにDB操作は不要**。コードを戻すだけで元に戻る。

### incident evidence

- 発生時刻・症状・引き金・実行したrollback・復旧確認時刻を
  `docs/ai-course/production/incident-response.md` の様式で記録する

---

## 実行しないこと

- 学習者への招待送信（Release Operations Phase で別途）
- learner個別データの作成・変更
- Stripe本番課金の開始
- 教材の `human_reviewed` / `approved` への一括昇格

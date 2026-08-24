# WAVE 0 — 本番基準点の固定（2026-08-24）

このリリース作業のすべての判断は、この基準点を「正」として行う。
**main は正ではない。** main は 2026-08-02 の d826330 で停止しており、AIコースの機能を1行も含まない。

## 0-1. 現本番 HEAD（実測で確定）

| 項目 | 値 |
|---|---|
| ブランチ | `feature/ai-course-adventure-v2-final-completion` |
| commit | `c61150931997a2c6e7b03fdd09a5f6b3e95e4bee` |
| 配信 asset | `assets/index-DnQ4U3dQ.js` |
| デプロイ時刻 | 2026-08-24 11:28:17 +0900 |
| 配信基盤 | Cloudflare Pages（Advanced mode / `dist/_worker.js`）／ project `badminton-platform` / branch `main` |
| ビルド元 | `~/badminton-aicourse`（production worktree）で `npm run build` |

### 「本番 == c611509 である」ことの根拠

production worktree には未コミット変更が残っているが、**src/ の変更はすべてデプロイより後**であることを mtime で確認した。

```
2026-08-24 11:28:02  dist/_worker.js          ← デプロイ時のビルド成果物
2026-08-24 11:28:17  docs/PRODUCTION_STATE.txt
2026-08-24 12:32:35  src/lib/aiLesson/course/adventure/advTypes.ts   ← デプロイ後
2026-08-24 12:32:41  src/lib/aiLesson/course/adventure/advProfile.ts ← デプロイ後
2026-08-24 12:34:31  src/components/ai-course/adventure/AdvShell.tsx ← デプロイ後
2026-08-24 12:43:34  src/components/ai-course/adventure/AdvPersonalPackRunner.tsx（未追跡・デプロイ後）
```

デプロイ前から未コミットだったのは docs/scripts のみでビルド入力ではない。
したがって **本番の再現手順は `git checkout c611509 && npm run build`** で足りる。

### ⚠️ production worktree には進行中の別作業がある

`~/badminton-aicourse` には 2026-08-24 12:32〜12:43 の未コミット作業
（`AdvPersonalPackRunner.tsx` / `issue-personal-pack.mjs` / `AdvShell.tsx` 改変）がある。
**このリリース作業では `~/badminton-aicourse` を一切変更しない。**

## 0-2. 統合ブランチ

| 項目 | 値 |
|---|---|
| ブランチ | `release/assetization-2026-08` |
| 分岐元 | `c611509`（＝現本番、そのもの） |
| worktree | `/Users/shocchan/badminton-sales` |

`~/badminton-sales` は元々 `feature/ai-course-selfserve-sales` が checkout されていたが、
同ブランチは本番の `src/lib/aiLesson/course/plans/` に置き換えられた**死んだ並行実装**であり、
ブランチ ref 自体は残っているので `git worktree add <path> feature/ai-course-selfserve-sales` でいつでも復元できる。

## 0-3. 差分マップ（どこに完成品があるか）

### merge-base

| 比較 | merge-base | 意味 |
|---|---|---|
| 本番 vs `security/rls-hardening-and-quality` | `0e08833`（2026-07-31） | security 側は**AIコースを1行も持たない**（AdvShell なし・planCatalog なし） |
| 本番 vs `feature/ai-course-secure-runtime-review` | `7023539` | secure-runtime は AdvShell / planCatalog を持つが**本番より 172 commit 古い** |

### `security/rls-hardening-and-quality`（本番比 +13 commit）

`git diff --stat c611509 security/... -- src supabase scripts public` は
**1,161 files changed, 4,979 insertions, 117,694 deletions**。
削除の大半は本番にしか無い Adventure V2 と 30本超の migration。
→ **このブランチを merge すると本番機能が消える。cherry-pick / ファイル単位移植のみ。**

回収対象（commit 単位）:

| commit | 内容 | 回収方針 |
|---|---|---|
| `8d6bd20` `810036b` | バド本体の特商法・プライバシー・利用規約 | ファイル移植＋App.tsx にルート追加 |
| `aceaed1` | 未入金管理UI（入金確認・未入金フィルタ・一括削除） | AdminPage.tsx へ差分移植 |
| `053d44e` | 申込締切ロジック・**Analytics 配線**・遅延申込 migration | EntryForm の計測配線だけを抜く |
| `e62501d` | セキュリティヘッダー・TS strict化・バド本体テスト | ヘッダーのみ回収候補 |
| `09e1ac4` | 画像最適化 Phase 1 | 今回スコープ外 |
| `1f2d4cc` | 大会詳細ネイビー刷新 | **本番に取り込み済み**（回収不要） |
| `1b7f002` | 個人情報の公開読み取りRPC化 | **本番に同等の migration あり**（要確認・重複適用禁止） |

### `feature/ai-course-secure-runtime-review`（本番比 +35 commit / src・worker・supabase）

本番にあって secure-runtime に無い commit が **172本**。
`AdvShell.tsx` は **2,744 insertions / 334 deletions** の差、
`src/lib/aiLesson/course/adventure/` 全体で **212 files / 39,626 insertions** の差。

→ **secure-runtime の「教材サーバー配信」は、本番より 3週間古い Adventure V2 を前提に書かれている。**
単純な cherry-pick は成立しない。設計（R2 + Worker + サーバー採点 + contentGuard）を回収し、
現行の adventure コンテンツ構成に合わせて**移植**する必要がある。

secure-runtime にしか無い主要ファイル:

```
worker/aiCourseRuntime.ts      worker/aiCourseAuth.ts      worker/aiCourseAdmin.ts
worker/aiCoursePeriodAccess.ts playwright.config.ts
src/lib/aiLesson/course/sales/  … 34ファイル（contentDelivery / contentGuard / entitlement /
                                  trialActivation / upsell / salesHelp / unitEconomics ほか）
```

⚠️ **配信基盤が違う。** 本番は Cloudflare **Pages Advanced mode**（`scripts/generate-worker.mjs` が
`dist/_worker.js` を生成）で、secure-runtime は独立した `worker/index.ts`。
統合するには本番の `generate-worker.mjs` 側に R2 バインディングと配信経路を組み込む必要がある。

## 0-4. 今回のスコープ外（明示）

- 通常活動の**チャージ／回数券／残高加減算／自動料金徴収／決済フロー変更**（アナログ運用を維持）
- 広告再出稿・新規SNS展開・百度SEO・大量SEO記事
- 法人／学校プラン・有料コミュニティ・wild-flow サブスク
- 大規模UI刷新

## 0-5. 作業ルール（全エージェント共通）

1. 作業ツリーは `/Users/shocchan/badminton-sales` のみ。
2. **commit / checkout / switch / push / deploy は親エージェントのみ**が行う。
3. 他ブランチの内容は `git show <branch>:<path>` で読む（checkout しない）。
4. `~/badminton-aicourse`・`~/badminton-platform`・`~/badminton-secure-runtime` は**読み取り専用**。
5. 本番DBへの適用はしない。migration は**ファイル作成まで**。
6. `tsc -b` / `npm run build` は親のみ（`tsconfig.tsbuildinfo` の競合を避ける）。
   各エージェントは自分のテストを `npx vitest run <file>` で個別実行する。

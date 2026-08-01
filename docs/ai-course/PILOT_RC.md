# Weekend Paid Pilot — Release Candidate

判断基準: `docs/ai-course/PRODUCT_CANON.md`
運用手順: `docs/ai-course/PILOT_OPERATIONS.md`
整合監査: `docs/ai-course/product-alignment-audit.md`

---

## RC情報

| 項目 | 値 |
|---|---|
| branch | `feature/ai-course-adventure-v2-final-completion` |
| RC tag | `ai-course-adventure-v2-rc4` |
| ひとつ前のRC（切り戻し先） | `ai-course-adventure-v2-rc3` |
| staging URL（CEO確認用） | https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1 （`/zh/` も） |
| production frontend | **未反映（NOT_EXECUTED）** |
| main merge | **未実施** |

### Edge Function の現状

`ai-lesson-token` は 2026-08-01 に CEO の明示許可でデプロイ済み（変更なし）。

- 共有Supabaseプロジェクト `jdkwijdphlkrcoiggfqw`。production frontend も同じ関数を使う
- 後方互換は実APIで確認済み（`teacherId` 未送信 → marin のまま）
- 切り戻し手順: `docs/ai-course/adventure-v2/rollback/README.md`
- **今回のセッションでは Edge Function を触っていない**

---

## production 反映を承認するときの手順

Pilot は staging で運用する想定だが、production へ出す判断をした場合の手順。

```bash
cd ~/badminton-platform
git checkout ai-course-adventure-v2-rc4
git status --short            # clean であること
npx vitest run                # 1,602 PASS を確認
npm run build                 # production ビルド
./scripts/deploy-production.sh
```

⚠️ 実行前に必ず確認すること

1. **kawabado.com の既存ページに影響が出ないか**（AIコースは `/ja/ai-course` 配下のみ）
2. AIコースは learner ごとの feature flag（`settings.adventureV2.enabled`）で出ているので、
   本番へ出しても **V2が有効な learner にしか新画面は出ない**
3. 出したあとに問題が起きたら切り戻す:

```bash
git checkout ai-course-adventure-v2-rc3
npm run build && ./scripts/deploy-production.sh
```

---

## 学習者の受け入れ手順

`docs/ai-course/PILOT_OPERATIONS.md` の §1〜§8 をそのまま実行する。要点だけ:

1. 入金確認 → 同意確認 → 招待コード発行（`--learner A|B|C --email --expires --confirm`）
2. 学習者へ案内文を送る（**OTPは8桁**であることを必ず伝える）
3. 初回ログイン後に `seed-adventure-profile.mjs <userId> <N2|N3>` でV2を有効化
4. **診断は本人にやってもらう**（代行すると現在地が狂う）
5. 初日に冒険を1回完了できていれば成功

---

## Known issues（Pilot開始時点で分かっていること）

### P2 — Pilot中に見ていく

| # | 内容 | 影響 |
|---|---|---|
| P2-1 | 聴解が全セット `Kyoko` 1音声。二人会話でも話者の音響的な区別がない | JLPT聴解の中核である「話者の識別」が訓練できない。内容理解は成立する |
| P2-2 | 聴解・読解で**正解の選択肢だけが極端に長い**セットがある（80セット中45件で正解が単独最長） | 本文を聞かず・読まずに当てられる抜け道 |
| P2-3 | 概要理解4セットは誤答が的外れで、選択肢だけで解ける | 難易度が実際より低く出る |
| P2-4 | 中国語文中に全角`＝`（6箇所）・日本式読点`、`（5箇所）・`男人/女人`（中国語のJLPT教材では`男的/女的`が一般的） | 読みにくさ。意味は通じる |
| P2-5 | N2語彙サンプルの75%がN3以下の語 | N2対策としての手応えが薄い可能性 |
| P2-6 | 語彙問題の解説が「なぜ正解か」ではなく例文（`whyCorrectJa: exampleJa`） | 語ごとの `explanationJa` は高品質なので、解答後にそちらを出せているかは実機で要確認 |
| P2-7 | `validate-legal.mts` が ESLint の `.mts` パーサ設定に無い | 既存事象。検証コマンドは `.mts` を対象にしていない |

### P3

| # | 内容 |
|---|---|
| P3-1 | 悠斗先生の `cheer`（笑顔）画像が無く base で代用 |
| P3-2 | `situationJa` の書式ゆれ、`【Ａ】`の全角半角ゆれ、`rationaleSpan` が根拠の一部しか覆わないセットあり |

**P0 = 0 ／ P1 = 0**（今回の監査で見つかったP0 8件・P1 25件はすべて修正済み）

---

## Pilot中に見る数字

`docs/ai-course/PRODUCT_CANON.md` §10 の計測イベントが staging で動く。

| 見たいこと | イベント |
|---|---|
| 始められたか | `onboarding_completed` / `diagnosis_completed` / `first_quest_completed` |
| 続いているか | `day_2_returned` / `day_7_active` / `weekly_learning_days` |
| 伸びているか | `skill_evidence_added` / `delayed_mastery_reached` / `mock_completed` |
| 離脱しかけていないか | `onboarding_abandoned` / `quest_abandoned` / `seven_days_inactive` |

会話本文・音声・氏名・メール・自由記述は送っていない。日数・回数は階級化して送る。

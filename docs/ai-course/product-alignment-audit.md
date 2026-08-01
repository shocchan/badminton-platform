# 構想と実装の整合監査 — AI日本語コース（N2／N3 Adaptive Adventure）

判断基準: `docs/ai-course/PRODUCT_CANON.md`（絶対原則18・正準Journey）
実施: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-final-completion`

区分の定義:

- **ALIGNED** … 正準Journeyから到達でき、終了後の次の行動が示され、canonに反しない
- **PARTIALLY_ALIGNED** … 動くが、canonの一部（到達性・次の一歩・主要CTA・判断の投げすぎ）に欠けがある
- **MISALIGNED** … canonに反する。修正対象

**ALIGNED の機能は今回変更していない。**（無目的な書き換えをしない）

---

## 結果一覧

| # | 機能 | 監査前 | 対応 | 監査後 |
|---|---|---|---|---|
| 1 | Onboarding | ALIGNED | — | ALIGNED |
| 2 | Goal Selection | ALIGNED | — | ALIGNED |
| 3 | Teacher Selection | ALIGNED | — | ALIGNED |
| 4 | Diagnosis | ALIGNED | — | ALIGNED |
| 5 | Skill Profile | ALIGNED | — | ALIGNED |
| 6 | Route Generator | ALIGNED | — | ALIGNED |
| 7 | **Home** | **PARTIALLY_ALIGNED** | 現在地を表示／模試中断時の主要CTAを1本化 | ALIGNED |
| 8 | Today Adventure | ALIGNED | — | ALIGNED |
| 9 | Map | ALIGNED | — | ALIGNED |
| 10 | Vocabulary | ALIGNED | — | ALIGNED |
| 11 | Grammar | ALIGNED | — | ALIGNED |
| 12 | Reading | ALIGNED | — | ALIGNED |
| 13 | Listening | ALIGNED | — | ALIGNED |
| 14 | Battle | ALIGNED | — | ALIGNED |
| 15 | Midboss | ALIGNED | — | ALIGNED |
| 16 | Mini Mock | ALIGNED | — | ALIGNED |
| 17 | Readiness | ALIGNED | — | ALIGNED |
| 18 | AI Conversation | ALIGNED | — | ALIGNED |
| 19 | Report | ALIGNED | — | ALIGNED |
| 20 | Retry（言い直し） | ALIGNED | — | ALIGNED |
| 21 | Review | ALIGNED | — | ALIGNED |
| 22 | Human Lesson Bridge | ALIGNED | — | ALIGNED |
| 23 | **Weekly Progress** | **MISALIGNED（不在）** | 週のまとめを新規実装 | ALIGNED |
| 24 | **完了画面（成長実感）** | **PARTIALLY_ALIGNED** | 技能別の手ごたえ・直した表現・次の冒険を追加 | ALIGNED |
| 25 | Analytics | **PARTIALLY_ALIGNED** | 獲得・継続・離脱リスクのイベントを追加 | ALIGNED |

**MISALIGNED 1件・PARTIALLY_ALIGNED 3件を修正。ALIGNED 21件は変更していない。**

---

## 修正した4件の詳細

### 7. Home — PARTIALLY_ALIGNED → ALIGNED

**欠けていたもの1: 現在地（canon §5-2）**

目的地（N2合格まであと126日）は出ていたが、**いまどこにいるか**が第一ビューに無かった。
現在地が見えないと、canon 原則2「基礎不足は降格ではなく経由地」が学習者に伝わらない。
N2志望なのにN3の教材が出てくると「レベルを下げられた」と受け取られる。

対応: 目的地の直下に `現在地：<stage名>（定着率 x%）` を追加。
N2志望で基礎・N3の段にいる場合は「＝N2攻略の経由地」を併記した。

**欠けていたもの2: 主要CTAが2本になる状態（canon 原則3）**

中断したミニ模試があると、模試再開ボタン（オレンジ）と今日の冒険CTA（青）が
**同格で並んでいた**。どちらを押せばよいか学習者が判断することになる。

対応: 模試が中断中のときは**模試再開を唯一の主要CTA**にし、
今日の冒険側を副次スタイル（枠線ボタン）＋文言「模試のあとで今日の冒険をする」へ落とした。
模試は残り時間が動いているので、優先すべきはこちらという判断。

### 23. Weekly Progress — MISALIGNED（不在） → ALIGNED

canon §6「毎週のまとめ」に相当する画面が**存在しなかった**。
毎日の完了画面はあったが、「先週より何ができるようになったか」を返す場所が無い。
有料商品として、週に一度は価値を言語化できる必要がある。

対応: `advWeekly.ts` ＋ 週のまとめ画面を新規実装。**盛らないための実装**が要点。

- 2週続けて各10問以上解いていない技能は `deltaPct = null`＝**未判定**として出す（原則13）
- 学習時間は実測していないので「設定時間からの目安です」と明記
- 定着は「別日3回＋遅延確認」を通ったものだけ数える（原則9）
- 先頭は数値ではなく「今週は◯項目が定着まで届きました」の1文

到達経路: 完了画面の下 ＋ Homeの二次メニュー（＝第二階層・原則16）。

### 24. 完了画面 — PARTIALLY_ALIGNED → ALIGNED

canon §6の必須6項目のうち、**直した表現・今回伸びた技能・次の冒険**が無かった。
「今日やったこと」は出るが「今日で何が変わったか」が分からない状態。

対応:

- **今日の手ごたえ**（技能別の正答数）。**解いていない技能は表示しない**（0%と並べると「できなかった」と誤読される・原則13）
- **直した表現**（言い直し素材と同じ作り方。素材が無ければ出さない）
- **次の冒険**（明日・約N分・先生が用意します）。行き止まりを作らない（原則15）

### 25. Analytics — PARTIALLY_ALIGNED → ALIGNED

学習イベントは揃っていたが、**Paid Pilotの獲得・継続・離脱リスク**が測れなかった。
3名の有料Pilotで最も知りたいのは「続いているか」「離脱しかけていないか」である。

対応: `day_2_returned` / `day_7_active` / `seven_days_inactive` / `weekly_learning_days` /
`weekly_quest_completion` / `skill_evidence_added` などを追加。

プライバシー面の判断: **日数・回数は `bucketOf()` で階級化して送る**。
3名のPilotでは「7日連続」のような生の値がほぼ個人を指すため。
会話本文・音声・氏名・メール・自由記述は `ALLOWED_KEYS` で二重に遮断している。

---

## ALIGNED と判断した根拠（抜粋）

### 正準Journeyからの到達性

4 Persona（N2／N3／会話／Hybrid）で初回・毎日・定期のJourneyを一周し、
**48件の受入テスト**で固定した（`advPersona.test.ts`）。

- 診断 → ルート生成 → 現在地決定：4 Persona 全通過
- 今日の冒険が1つ生成され、所要時間・成功条件・ja/zh 表示名がある：全通過
- 設定した1日の学習時間の2倍を超えない：全通過
- 言い直しの素材が必ず返る（行き止まりなし）：全通過
- 先生レッスン候補が最大3件：全通過

### 主要CTAと行き止まり

全12ビュー（home / map / readiness / grammar / battle / complete / prep /
reading / listening / restate / mock / teacher / weekly）を確認。
すべてに BackBar か次アクションのCTAがあり、**dead end 0**。
同格の主要CTAが2本になるのは模試中断時のみで、これを是正した。

### 判断の投げすぎ

Homeは「今日の冒険」以外の教材選択を出さない。
教材一覧・地図・模試・準備度・設定・週まとめはすべて折りたたみの第二階層。
**「今日は何をしますか？」と聞く画面は存在しない。**

### 能力変化への接続

読解・聴解の結果は `recordSkillResult` で mastery台帳へ skill evidence つきで記録され、
準備度（7条件ゲート）へ反映される。会話結果はJLPT準備度へ加算されない（原則5）。

### 人間レッスンへのデータ接続

`buildLessonPrepSummary` が学習履歴から次回扱う候補を最大3件に絞る。
学習者側（`learnerViewJa/Zh`）と先生側（`teacherSkillRows`）の両方を生成する。

---

## 今回あえて変更しなかったもの

| 対象 | 理由 |
|---|---|
| 語彙・読解・聴解bank、音声、問題バトル、模試、先生別音声、AI会話E2E、正解位置制御 | FINAL CLOSEOUT で完成済み。再実装・再生成の指示は無く、触ると回帰リスクだけが増える |
| 世界観の名称（ソラノ塔・カタチの遺跡など） | 原則12を満たしているか確認したうえで維持。stage名と併せて「N2文法」等の学習目的が出ている |
| RPG演出 | 原則11のとおり学習構造の理解を助ける範囲に収まっている |

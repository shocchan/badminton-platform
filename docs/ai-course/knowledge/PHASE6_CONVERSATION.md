# Phase 6 — AI会話 × 知識項目（2026-09-10）

## 変えていないこと（方針）
- AI会話は毎日の主教材ではない。**今日の冒険には出さない／「ほかの学習を見る」から任意選択／全員 週3回**。
  この3点はそのまま（テスト `advContentPractice.test.ts` で「冒険に conversation_mission が戻っていない」を固定）。
- 会話 runtime（Realtime・text）・回数制限・回数券・課金は触っていない。
- 会話コースの90ミッション（w01m1…w18m5）も1件も変えていない。

## 作ったもの

### 1. 会話の結果 → 知識項目（`knowledge/conversationKnowledge.ts`）
| 関数 | 中身 |
|---|---|
| `buildMissionGrammarMap` | 会話コースの missionId → 既存 grammarId。Phase 2-2 の Alias 層（exact/variant）＋人が書いた対応表 `MANUAL_MISSION_GRAMMAR`。**部分一致は使わない**（「〜かもしれません」が「〜ます／〜ません」に当たった実測があるため） |
| `NON_GRAMMAR_MISSIONS` | 文法項目に当たらないと決めたもの（いつも／よく・もう一度お願いします・恐れ入りますが・経緯の説明 …17件）＝繋がなくて正しい |
| `conversationOutcome` | `used_self`（自分で使えた）／`used_with_hint`／`incorrect`（使ったが、その発話が直しの対象になった）／`avoided`／`incomplete` |
| `structuredConversationResults` | セッション → **structured result だけ**（ログ全文は持たない）。`retryTarget`＝言い直しへ回すべきか |
| `conversationEvents` / `retryTargetsAfterConversation` | Phase 3 の knowledge state へ入れる出来事、言い直しの対象 |

実測: 90ミッションのうち 総合18・非文法17 を除く **55 本すべてが grammarId へ繋がる**（未解決 0。MANUAL の ID は全て実在）。

### 2. 文法の practice → 会話ミッション（`knowledge/practiceMission.ts`）
- 文法項目が既に持つ `practice`（テーマ・最初の一言・使う目的）と `production`（期待する形）から、
  **既存の会話 runtime が読める Mission** を作る。新しい runtime は作らない。
- `advconv-<grammarId>`（今日の文法）／`bizconv-<sceneId>:<grammarId>`（Business の場面・Phase 5）。
  どちらも id に grammarId を含むので、結果は knowledge へ戻る。
- `detect`（発話判定の正規表現）は期待形・許容形・照合キーから作り、て形の音便（読んで**で**おく）も持つ。
  既存の `detectTargetUsage` で self／hint／none が出ることをテストで確認。N3 文法 76 項目すべてから作れる。
- `courseEngine.registerPracticeMissions` / `missionById` の fallback。COURSE_MISSIONS は増えない。

### 3. 配線
- `advContent.stageContent`: 今日の文法の practice と Business の30場面を Mission にして登録し、
  `practiceScenes`／`businessScenes`（級つき）／`missionGrammar` を返す。
- `AdvShell`:
  - 「話す場面を選ぶ」画面に **「今日の文法を使って話す」「仕事の場面で話す」** を追加（学習者の級以下の場面だけ）。
    会話コースの候補が1つでも、これらがあれば選ばせる。
  - 冒険に conversation_mission が入っている（allowConversation の学習者）ときは、
    その文法の `advconv-` ミッションで始める＝「今日学んだ文法 → 会話 → 使えた → conversation_success」が同じ grammarId で繋がる。
  - knowledge state に `missionGrammar` を渡し、会話コースの結果も文法へ戻す。
- `AiCoursePage` は無変更（`forcedMissionId` → `missionById` が registry を引く）。

## 実在生徒データ
- 本番の会話ログは読んでいない・変えていない。全て単体テスト（合成セッション）と本番教材の静的検査。

## 次に人が決めること（停止理由ではない）
- Business の場面を、会話コースの候補（いつも通り）より上に出すか。今は下に出している（主教材にしない方針のまま）。
- `incorrect` の判定は「直された原文に detect が当たる」だけ。レポート側で target 別の修正フラグを返せば精度が上がる。

# p3-n3-conv:P3-04 (P1)

## Evidence
advQuest.ts:88-90 が step「AI会話で使う：<テーマ>」を生成し、成功条件も「会話で今日の表現を1回使う」（195-196行）。しかし runStep の conversation_mission は props.onStartConversation() を無引数で呼び（AdvShell.tsx:992-993）、AiCoursePage.tsx:1071 は setStep('conversationIntro') で旧12週エンジンの plan.main.mission を開く（899-914行 KatariPortIntro）。V2の missionByGrammarId（advContent.ts:198-207）と detectTargetUsage/nextAfterConversation（advConversationBridge.ts:54-72）は消費者ゼロ（CourseTextLesson/CourseVoiceLesson が使う detectTargetUsage は旧 courseLesson.ts のもの）。step完了判定は「今日completedなセッションが1件あるか」のみ（AdvShell.tsx:272-278）。指摘どおり実在。

## FixSpec
【修正: 誇張を消す文言変更（mission spec接続の実装はパイロット中は行わない）】
対象: src/lib/aiLesson/course/adventure/advQuest.ts

(1) 88-90行
旧:
    conv: convPick
      ? step('conversation_mission', [convPick.refId, ...(g ? [g] : [])], `AI会話で使う：${convPick.themeJa}`, `在AI会话中使用：${convPick.themeZh}`)
      : null,
新:
    // 起動する会話は既存runtimeの今週ミッション（今日の文法をテーマにする接続は未実装）。
    // 「今日の文法を会話で使う」と掲げると実体と食い違うため、誇張しない題名にする（原則13）。
    // targetExpressions は言い直しstepが実際に使うので expressions はそのまま残す
    conv: convPick
      ? step('conversation_mission', [convPick.refId, ...(g ? [g] : [])], 'AI会話ミッション', 'AI会话任务')
      : null,

(2) 178行の直後（const estimatedMinutes = ... の次行）に追加:
  // 成功条件は実際に計測できることだけを言う（会話中の「表現使用」は判定していない・原則13）
  const hasConv = steps.some((s) => s.kind === 'conversation_mission');

(3) 195-196行
旧:
    successConditionJa: parts.battle ? 'バトルで80%以上、会話で今日の表現を1回使う' : '今日の表現を会話で1回使う',
    successConditionZh: parts.battle ? '战斗拿到80%以上，并在会话中用一次今天的表达' : '在会话中用一次今天的表达',
新:
    successConditionJa: parts.battle
      ? (hasConv ? 'バトルで80%以上、AI会話を1回終える' : 'バトルで80%以上を取る')
      : (hasConv ? 'AI会話を1回終える' : '今日のstepをすべて終える'),
    successConditionZh: parts.battle
      ? (hasConv ? '战斗拿到80%以上，并完成一次AI会话' : '战斗拿到80%以上')
      : (hasConv ? '完成一次AI会话' : '完成今天的所有步骤'),

※成功条件の完全一致を検証するテストは無し（advPersona.test.ts:123-124 等は length>0 のみ）。会話stage側のタイトル（advQuest.ts:76 `AI会話：${convPick.themeJa}`）は現状 convPick が常に null で到達不能のため変更しない。恒久対応（onStartConversation へ missionByGrammarId の spec を渡し detectTargetUsage で判定）はバックログとして記録のみ。P3-02 の修正と同一ファイルのため同時に適用すること。

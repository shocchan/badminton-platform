# p3-n3-conv:P3-02 (P1)

## Evidence
advContent.ts:198-207 で conversationTargets は nextGrammarIds（practice付き文法draft）からのみ生成。foundation_camp/n3_bridge/n3_practice の targets は n3UnitIds＋vocabularyIds のみで文法IDなし（advRoute.ts:69-86）→ conversationTargets=[] → advQuest.ts stageSteps（88-90行）で parts.conv=null → 15分quest（164行）でも push されない。一方ルート提示文は「あわせて、会話ミッションを毎日の冒険に組み込みます。」（advRoute.ts:201）。会話stage側には area fallback がある（advQuest.ts:77）のに通常stageのhybridには無い。指摘どおり実在。

## FixSpec
【修正: hybridにエリアfallbackの会話ミッションを入れる】
対象: src/lib/aiLesson/course/adventure/advQuest.ts 107行
旧:
  const parts = stageSteps(stage, availability, seed);
新:
  const parts = stageSteps(stage, availability, seed);
  // hybrid: 基礎キャンプ等のstageは文法draftを持たず conversationTargets が空になり、
  // ルート提示文「会話ミッションを毎日の冒険に組み込みます」が守れない（原則16）。
  // 会話stageと同じエリアfallbackで会話ミッションを必ず入れる
  if (goalType === 'hybrid' && !parts.conv) {
    parts.conv = step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务');
  }

※5分quest（157行 goalType!=='jlpt'）・15分quest（164行 goalType!=='jlpt'||…）・30分quest（171行）のいずれも既存の push(parts.conv) 経路で拾われるため他の変更不要。conversation_mission は estMinutes 4分で、既存テストの時間上限（dailyMinutes×2）にも収まる。

【回帰テスト追加】
対象: src/lib/aiLesson/course/adventure/advPersona.test.ts の describe('Persona D（Hybrid: N2合格＋仕事の会話）') 内に追加:

  it('**会話ターゲットが無いstageでも冒険に会話ミッションが入る**（原則16）', () => {
    const q = todayQuest(prof, {
      availability: { nextGrammarIds: [], nextUnitIds: ['u1'], conversationTargets: [] },
    });
    expect(q.steps.some((s) => s.kind === 'conversation_mission')).toBe(true);
  });

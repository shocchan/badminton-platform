# p3-n3-conv:P3-03 (P1)

## Evidence
skills.conversation への書込はオンボーディング完了時のみ（AdvShell.tsx:316 ← advDiagnosis.ts scoreDiagnosis:191-194）。値の出所は書き言葉サンプルへの正規表現ヒューリスティック（advDiagnosis.ts:103-127、confidence low、5段階を10/30/50/70/85%へマップ）。AI会話後に更新するコードは grep 上ゼロ。しかし準備度画面は conv.currentScore を表示し注記「AI会話の記録です。JLPTの点数には足しません。」（advReadiness.ts:275-283、表示は AdvShell.tsx:736-745。745行は r.practical[0].noteJa のみ描画）＝凍結された診断値を「AI会話の記録」と偽る（原則13違反）。週まとめ（advWeekly.ts:118）も試験4技能のみで会話の行なし。指摘どおり実在。

## FixSpec
【修正: 文言を正直にする（短期・最小）】
対象: src/lib/aiLesson/course/adventure/advReadiness.ts 281-282行（conversation行のnote。この文がAdvShell.tsx:745でカード全体の注記として表示される）
旧:
      noteJa: 'AI会話の記録です。JLPTの点数には足しません。',
      noteZh: '这是AI会话的记录，不计入JLPT分数。',
新:
      noteJa: '冒険の準備（診断）で測った会話の開始地点です。その後のAI会話ではまだ更新されません。JLPTの点数には足しません。',
      noteZh: '这是「冒险准备」（诊断）时测得的会话起点，之后的AI会话暂时不会更新它，也不计入JLPT分数。',

※practicalUsage行（287-289行）は confidence 'none' 固定で常に「未判定」表示、かつnoteは描画されないため変更不要。既存テストに旧文言への依存なし（grep確認済み）。
※中期対応（CourseSessionRecordから conversation/practical のevidenceを週次更新し、週まとめに会話回数を追加）はパイロット後のバックログとし、今回は実装しない。

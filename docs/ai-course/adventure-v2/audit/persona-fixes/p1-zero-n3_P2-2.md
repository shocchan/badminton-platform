# p1-zero-n3:P2-2 (P2)

## Evidence
実在を確認。しかも「初日だけ」ではなく基礎キャンプ期間中ずっと空振りする: restate素材のwrongExpressionsはAdvShell.tsx 559-562行で n2g-/n3g- 接頭辞のmastery誤答のみを拾うが、基礎キャンプのtargetは単元(n3u-)のみで文法targetが存在しないため常に0件。targetExpressionsの源のconversationTargetsはadvContent.ts 200-207行でnextGrammarIdsからのみ生成されるため基礎キャンプでは常に空。conversationCorrectionは564行で常にnull。よってpickRestateMaterialはsource='none'となり、AdvShell.tsx 557-593行のrestate画面は「次に進む/继续」を押すだけの2分stepとして、15分/30分プランのクエストに毎日入る（advQuest.ts 165行・172行で無条件push）。行き止まりではないが空stepが主線に常駐する点は指摘通り（指摘の想定より広い）。

## FixSpec
コード1ファイルの小修正。src/lib/aiLesson/course/adventure/advQuest.ts generateTodayQuest内。
素材の有無は既存入力で判定できる: weakGrammarIds（AdvShell 207-209行でrestate画面と同じ「n2g-/n3g-かつ直近誤答<80%」フィルタの上位集合）と parts.expressions（restate画面のtargetExpressionsと同源）。

153行 `if (minutes === 5) {` の直前に追加:
```ts
  // 言い直しは素材がある日だけ入れる（基礎キャンプ等、文法誤答も会話表現も無い日は空stepになるため）
  const restateAvailable = weakGrammarIds.length > 0 || parts.expressions.length > 0;
```
旧（165行・minutes===15分岐内）:
```ts
    push(step('restate', [], '言い直し', '改口练习'));
```
新:
```ts
    if (restateAvailable) push(step('restate', [], '言い直し', '改口练习'));
```
旧（172行・else分岐内）: 同一行につき同じ置換を適用（replace_all可）。

影響: クエストは最低1step保証（176行）が既存のため空クエストにはならない。advQuest系テストで「15分プランはrestateを含む」を固定しているテストがあれば期待値を「素材がある場合のみ」に更新。AdvShell側のrestate画面（557-593行）は変更不要（クエストに入らなければ到達しないだけで、source='none'の後方互換フォールバックとして残す）。

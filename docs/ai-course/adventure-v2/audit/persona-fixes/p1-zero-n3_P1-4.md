# p1-zero-n3:P1-4 (P1)

## Evidence
実在を確認（反証失敗）。①1target最短10-11日: advMastery.ts 6-18行（別日3回・delayDays7）＋computeMastery 100-116行（遅延確認は3日目のqualifying完了時刻+7日後に開き、その後のqualifying試行で初めてmastered）。②直列進行: advContent.ts 194-195行 nextGrammarIds/nextUnitIds はmastered除外のみ→advQuest.ts 66-67行で常に[0]（未masteredの先頭が10日間張り付く）、84-87行 battleRefは単一、advBattle.ts 51行 normal tierは targetIds.slice(0,1)。バトル結果の台帳記録も単一targetId（AdvShell.tsx 358-368行 recordAttempt(prof.mastery, battle.targetId, ...)）で、1日に複数targetのqualifying日を進める経路がない。③target数: persona1(pre_n5→N3)のルートは 12単元 + N3文法76項目（n3GrammarDrafts1-4で19×4=76実測、advContent.ts 190行でstg-n3grammarに全量展開）+ stage束5（foundation/n3bridge/n3practice/n3grammar/n3boss、masteredStageIds 129-133行はstageId自体のtarget攻略を要求）= 93 targets → 最短でも93×10.5≒約970日。④試験日: examDateISOはAdvShell.tsx 210-212行でdaysToExam算出後、advQuest.ts 128-131行（残60日未満で読解/聴解を優先）とbuildWhy 217-219行（「試験まで◯日」表示）のみに使用。ペース配分・並行進行・逆算は一切ない。1日15分×180日で成立しない時間設計は事実。

## FixSpec
小パッチでは直せない設計課題のため、実装可能な段階仕様として提示（対象4ファイル＋テスト）。

【Phase A: targetの並行進行（1バトルで複数targetのqualifying日を同時に進める）】
1. src/lib/aiLesson/course/adventure/advBattle.ts 51行
旧: `const targets = spec.tier === 'normal' ? spec.targetIds.slice(0, 1) : spec.targetIds;`
新: `const targets = spec.tier === 'normal' ? spec.targetIds.slice(0, 3) : spec.targetIds;`
2. src/lib/aiLesson/course/adventure/advQuest.ts stageSteps（84-87行）
旧:
```ts
  const battleRef = g ?? u ?? stage.stageId;
  return {
    learn,
    battle: step('battle', [battleRef], '問題バトル', '问题战斗', 'normal'),
```
新:
```ts
  const battleRefs = [...avail.nextGrammarIds.slice(0, 2), ...avail.nextUnitIds.slice(0, 2)].slice(0, 3);
  return {
    learn,
    battle: step('battle', battleRefs.length > 0 ? battleRefs : [stage.stageId], '問題バトル', '问题战斗', 'normal'),
```
3. per-target攻略クレジット: AdvBattleRunner の onFinish を「target別attempt配列」を返すよう拡張し、AdvShell.tsx 358-368行で recordAttempt をtargetごとに実行する。仕様: buildEncounter は spec.pool.get(t) からtarget→questionKeys対応を保持しているので、Encounter に `keysByTarget: Map<string, string[]>` を追加し、runnerが採点時にtargetごとの scorePct / unseenRatio / questionKeys を分割して `{ targetId, attempt: AdvMasteryAttempt }[]` を onFinish に渡す。設問数3問未満のtargetはその日のqualifying対象にしない（1問正解でqualifyingになる水増しを防ぐ・原則13）。onFinish側:
```ts
onFinish={(attempts: { targetId: string; attempt: AdvMasteryAttempt }[], mastery: MasteryStatus) => {
  let ledger = prof.mastery;
  for (const a of attempts) ledger = recordAttempt(ledger, a.targetId, a.attempt);
  ...（以降は現行と同じ）
}}
```
影響テスト: advBattleMastery.test.ts・advQuest系テストの期待値更新が必要。

【Phase B: 残日数からの導入ペースと正直な表示】
generateTodayQuest（advQuest.ts）に「残targets×4（qualifying3日+遅延確認1日）÷ 1日に消化できるtarget数(3)」で必要日数を算出するロジックを追加し、daysToExam を下回れない場合は quest.whyJa/whyZh に正直に出す:
- ja: `このペースでは試験日に全範囲が終わりません。1日の学習時間を増やすか、範囲を先生と相談しましょう。`
- zh: `按当前进度，考试前无法学完全部范围。请增加每天的学习时间，或与老师商量调整范围。`
（「存在するふり・できるふりをしない」canon原則に一致）

【CEO判断事項（コードで解決できない部分）】Phase A実施後の理論スループットは約0.75target/日→93targetsで約124日となり、休み日を含めても180日に収まりうるが、1日15分の枠内で3target分のバトル＋新規学習が回るかはパイロット実測で検証が必要。半年契約の到達目標文言（契約・案内側）はPRODUCT_CANONに180日の記載なし（grep確認済み）のため、契約文面の期待値調整はCEOへエスカレーション。

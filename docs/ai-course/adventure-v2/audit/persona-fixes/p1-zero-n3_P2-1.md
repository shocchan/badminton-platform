# p1-zero-n3:P2-1 (P2)

## Evidence
実在を確認。経路は指摘通り: AdvOnboarding.tsx 275-283行（「わからない」= onAnswer(null) → 279行 next.delete）→ advDiagnosis.ts 84行（未回答は集計外）→ 全バケツtotal=0 → 73-74行 pct=0 → 92-93行 ladderBand: foundationPct 0<60 → advSkillProfile.ts 19-24行 scoreToBand(0,'foundation')='pre_n5' → vocabularyBand='pre_n5'（grammarBandはladderBand(100,0,...)で'n4_late'）→ knowledgeBand=min='pre_n5'、confidence=evidenceToConfidence(0)='none'。RouteReveal（AdvOnboarding.tsx 350-364行）は BAND_LABELS[kb]（pre_n5=「基礎の入口／基础入门」）を「現在地」として断定表示。表示文字列は「pre_n5」そのものではなく「基礎の入口」だが、証拠0件で帯を断定する経路の実在は事実。なお needs_assessment のインフラは既存（BAND_LABELS 277行に「未判定/尚未判定」、advRoute.ts 65-67行はneeds_assessmentで基礎開始、supportNeed判定 advDiagnosis.ts 209行も対応済み）のため修正の影響範囲は小さい。

## FixSpec
コード2箇所の小修正。

【1. src/lib/aiLesson/course/adventure/advDiagnosis.ts】
旧（161-165行）:
```ts
  const vocabularyBand = ladderBand(vFoundPct, vN3Pct, 100, false);
  const grammarBand = ladderBand(100, gN3Pct, gN2Pct, n2Asked);
  const knowledgeBand: AdvBand = (['vocabulary', 'grammar'] as const)
    .map((k) => (k === 'vocabulary' ? vocabularyBand : grammarBand))
    .reduce((lo, b) => (bandAtLeast(lo, b) ? b : lo));
```
新:
```ts
  // 全問「わからない」＝証拠0件のときは帯を断定しない（原則13: 存在するふりをしない）
  const noEvidence = vFound.total + vN3.total + gN3.total + gN2.total === 0;
  const vocabularyBand: AdvBand = noEvidence ? 'needs_assessment' : ladderBand(vFoundPct, vN3Pct, 100, false);
  const grammarBand: AdvBand = noEvidence ? 'needs_assessment' : ladderBand(100, gN3Pct, gN2Pct, n2Asked);
  const knowledgeBand: AdvBand = noEvidence
    ? 'needs_assessment'
    : (['vocabulary', 'grammar'] as const)
      .map((k) => (k === 'vocabulary' ? vocabularyBand : grammarBand))
      .reduce((lo, b) => (bandAtLeast(lo, b) ? b : lo));
```
（ルートはadvRoute.ts 65-67行が needs_assessment を基礎開始に倒すため現行どおり基礎キャンプから。supportNeed='often'も既存分岐で維持）

【2. src/components/ai-course/adventure/AdvOnboarding.tsx RouteReveal】
旧（360-364行）:
```tsx
        <p className="font-semibold text-gray-900">
          {o.goalType === 'conversation'
            ? tx(lang, `会話の開始地点：${BAND_LABELS[conv].ja}`, `会话出发点：${BAND_LABELS[conv].zh}`)
            : tx(lang, BAND_LABELS[kb].ja, BAND_LABELS[kb].zh)}
        </p>
```
新:
```tsx
        <p className="font-semibold text-gray-900">
          {o.goalType === 'conversation'
            ? tx(lang, `会話の開始地点：${BAND_LABELS[conv].ja}`, `会话出发点：${BAND_LABELS[conv].zh}`)
            : kb === 'needs_assessment'
              ? tx(lang, 'これから学びながら測ります（まずは基礎から開始）', '接下来边学边测（先从基础开始）')
              : tx(lang, BAND_LABELS[kb].ja, BAND_LABELS[kb].zh)}
        </p>
```
（他画面はBAND_LABELS['needs_assessment']=「未判定/尚未判定」が既に定義済みのため追加対応不要）

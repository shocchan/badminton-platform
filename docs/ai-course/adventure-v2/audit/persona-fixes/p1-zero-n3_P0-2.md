# p1-zero-n3:P0-2 (P0)

## Evidence
実コード実行で確認（vite-nodeで buildEncounter+gradeEncounter+recordAttempt+computeMastery を30日実行）。n3u-01-self（プール35問・7タイプ）を毎日全問正解: day1-4がqualifying、day5以降unseenRatio=0.29(2/7)<0.3で永久に非qualifying。遅延確認が開くday10のattemptも非qualifyingのため advMastery.ts L104 `const delayed = qualifying.some((a) => a.completedAt >= opensAt)` を永遠に満たさない → cleared_pending_delay 固定。さらに監査の指摘以上の欠陥も実測: maxAttemptsKept=24 の間引き(L40-42)で day30 に qualifying日を持つ古attemptが消え、状態が in_progress へ「後退」する。stage攻略について: masteredStageIds(L129-133)は ledger[stageId] の mastered が条件だが、stageIdへ記録するのは AdvShell.tsx L360-362 の midboss/rankboss 時のみで、全setBattle呼び出し(L601/1010/1015)は tier 'normal'（advQuest L87のbattle stepも'normal'）。模試は 'mock-n3'/'mock-n2' へ記録(L543)。よってledger[stageId]は永久に空 → currentStageOf/routeProgressPct は「基礎キャンプ・0%」固定。指摘は正確（むしろ過小評価）。

## FixSpec
適用順: 本修正→P0-3→P1-1。

【変更1】advMastery.ts — 遅延確認のunseenRatio条件を免除。
対象: /Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/adventure/advMastery.ts
現コード(L104):
  const delayed = qualifying.some((a) => a.completedAt >= opensAt);
新コード:
  // 遅延確認は「7日後も忘れていないか」の確認（§15③）。初見比率は①のqualifying 3日で担保済み。
  // 毎日続けるほど未出問題が枯れて確認が永久に通らない行き止まり（原則15違反）を防ぐため、
  // 遅延確認の試行には unseenRatio 条件を課さない（80%以上のみ要求）。
  const delayed = all.some((a) => a.scorePct >= MASTERY_RULES.passPct && a.completedAt >= opensAt);

【変更2】advRoute.ts — stage攻略を「配下target全mastered」の導出値に変更（midboss起動UIを新設しない最小修正）。
対象: /Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/adventure/advRoute.ts、currentStageOf(L209)の直前に追加:
/** stage攻略判定に使う配下target一覧（stageContentのgrammar解決規則と同一に保つこと） */
export const stageMasteryTargetIds = (
  stage: AdvRouteStage, allN3GrammarIds: string[], n2ByUnit: Map<number, string[]>,
): string[] => {
  const ids: string[] = [...(stage.targets.n3UnitIds ?? [])];
  if (stage.targets.n3GrammarIds && stage.targets.n3GrammarIds.length > 0) ids.push(...stage.targets.n3GrammarIds);
  else if (stage.kind === 'n3_grammar') ids.push(...allN3GrammarIds);
  if (stage.targets.n2Units) for (const u of stage.targets.n2Units) ids.push(...(n2ByUnit.get(u) ?? []));
  return ids;
};

/** stage攻略の導出値。配下targetがすべてmasteredなら攻略。ボス撃破記録（ledger[stageId]がmastered）があればそれも攻略 */
export const deriveMasteredStageIds = (
  route: AdvRoute, masteredTargets: Set<string>,
  allN3GrammarIds: string[], n2ByUnit: Map<number, string[]>,
): Set<string> => {
  const done = new Set<string>();
  for (const s of route.stages) {
    if (masteredTargets.has(s.stageId)) { done.add(s.stageId); continue; }
    const ids = stageMasteryTargetIds(s, allN3GrammarIds, n2ByUnit);
    if (ids.length > 0 && ids.every((id) => masteredTargets.has(id))) done.add(s.stageId);
  }
  return done;
};

【変更3】advQuest.ts — 導出値を受け取れるようにする。
GenerateQuestInput(L20-44)へ追加:
  /** stage攻略の導出値（deriveMasteredStageIds）。未指定時は従来のledger[stageId]判定 */
  masteredStageIds?: Set<string>;
現コード(L105):
  const done = masteredStageIds(profile.mastery, route.stages.map((s) => s.stageId), input.nowISO);
新コード:
  const done = input.masteredStageIds
    ?? masteredStageIds(profile.mastery, route.stages.map((s) => s.stageId), input.nowISO);

【変更4】AdvShell.tsx — 3箇所で導出値を使う。
対象: /Users/shocchan/badminton-aicourse/src/components/ai-course/adventure/AdvShell.tsx
(a) L11のimportに deriveMasteredStageIds を追加。
(b) 効果内 現コード(L202-204):
      const mastered = masteredTargetIds(profile.mastery, nowISO);
      const stage = currentStageOf(profile.route!, mastered) ?? profile.route!.stages[profile.route!.stages.length - 1];
      const ct = await stageContent(stage, mastered);
新コード:
      const mastered = masteredTargetIds(profile.mastery, nowISO);
      const stageDone = deriveMasteredStageIds(profile.route!, mastered, p.n3Ids, p.n2ByUnit);
      const stage = currentStageOf(profile.route!, stageDone) ?? profile.route!.stages[profile.route!.stages.length - 1];
      const ct = await stageContent(stage, mastered);
さらに setQuest(generateTodayQuest({...})) の引数(L222-236)の `dateKey, nowISO, daysToExam,` の行に続けて `masteredStageIds: stageDone,` を追加。
(c) home 現コード(L969-970):
  const mastered = masteredTargetIds(prof.mastery, nowISO);
  const stage = currentStageOf(route, mastered);
新コード:
  const mastered = masteredTargetIds(prof.mastery, nowISO);
  const stageDone = pools ? deriveMasteredStageIds(route, mastered, pools.n3Ids, pools.n2ByUnit) : mastered;
  const stage = currentStageOf(route, stageDone);
あわせて L1049-1050 の routeProgressPct(route, mastered) 2箇所を routeProgressPct(route, stageDone) へ。
(d) complete view 現コード(L940): {routeProgressPct(route, mastered)}% → L865 `const mastered = ...` の直後に `const stageDone = pools ? deriveMasteredStageIds(route, mastered, pools.n3Ids, pools.n2ByUnit) : mastered;` を追加し {routeProgressPct(route, stageDone)}% へ。

UI文言変更なし。L360-362のmidboss記録コードは残してよい（deriveMasteredStageIdsが両立をカバー）。検証: advBattleMastery.test.ts / advMastery関連テストは「遅延確認attemptはunseenRatio<0.3でもmasteredになる」を新仕様として更新し npx vitest run。maxAttemptsKept後退問題は本修正で遅延確認がday10-11に完了し24件上限に達しなくなるため追加対処不要。

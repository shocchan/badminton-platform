# p1-zero-n3:P0-3 (P0)

## Evidence
実コード実行で確認（vite-nodeで buildVariantPool(N3_GRAMMAR_DRAFTS,'n3') を実測）: n3Ids=76件、byItemプールサイズ min=1 / 中央値=3 / max=5（全76件が24問未満、最小は n3g-kotogadekiru:1問 等）。構造上も advVariants.ts の生成は rec1+cloze最大2(L306)+meaning1+form1=最大5問/項目で上限が確定。30日全問正解シミュレーション（実コード）: プール1問・3問の項目とも day1で全問既出→day2以降unseenRatio=0<0.3→qualifying日数1のまま永遠に mastered 不可。よって stg-n3grammar の76項目はどれも攻略不能で、advQuest L110-114の前日回避により学ぶstepは先頭2項目を交互に出し続ける。指摘は正確。補足: N3ドラフトには unit フィールド（n3g-unit-1〜10・用法系統の束）が既にあり、束単位のプールは unit-1:18問/unit-2:20/unit-3:27/unit-4:27/unit-5:32/unit-6:33/unit-7:19/unit-8:27/unit-9:37/unit-10:8問（実測）。qualifying3日には束プール17問以上が必要なので unit-10 のみ隣接束への合流が必要。N2文法178項目も同じ生成器で同構造の問題を持つ（監査スコープ外だが同修正パターンが必要になる点に留意）。

## FixSpec
監査の選択肢(ii)「単元束（合同プール）でmastery判定」を採る（変種24問×76項目の新規執筆は§17 canonical再利用方針に反し現実的でない）。P0-2適用後に実施。

【変更1】advContent.ts — 束プールと対応表を追加。
対象: /Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/adventure/advContent.ts
(a) GrammarPools(L32-38)へ追加:
  /** N3文法の束（draft.unit）→ 束ID。項目単位ではプールが1〜5問しかなくmastery不可能なため、mastery/バトルは束単位 */
  n3BundleByItem: Map<string, string>;
  n3BundleIds: string[];
(b) loadGrammarPools(L98-118)内、byItem構築後に追加:
  // N3文法は束（draft.unit）でmastery判定する。8問しかないunit-10はunit-9へ合流（qualifying3日には17問以上必要）
  const N3_BUNDLE_MERGE: Record<string, string> = { 'n3g-unit-10': 'n3g-unit-9' };
  const n3BundleByItem = new Map<string, string>();
  for (const d of N3_GRAMMAR_DRAFTS) {
    const bundle = N3_BUNDLE_MERGE[d.unit] ?? d.unit;
    n3BundleByItem.set(d.grammarId, bundle);
    const list = byItem.get(bundle) ?? [];
    list.push(...(n3Pool.byItem.get(d.grammarId) ?? []));
    byItem.set(bundle, list);
  }
  const n3BundleIds = [...new Set(n3BundleByItem.values())];
（poolCacheへ n3BundleByItem, n3BundleIds を含める）
(c) stageContent(L180-211): nextGrammarIds の算出を「束がmasteredなら学習済み」に変更。
現コード(L194): const nextGrammarIds = grammarIds.filter((g) => !masteredIds.has(g));
新コード: const nextGrammarIds = grammarIds.filter((g) => !masteredIds.has(g) && !masteredIds.has(pools.n3BundleByItem.get(g) ?? ''));
現コード(L209): const battleTargetIds = [...nextUnitIds, ...nextGrammarIds];
新コード: const battleTargetIds = [...nextUnitIds, ...new Set(nextGrammarIds.map((g) => pools.n3BundleByItem.get(g) ?? g))];
あわせて StageContent(L171-177)へ `grammarBundleByItem: Map<string, string>;` を追加し、return に `grammarBundleByItem: pools.n3BundleByItem` を含める。

【変更2】advQuest.ts — バトルのrefを束IDにする（学ぶstepは項目IDのまま）。
QuestContentAvailability(L11-18)へ追加:
  /** grammarId → mastery束ID（N3はn3g-unit-*）。無指定時は項目IDのまま */
  grammarBundleByItem?: Map<string, string>;
stageSteps 現コード(L84): const battleRef = g ?? u ?? stage.stageId;
新コード: const battleRef = g ? (avail.grammarBundleByItem?.get(g) ?? g) : (u ?? stage.stageId);
（stageStepsの引数availはそのまま。呼び出し側変更不要）

【変更3】AdvShell.tsx
(a) 効果内 availability(L225-228)へ `grammarBundleByItem: ct.grammarBundleByItem,` を追加。
(b) 文法学習後の確認バトル(L601)の targetId/targetIds を束へ: setBattle({ tier: 'normal', targetId: pools.n3BundleByItem.get(studyGrammarId) ?? studyGrammarId, ..., targetIds: [pools.n3BundleByItem.get(studyGrammarId) ?? studyGrammarId] })（現L601の実コードを読み、studyGrammarIdの出現箇所を置換）。
(c) weakGrammarIds(L207-209)は変更不要（束ID n3g-unit-* も 'n3g-' で始まるためフィルタを通り、束プールがbyItemに実在する）。

【変更4】advRoute.ts — P0-2で追加した stageMasteryTargetIds のgrammar解決を束へ。
現コード（P0-2適用後）:
  if (stage.targets.n3GrammarIds && stage.targets.n3GrammarIds.length > 0) ids.push(...stage.targets.n3GrammarIds);
  else if (stage.kind === 'n3_grammar') ids.push(...allN3GrammarIds);
新コード（シグネチャに n3BundleByItem: Map<string, string> を追加し、呼び出し側 deriveMasteredStageIds / AdvShell / P1-1修正にも引き回す）:
  const gs = (stage.targets.n3GrammarIds && stage.targets.n3GrammarIds.length > 0)
    ? stage.targets.n3GrammarIds
    : (stage.kind === 'n3_grammar' ? allN3GrammarIds : []);
  ids.push(...new Set(gs.map((g) => n3BundleByItem.get(g) ?? g)));

新規UI文言なし（バトル名は encounterName が skills から自動決定）。既存learnerの項目単位 n3g-* attempt履歴は台帳に残るが evidence 集計はbySkillベースのため無害。検証: npx vitest run（advQuest/advContent/advMapModel系テストのtarget期待値を束IDへ更新）。手動確認は「N3文法stageでバトルを3日+遅延確認まで進め、束が mastered になり学ぶstepが次の項目群へ進むこと」。

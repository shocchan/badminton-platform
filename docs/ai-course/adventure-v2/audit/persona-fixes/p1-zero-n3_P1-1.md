# p1-zero-n3:P1-1 (P1)

## Evidence
コードは指摘どおり実在。advQuest.ts L84 `const battleRef = g ?? u ?? stage.stageId;`、AdvShell.tsx L1013-1016 で targets=[stg-*] のままバトル起動、プール(loadGrammarPools byItem)に stg-foundation/stg-n3bridge/stg-n3practice/stg-n3grammar/stg-n3boss が存在しないことを実行時に実測（全てfalse）、AdvBattleRunner.tsx L81-92 の空編成フォールバック（もどるだけ）に到達する。ただし発生条件の補正が1点: nextGrammarIds/nextUnitIdsが空になるのは配下targetのmastered後であり、P0-2/P0-3が未修正の現状ではmastered自体が不可能なため、この行き止まりは「現状は潜在・P0-2/P0-3修正後に顕在化」する（修正後はルート最終stage完了時に毎日の主CTAが空バトルになる）。P0-2の修正でstage束バトルを通す設計にする以上、合同プール接続は必須という監査の論旨は正しい。実在と判定。

## FixSpec
P0-2/P0-3適用後に実施。対象: /Users/shocchan/badminton-aicourse/src/components/ai-course/adventure/AdvShell.tsx runStep のbattle分岐。
現コード(L1013-1017):
    if (s.kind === 'battle') {
      const targets = s.refIds.length > 0 ? s.refIds : (stageCt?.battleTargetIds ?? []);
      setBattle({ tier: (s.tier ?? 'normal'), targetId: targets[0] ?? (stage?.stageId ?? 'stage'), targetLabel: stage ? tx(lang, stage.titleJa, stage.titleZh) : '', targetIds: targets });
      setView('battle'); return;
    }
新コード:
    if (s.kind === 'battle') {
      let targets = s.refIds.length > 0 ? s.refIds : (stageCt?.battleTargetIds ?? []);
      let tier: AdvEnemyTier = s.tier ?? 'normal';
      // stage束バトル: stg-* はプールに実在しないため、配下target全体の合同プールへ展開する（維持リハーサル）。
      // normal tierは buildEncounter が targetIds を1件へ切り詰めるため、束は strong で出す
      const st = route.stages.find((x) => targets.includes(x.stageId));
      if (pools && st && targets.every((t) => !pools.byItem.has(t))) {
        targets = stageMasteryTargetIds(st, pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem);
        tier = 'strong';
      }
      const label = st ?? stage;
      setBattle({ tier, targetId: s.refIds[0] ?? (stage?.stageId ?? 'stage'), targetLabel: label ? tx(lang, label.titleJa, label.titleZh) : '', targetIds: targets });
      setView('battle'); return;
    }
import追加: L11のadvRoute importへ stageMasteryTargetIds（AdvEnemyTierはL8で既にimport済み）。targetIdは stg-* のまま残す（維持リハーサルのattemptが個別unit台帳を汚さない）。AdvBattleRunner L81-92の空編成フォールバックは最終ガードとして残す。新規UI文言なし。検証: 全target攻略済みプロファイルを作り、今日の冒険のバトルが空画面でなくstrongバトル（配下合同プール）になること。

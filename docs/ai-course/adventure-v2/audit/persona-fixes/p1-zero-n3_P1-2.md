# p1-zero-n3:P1-2 (P1)

## Evidence
実コードで全て確認。AdvShell.tsx L381 `const sets = readingSetsFor(level).slice(0, 3);`・L399 listening同様。readingSetsFor/listeningSetsForは配列定義順のフィルタのみ（readingBank.ts L32-33, listeningBank.ts L47-48）で、実測により先頭3セットは常に n3r-short-01/02/03（全てN3 shortPassage）・n3l-task-01/02/03。バンクは各100セットあるのに残り97セットへ到達する経路がクエストstepに無い（refIds=ex.readingTargetIds.slice(0,1)はrunnerに渡されず無視される）。L171 `unseenRatio: 1` 固定・L177 `unseen: r.total` 固定を確認。これにより同一3セットの再演が毎回「未出100%」としてmastery台帳(targetId=reading-n3等)とcollectSkillEvidenceのunseenQuestionCountへ計上され、OVERALL_READINESS_REQUIREMENT.minUnseenPerSkill=10 の暗記対策(advExamSkills.ts L108-122)を無効化する。PRODUCT_CANON原則9・13違反の指摘は正確。

## FixSpec
対象: /Users/shocchan/badminton-aicourse/src/components/ai-course/adventure/AdvShell.tsx のみ。

【変更1】import。L44を `import { readingSetsFor, readingTargetIds, readingPool, readingKeyOf } from '../../../lib/aiLesson/course/adventure/reading/readingBank';` へ、L45を `import { listeningSetsFor, listeningTargetIds, listeningPool, listeningKeyOf } from '../../../lib/aiLesson/course/adventure/listening/listeningBank';` へ。L25を `import { seededShuffle, type DiagnosisPools } from '../../../lib/aiLesson/course/adventure/advDiagnosis';` へ（readingKeyOf=`read:${setId}`・listeningKeyOf=`listen:${setId}` はrunnerの記録キーと同一形式であることを確認済み）。

【変更2】読解の選出。
現コード(L381):
    const sets = readingSetsFor(level).slice(0, 3);
新コード:
    // 毎日同じ先頭3セットの再演で証拠を貯めない（原則9）。未出セット優先・日替わりの決定的選出
    const seenR = seenQuestionKeys(prof.mastery);
    const allR = readingSetsFor(level);
    const seedR = [...dateKey].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11);
    const sets = [
      ...seededShuffle(allR.filter((s) => !seenR.has(readingKeyOf(s))), seedR),
      ...seededShuffle(allR.filter((s) => seenR.has(readingKeyOf(s))), seedR),
    ].slice(0, 3);

【変更3】聴解の選出。
現コード(L399):
    const sets = listeningSetsFor(level).slice(0, 3);
新コード:
    const seenL = seenQuestionKeys(prof.mastery);
    const allL = listeningSetsFor(level);
    const seedL = [...dateKey].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 13);
    const sets = [
      ...seededShuffle(allL.filter((s) => !seenL.has(listeningKeyOf(s))), seedL),
      ...seededShuffle(allL.filter((s) => seenL.has(listeningKeyOf(s))), seedL),
    ].slice(0, 3);

【変更4】recordSkillResult の実測unseen化。
現コード(L167-178):
    const targetId = `${skill}-${prof0()?.targetJlpt ?? 'N2'}`.toLowerCase();
    const attempt: AdvMasteryAttempt = {
      dateKey,
      scorePct: r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100),
      unseenRatio: 1,
      questionKeys: r.keys,
      tier: 'normal',
      timed: false,
      completedAt: new Date().toISOString(),
      skills: [skill],
      bySkill: { [skill]: { correct: r.correct, total: r.total, unseen: r.total } },
    };
新コード:
    const targetId = `${skill}-${prof0()?.targetJlpt ?? 'N2'}`.toLowerCase();
    // 実測の未出比率を記録する。1固定は同一セット再演を「未出100%の証拠」として
    // mastery台帳・準備度へ水増し計上してしまう（原則9・13）
    const seenBefore = seenQuestionKeys(p.mastery);
    const unseenCount = r.keys.filter((k) => !seenBefore.has(k)).length;
    const attempt: AdvMasteryAttempt = {
      dateKey,
      scorePct: r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100),
      unseenRatio: r.keys.length === 0 ? 0 : Math.round((unseenCount / r.keys.length) * 100) / 100,
      questionKeys: r.keys,
      tier: 'normal',
      timed: false,
      completedAt: new Date().toISOString(),
      skills: [skill],
      bySkill: { [skill]: { correct: r.correct, total: r.total, unseen: unseenCount } },
    };

新規UI文言なし。P0-1のstageゲートとの整合: 読解・聴解が出るのは基礎stage通過後なので、N3セット100本×3本/日で約1か月は未出が持続し、その後は既出再演がunseenRatio実測0として正直に記録される。検証: npx vitest run と、同一プロファイルで2日連続読解を開き別セットが出ること・準備度のunseenQuestionCountが2日目以降増えないこと。

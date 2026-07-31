// 正解位置分布の統計検証（ASSESSMENT INTEGRITY §14）。
// 実行: npm run validate:ai-course-answer-distribution
// 10,000 battle相当を実データのプールから生成し、正解位置の偏り・連続を検査する。
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadGrammarPools } from '../../src/lib/aiLesson/course/adventure/advContent';
import { buildEncounter } from '../../src/lib/aiLesson/course/adventure/advBattle';
import { analyzeDistribution, correctPositionOf } from '../../src/lib/aiLesson/course/adventure/advChoiceOrder';

const BATTLES = 10000;

const run = async () => {
  const pools = await loadGrammarPools();
  const targets = [...pools.n2Ids, ...pools.n3Ids].filter((id) => (pools.byItem.get(id) ?? []).length > 0);
  if (targets.length === 0) { console.error('no question pool'); process.exit(1); }

  const battles = [];
  const failedBattleIds: string[] = [];
  for (let b = 0; b < BATTLES; b++) {
    // 実運用と同じ経路: 敵編成 → 提示順（battle内でバランス調整）
    const pick = [targets[(b * 7) % targets.length], targets[(b * 13 + 3) % targets.length]];
    const enc = buildEncounter({
      tier: b % 5 === 0 ? 'strong' : 'normal',
      targetIds: pick, pool: pools.byItem,
      seenKeys: new Set(), recentWrongKeys: new Set(),
      seed: b * 7919 + 13, attemptSeed: b * 104729 + 7,
    });
    if (enc.presented.length === 0) continue;
    battles.push(enc.presented);
    // battle単体の3連続チェック
    let streak = 1;
    for (let i = 1; i < enc.presented.length; i++) {
      if (correctPositionOf(enc.presented[i]) === correctPositionOf(enc.presented[i - 1])) streak += 1;
      else streak = 1;
      if (streak >= 3) { failedBattleIds.push(`battle-${b}`); break; }
    }
  }

  const stats = analyzeDistribution(battles, 4);
  const out = {
    generatedAt: new Date().toISOString(),
    battles: battles.length,
    totalQuestions: stats.totalQuestions,
    positionCounts: stats.positionCounts,
    positionPct: stats.positionPct,
    maxStreak: stats.maxStreak,
    chiSquare: stats.chiSquare,
    failedBattleIds: failedBattleIds.slice(0, 20),
    failedBattleCount: failedBattleIds.length,
    seedFormula: 'attemptSeed = b * 104729 + 7',
    pass: stats.pass && failedBattleIds.length === 0,
    failures: stats.failures,
  };
  mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });
  writeFileSync('docs/ai-course/adventure-v2/generated/answer-distribution.json', JSON.stringify(out, null, 1));

  console.log(`battles=${out.battles} questions=${out.totalQuestions}`);
  console.log(`position counts: ${stats.positionCounts.join(' / ')}`);
  console.log(`position pct   : ${stats.positionPct.map((p) => `${p}%`).join(' / ')}`);
  console.log(`maxStreak=${stats.maxStreak} chiSquare=${stats.chiSquare} failedBattles=${failedBattleIds.length}`);
  if (out.failures.length > 0) console.error('failures:', out.failures.join('; '));
  console.log(`result: ${out.pass ? 'PASS' : 'FAIL'}`);
  if (!out.pass) process.exit(1);
};

void run();

// プラン別の採算レポート（§16 管理者向け集計）。
//
// 実行: npm run report:ai-course-economics
//
// 実績データ（購入記録）がまだ無いので、既定では **販売前の見積り** を出す。
//   - 「上限まで使い切られた最悪ケースで、1件あたりいくら残るか」
//   - 「何件の手動対応でその粗利が消えるか」
// この2つが、雨ざらし市場モデルで先に知っておくべき数字。
//
// 実績が入ったら `--from <json>` で集計結果を渡すと、同じ様式で実績側を出す。
// JSON は PlanUsageAggregate[] の形。

import { readFileSync } from 'node:fs';
import {
  computePlanEconomics, worstCaseUnitEconomics, warningMessage,
  DEFAULT_COST_RATES, DEFAULT_THRESHOLDS,
  type PlanEconomics, type PlanUsageAggregate,
} from '../../src/lib/aiLesson/course/sales/unitEconomics';
import { purchasableSalesPlans, salesPlanById } from '../../src/lib/aiLesson/course/sales/planConfig';

const yen = (n: number) => `¥${n.toLocaleString('en-US')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const printPlan = (e: PlanEconomics, plan = salesPlanById(e.planId)!) => {
  console.log(`\n── ${e.planName}（${e.planId}）`);
  console.log(`   売価           ${yen(plan.priceAmount)}（${plan.taxIncluded ? '税込' : '税抜'}）`);
  console.log(`   購入件数       ${e.purchases}`);
  console.log(`   売上(返金後)   ${yen(e.netRevenueJpy)}`);
  console.log('   ── 原価 ──');
  console.log(`   決済手数料     ${yen(e.paymentFeeJpy)}   [実績]`);
  console.log(`   音声会話       ${yen(e.voiceCostJpy)}   [見込み]`);
  console.log(`   AIレポート     ${yen(e.reportCostJpy)}   [見込み]`);
  console.log(`   インフラ配賦   ${yen(e.infraCostJpy)}   [配賦]`);
  console.log(`   手動対応       ${yen(e.manualSupportCostJpy)}   [${e.manualSupportCases}件 / ${e.manualSupportMinutes}分]`);
  console.log(`   原価合計       ${yen(e.totalCostJpy)}`);
  console.log('   ── 利益 ──');
  console.log(`   粗利益         ${yen(e.grossProfitJpy)}`);
  console.log(`   粗利率         ${pct(e.grossMargin)}`);
  console.log(`   1件あたり粗利  ${yen(e.grossProfitPerPurchaseJpy)}`);

  // 低単価商品でいちばん効く数字：何件の問い合わせで粗利が消えるか
  const supportCostPerCase = Math.round((10 / 60) * DEFAULT_COST_RATES.supportJpyPerHour);
  if (e.grossProfitJpy > 0) {
    const breakeven = Math.floor(e.grossProfitJpy / supportCostPerCase);
    console.log(
      breakeven === 0
        ? `   → 10分の問い合わせ対応が **1件でも入れば粗利は消える**（対応1件 ${yen(supportCostPerCase)} > 粗利 ${yen(e.grossProfitJpy)}）`
        : `   → 10分の問い合わせ対応 ${breakeven} 件で、この粗利は消える`,
    );
  }

  if (e.warnings.length > 0) {
    console.log('   ⚠ 警告');
    for (const w of e.warnings) console.log(`     - ${warningMessage(w)}`);
  }
};

const main = () => {
  const fromArg = process.argv.indexOf('--from');
  const path = fromArg >= 0 ? process.argv[fromArg + 1] : null;

  console.log('════════════════════════════════════════════');
  console.log(' AIコース プラン別 採算レポート');
  console.log('════════════════════════════════════════════');
  console.log(`為替想定       1USD = ¥${DEFAULT_COST_RATES.jpyPerUsd}`);
  console.log(`音声単価       $${DEFAULT_COST_RATES.voiceUsdPerMinute.toFixed(4)} / 分`);
  console.log(`人件費想定     ¥${DEFAULT_COST_RATES.supportJpyPerHour} / 時`);
  console.log(`粗利率の警告   ${pct(DEFAULT_THRESHOLDS.grossMarginWarn)} 未満`);

  if (path) {
    const rows = JSON.parse(readFileSync(path, 'utf8')) as PlanUsageAggregate[];
    console.log(`\n【実績】${path}`);
    for (const row of rows) printPlan(computePlanEconomics(row));
    return;
  }

  console.log('\n【販売前の見積り：上限まで使い切られた最悪ケース・1件あたり】');
  console.log('※ 実際の利用は上限より少ないので、ここで黒字なら実運用でも黒字になる');
  for (const plan of purchasableSalesPlans()) {
    if (plan.ctaMode === 'consult') {
      console.log(`\n── ${plan.nameJa}（${plan.planId}）`);
      console.log('   人が伴走する商品のため、この見積りの対象外（工数が主原価）');
      continue;
    }
    printPlan(worstCaseUnitEconomics(plan.planId));
  }
  console.log('\n実績を入れて出すには: npm run report:ai-course-economics -- --from <aggregate.json>');
};

main();

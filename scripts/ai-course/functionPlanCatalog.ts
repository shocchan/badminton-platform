// Edge Function 用の商品カタログを planCatalog.ts から生成する（単一ソース維持）。
//
// なぜ生成か: Edge Function（Deno）は src/ の planCatalog.ts を直接importできない。
// 手で写すと「カタログを直したのに決済金額だけ古い」という最悪の食い違いが起きるので、
// 生成 + drift検出テスト（planCatalog.test.ts）で機械的に同期させる。
//
// 再生成: npm run generate:ai-course-function-catalog
import { PLAN_CATALOG } from '../../src/lib/aiLesson/course/plans/planCatalog';

/** supabase/functions/_shared/aiCoursePlans.ts の中身を組み立てる */
export const buildFunctionPlanCatalogSource = (): string => {
  const plans = PLAN_CATALOG.map((p) => ({
    id: p.id,
    version: p.version,
    nameJa: p.nameJa,
    nameZh: p.nameZh,
    priceLabelJa: p.priceLabelJa,
    priceLabelZh: p.priceLabelZh,
    priceJpy: p.priceJpy,
    durationLabelJa: p.durationLabelJa,
    durationLabelZh: p.durationLabelZh,
    accessDays: p.accessDays,
    aiMinutes: p.aiMinutes,
    realtimeWindowMinutes: p.realtimeWindowMinutes,
    trialDays: p.trialDays ?? null,
    lessonCount: p.lessonCount,
    status: p.status,
  }));
  return [
    '// AUTO-GENERATED from src/lib/aiLesson/course/plans/planCatalog.ts — 手で編集しない。',
    '// 再生成: npm run generate:ai-course-function-catalog',
    '// drift は src/lib/aiLesson/course/plans/planCatalog.test.ts が検出する。',
    'export interface FunctionPlan {',
    '  id: string; version: number;',
    '  nameJa: string; nameZh: string;',
    '  priceLabelJa: string; priceLabelZh: string;',
    '  priceJpy: number | null;',
    '  durationLabelJa: string; durationLabelZh: string;',
    '  accessDays: number | null;',
    '  aiMinutes: number | null;',
    '  realtimeWindowMinutes: number | null;',
    '  trialDays: number | null;',
    '  lessonCount: number;',
    '  status: string;',
    '}',
    '',
    `export const FUNCTION_PLAN_CATALOG: FunctionPlan[] = ${JSON.stringify(plans, null, 2)};`,
    '',
    '/**',
    ' * セルフサービス決済できる商品か。**人間レッスンを含む商品（6か月コース）は',
    ' * サーバー側でも決済を拒否する**（10万円の誤決済・無断自動販売を構造的に防ぐ）。',
    ' */',
    'export const isSelfServePlan = (p: FunctionPlan): boolean =>',
    "  p.status === 'published' && p.lessonCount === 0 && p.priceJpy !== null && p.priceJpy > 0 && p.accessDays !== null;",
    '',
  ].join('\n');
};

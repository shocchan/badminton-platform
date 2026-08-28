// AUTO-GENERATED from src/lib/aiLesson/course/plans/planCatalog.ts — 手で編集しない。
// 再生成: npm run generate:ai-course-function-catalog
// drift は src/lib/aiLesson/course/plans/planCatalog.test.ts が検出する。
export interface FunctionPlan {
  id: string; version: number;
  nameJa: string; nameZh: string;
  priceLabelJa: string; priceLabelZh: string;
  priceJpy: number | null;
  durationLabelJa: string; durationLabelZh: string;
  accessDays: number | null;
  aiMinutes: number | null;
  realtimeWindowMinutes: number | null;
  trialDays: number | null;
  lessonCount: number;
  status: string;
}

export const FUNCTION_PLAN_CATALOG: FunctionPlan[] = [
  {
    "id": "ai-trial-pass",
    "version": 5,
    "nameJa": "AI体験パス",
    "nameZh": "AI体验通行证",
    "priceLabelJa": "600円（税込）",
    "priceLabelZh": "600日元（含税）",
    "priceJpy": 600,
    "durationLabelJa": "開始から7日間（購入後30日以内に開始）",
    "durationLabelZh": "开始后7天（购买后30天内开始）",
    "accessDays": 30,
    "aiMinutes": null,
    "realtimeWindowMinutes": null,
    "trialDays": 7,
    "lessonCount": 0,
    "status": "published"
  },
  {
    "id": "ai-month",
    "version": 4,
    "nameJa": "1か月 AI自学プラン",
    "nameZh": "1个月 AI自学方案",
    "priceLabelJa": "2,980円（税込）",
    "priceLabelZh": "2,980日元（含税）",
    "priceJpy": 2980,
    "durationLabelJa": "購入から30日間",
    "durationLabelZh": "购买后30天内",
    "accessDays": 30,
    "aiMinutes": null,
    "realtimeWindowMinutes": null,
    "trialDays": null,
    "lessonCount": 0,
    "status": "published"
  },
  {
    "id": "coach-6m",
    "version": 6,
    "nameJa": "6か月 AI日本語伴走コース",
    "nameZh": "6个月 AI日语陪跑课程",
    "priceLabelJa": "10万円（税込）",
    "priceLabelZh": "10万日元（含税）",
    "priceJpy": 100000,
    "durationLabelJa": "6か月",
    "durationLabelZh": "6个月",
    "accessDays": null,
    "aiMinutes": null,
    "realtimeWindowMinutes": null,
    "trialDays": null,
    "lessonCount": 24,
    "status": "published"
  }
];

/**
 * セルフサービス決済できる商品か。**人間レッスンを含む商品（6か月コース）は
 * サーバー側でも決済を拒否する**（10万円の誤決済・無断自動販売を構造的に防ぐ）。
 */
export const isSelfServePlan = (p: FunctionPlan): boolean =>
  p.status === 'published' && p.lessonCount === 0 && p.priceJpy !== null && p.priceJpy > 0 && p.accessDays !== null;

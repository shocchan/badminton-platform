// 決済サーバー（Edge Function）が使う商品データの生成。
//
// なぜ必要か:
//   サーバーはクライアントが送ってきた金額を信用せず、planId から自分で金額を引く。
//   そこで金額を Edge Function 側にも手で書くと **価格が2か所** になり、
//   片方だけ直したときに「料金ページは600円・決済は900円」の事故が起きる。
//   だから正準定義から機械的に出力し、drift はテストで検出する。
//
// 出力先: supabase/functions/_shared/planCatalog.json
// 再生成: npm run generate:ai-course-plan-catalog

import { SALES_PLAN_CATALOG } from './planConfig';

export interface ServerPlanEntry {
  planId: string;
  status: string;
  ctaMode: string;
  priceAmount: number;
  currency: string;
  planVersion: number;
  includedActiveMinutes: number | null;
  validityDays: number;
  durationDays: number;
  voiceMinutesCap: number;
  aiReportCap: number;
}

/** サーバーに要る項目だけを出す（表示文言は渡さない＝サーバーは文言を持たない） */
export const buildServerCatalog = (): ServerPlanEntry[] =>
  SALES_PLAN_CATALOG.map((p) => ({
    planId: p.planId,
    status: p.status,
    ctaMode: p.ctaMode,
    priceAmount: p.priceAmount,
    currency: p.currency,
    planVersion: p.version,
    includedActiveMinutes: p.includedActiveMinutes,
    validityDays: p.validityDays,
    durationDays: p.durationDays,
    voiceMinutesCap: p.cost.voiceMinutesCap,
    aiReportCap: p.cost.aiReportCap,
  }));

export const serializeServerCatalog = (): string =>
  `${JSON.stringify(buildServerCatalog(), null, 2)}\n`;

export const SERVER_CATALOG_RELATIVE_PATH = 'supabase/functions/_shared/planCatalog.json';

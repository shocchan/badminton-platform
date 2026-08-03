// 発行する契約が、商品カタログと一致していること。
//
// 発行時に 'six_month_coaching' という**カタログに無いID**を台帳へ書いていた。
// 台帳からプランを引けない＝人間レッスン24回も期間180日も辿れない。
// 契約の中身は発行のたびに数字を書くのではなく、カタログから引く。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { salesPlanById, SALES_PLAN_CATALOG } from './planConfig';

const ADMIN = readFileSync(join(process.cwd(), 'worker/aiCourseAdmin.ts'), 'utf8');
const ISSUE_PAGE = readFileSync(join(process.cwd(), 'src/pages/ai-lesson/AiCourseIssuePage.tsx'), 'utf8');

describe('半年伴走コースの発行', () => {
  const plan = salesPlanById('coach-6m');

  it('カタログに coach-6m がある', () => {
    expect(plan).toBeTruthy();
  });

  it('人間レッスンは24回、期間は180日', () => {
    expect(plan!.humanLessonCount).toBe(24);
    expect(plan!.durationDays).toBe(180);
  });

  it('発行処理はカタログに実在するIDを既定にする', () => {
    const id = ADMIN.match(/SIX_MONTH_PLAN_ID: SalesPlanId = '([^']+)'/)?.[1];
    expect(id, '既定のプランIDが読み取れない').toBeTruthy();
    expect(salesPlanById(id as never), `${id} はカタログに無い`).toBeTruthy();
  });

  it('発行画面もカタログに実在するIDを送る', () => {
    const id = ISSUE_PAGE.match(/planId: '([^']+)'/)?.[1];
    expect(id, '発行画面のプランIDが読み取れない').toBeTruthy();
    expect(salesPlanById(id as never), `${id} はカタログに無い`).toBeTruthy();
  });

  it('カタログに無いIDを台帳へ書かない', () => {
    // 過去に書いていた文字列が残っていないこと
    const ids = SALES_PLAN_CATALOG.map((p) => p.planId as string);
    for (const src of [ADMIN, ISSUE_PAGE]) {
      const written = [...src.matchAll(/plan(?:Id)?: '([a-z0-9_-]+)'/gi)].map((m) => m[1]);
      for (const w of written) {
        expect(ids, `${w} はカタログに無いプランID`).toContain(w);
      }
    }
  });

  it('人間レッスン回数を発行処理へ直書きしない（カタログから引く）', () => {
    expect(ADMIN).toContain('plan.humanLessonCount');
    expect(ADMIN).not.toMatch(/humanLessonCount:\s*24/);
  });
});

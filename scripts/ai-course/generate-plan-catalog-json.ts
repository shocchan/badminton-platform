// PlanConfig から Edge Function 用の商品JSONを書き出す。
// 生成ロジックは src/lib/aiLesson/course/sales/serverCatalog.ts にある（テストから同じ関数を使うため）。
//
// 実行: npm run generate:ai-course-plan-catalog

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  serializeServerCatalog, buildServerCatalog, SERVER_CATALOG_RELATIVE_PATH,
} from '../../src/lib/aiLesson/course/sales/serverCatalog';

const out = join(process.cwd(), SERVER_CATALOG_RELATIVE_PATH);
writeFileSync(out, serializeServerCatalog(), 'utf8');
console.log(`✅ wrote ${SERVER_CATALOG_RELATIVE_PATH} (${buildServerCatalog().length} plans)`);

// Edge Function 用カタログ（supabase/functions/_shared/aiCoursePlans.ts）を再生成する。
// 使い方: npm run generate:ai-course-function-catalog
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFunctionPlanCatalogSource } from './functionPlanCatalog';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'supabase', 'functions', '_shared', 'aiCoursePlans.ts');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buildFunctionPlanCatalogSource());
console.log(`✅ generated: ${out}`);

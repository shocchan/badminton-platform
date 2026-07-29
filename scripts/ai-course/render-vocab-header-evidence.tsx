// ことば図鑑ヘッダー（B）のモバイル実寸証拠用 静的harness。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-vocab-header-evidence.tsx
// CEO端末のChromeはフルスクリーン＋zoom固定でviewport変更が効かないため、
// ビルド済みCSSで同一コンポーネントを描画し、headless Chromeで390px幅を実測する。
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VocabularyHubHeader } from '../../src/components/ai-course/foundation/vocab/VocabularyHubHeader';
import { vocabCanonicalStats, VOCAB_FILTER_KEYS } from '../../src/lib/aiLesson/course/vocabCanonical';
import { aiCourseI18n } from '../../src/locales/aiCourse';

const ROOT = process.cwd();
const cssFile = readdirSync(join(ROOT, 'dist/assets')).find(f => /^index-.*\.css$/.test(f));
if (!cssFile) throw new Error('dist/assets の index CSS が見つかりません。npm run build を先に実行してください');
const css = readFileSync(join(ROOT, 'dist/assets', cssFile), 'utf8');

const stats = vocabCanonicalStats();
const stateCounts = { unseen: stats.total - 7, learning: 4, reviewing: 2, retained_candidate: 1 };
const completion = {
  requiredConfirmed: 6, requiredTotal: stats.roles.required,
  highRiskConfirmed: 2, highRiskTotal: stats.highRisk,
  requiredUsed: 3, requiredReviewConnected: 5, complete: false,
};

const page = (t: typeof aiCourseI18n.ja, tier: 'beginner' | 'advanced') => renderToStaticMarkup(
  <div className="bg-gray-50 p-3" style={{ width: 390 }}>
    <VocabularyHubHeader t={t} stats={stats} stateCounts={stateCounts} completion={completion} tier={tier} />
    <p className="text-xs font-bold text-gray-500 mb-2">{t.vocabScope.filterHeading}</p>
    <div className="flex flex-wrap gap-1.5 mb-2">
      {VOCAB_FILTER_KEYS.map((k, i) => (
        <span key={k} className={`min-h-9 px-2.5 py-1 text-xs rounded-full border inline-flex items-center ${i === 0 ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-gray-600 border-gray-200'}`}>
          {t.vocabScope.filters[k]}
        </span>
      ))}
    </div>
    <input type="search" placeholder={t.vocabScope.searchInFilter} readOnly
      className="w-full min-h-11 px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white" />
  </div>,
);

const html = (body: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
<body style="margin:0">${body}</body></html>`;

const OUT = '/private/tmp/claude-501/-Users-shocchan-ai-company/00d49b6c-fc42-44f2-98ce-6f75923d7976/scratchpad';
writeFileSync(join(OUT, 'vocab-header-ja-390.html'), html(page(aiCourseI18n.ja, 'beginner')));
writeFileSync(join(OUT, 'vocab-header-zh-390.html'), html(page(aiCourseI18n.zh, 'advanced')));
console.log('written: vocab-header-ja-390.html / vocab-header-zh-390.html');

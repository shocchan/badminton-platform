#!/usr/bin/env node
// リリース時点の正準カウントを1箇所で再実測する（手計算・過去報告の転記を禁止するため）。
// 出力: docs/ai-course/production/generated/release-inventory.json
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const dir = mkdtempSync(join(tmpdir(), 'relinv-'));
const entry = join(dir, 'e.mts');
writeFileSync(entry, `
import { ALL_CONVERSATION_PRACTICES } from '${root}/src/lib/aiLesson/course/vocabConversationPractice';
import { allVocabularyItems } from '${root}/src/lib/aiLesson/course/foundationVocabBank';
import { N3_ITEMS } from '${root}/src/lib/aiLesson/course/foundationVocabN3';
import { ALL_SCENES, ILLUSTRATION_MANIFEST, illustrationCoverage } from '${root}/src/lib/aiLesson/course/vocabIllustrationManifest';
import { CHAPTERS } from '${root}/src/lib/aiLesson/course/rpg/chapterRegistry';
const ids = [...new Set(allVocabularyItems().map(i => i.id))];
const starters = ALL_CONVERSATION_PRACTICES.map(p => p.starterQuestionJa);
const startersZh = ALL_CONVERSATION_PRACTICES.map(p => p.starterQuestionZh);
const cov = illustrationCoverage(ids);
console.log('@@' + JSON.stringify({
  vocabItems: ids.length,
  chapters: CHAPTERS.length,
  contextData: ALL_CONVERSATION_PRACTICES.length,
  contextMissing: ids.filter(id => !ALL_CONVERSATION_PRACTICES.some(p => p.itemId === id)),
  contextDead: ALL_CONVERSATION_PRACTICES.map(p => p.itemId).filter(id => !ids.includes(id)),
  dupStarterJa: starters.length - new Set(starters).size,
  dupStarterZh: startersZh.length - new Set(startersZh).size,
  scenes: ALL_SCENES.length,
  illustrationManifest: ILLUSTRATION_MANIFEST.length,
  illustrationAssetExists: cov.assetExists,
  illustrationLearnerVisible: cov.learnerVisible,
  illustrationMissing: cov.missing,
  illustrationHumanApproved: cov.humanApproved,
}));
`);
let payload;
try {
  const out = execFileSync(`${root}/node_modules/.bin/vite-node`, [entry], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  payload = JSON.parse(out.split('@@').pop().trim());
} catch (e) {
  console.error('INVENTORY FAILED:', e.message.slice(0, 400));
  process.exit(1);
}

// Loading: manifestの対象数と、実際にCourseLoadingへ接続されている箇所数
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : (/\.tsx?$/.test(p) && !/\.test\./.test(p) ? [p] : []);
});
const uiFiles = [...walk(join(root, 'src/components/ai-course')), ...walk(join(root, 'src/pages/ai-lesson'))];
let loadingConnections = 0, genericLeft = 0;
for (const f of uiFiles) {
  const s = readFileSync(f, 'utf8');
  loadingConnections += (s.match(/<CourseLoading|<CourseChunkLoading/g) ?? []).length;
  if (/vocab\/VocabImage|CourseLoading\.tsx$/.test(f)) continue;
  genericLeft += (s.match(/>\{t\.common\.loading\}</g) ?? []).length;
}
payload.loadingConnections = loadingConnections;
payload.loadingGenericLeft = genericLeft;

// learner-visibleな禁止語
const banned = /\bTODO\b|\bFIXME\b|準備中|准备中|coming\s*soon|lorem ipsum/i;
payload.learnerVisibleBanned = uiFiles.filter((f) => {
  const s = readFileSync(f, 'utf8').split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  return banned.test(s);
}).map((f) => f.replace(root + '/', ''));

payload.generatedAt = new Date().toISOString();
writeFileSync(join(root, 'docs/ai-course/production/generated/release-inventory.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));

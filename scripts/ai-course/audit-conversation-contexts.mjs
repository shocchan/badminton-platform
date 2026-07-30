#!/usr/bin/env node
/**
 * 会話文脈140語の品質監査（Phase B-2 検収）。
 * 出力は「件数・欠損・重複・FAIL」だけ。全文はダンプしない。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'ccaudit-'));
const entry = join(dir, 'entry.mts');
writeFileSync(entry, `
import { ALL_CONVERSATION_PRACTICES } from '${root}src/lib/aiLesson/course/vocabConversationPractice';
import { allVocabularyItems } from '${root}src/lib/aiLesson/course/foundationVocabBank';
import { N3_ITEMS } from '${root}src/lib/aiLesson/course/foundationVocabN3';
const items = [...allVocabularyItems(), ...N3_ITEMS];
console.log(JSON.stringify({ practices: ALL_CONVERSATION_PRACTICES, items: items.map(i => ({ id: i.id, level: (i as any).level ?? null, area: (i as any).areaId ?? (i as any).area ?? null, role: (i as any).role ?? null })) }));
`);
const out = execFileSync('npx', ['tsx', entry], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const { practices, items } = JSON.parse(out.trim().split('\n').pop());

const ids = [...new Set(items.map(i => i.id))];
const idSet = new Set(ids);
const dup = (arr) => { const seen = new Map(); const d = []; for (const [i, v] of arr.entries()) { if (seen.has(v)) d.push({ v, a: seen.get(v), b: i }); else seen.set(v, i); } return d; };

const covered = new Set(practices.map(p => p.itemId));
const missing = ids.filter(id => !covered.has(id));
const dead = practices.map(p => p.itemId).filter(id => !idSet.has(id));

const fields = ['themeJa','themeZh','starterQuestionJa','starterQuestionZh','followUpQuestionJa','followUpQuestionZh'];
const emptyBy = Object.fromEntries(fields.map(f => [f, practices.filter(p => !p[f] || !String(p[f]).trim()).map(p => p.itemId)]));
const noTarget = practices.filter(p => !p.targetExpressions?.length).map(p => p.itemId);
const supMismatch = practices.filter(p => (p.supportExpressionsJa?.length ?? 0) !== (p.supportExpressionsZh?.length ?? 0)).map(p => p.itemId);
const supThin = practices.filter(p => (p.supportExpressionsJa?.length ?? 0) < 3).map(p => p.itemId);

// 中国語らしさ: zh欄にかなが混入していないか（日本語混入検知）。
// ただし「」で囲んだ日本語表現の引用は正当（false friend対照に必要）なので除外する。
const kana = /[ぁ-んァ-ヴー]/;
const stripQuoted = (s) => String(s).replace(/[「『][^」』]*[」』]/g, '');
const zhHasKana = practices.filter(p => [p.starterQuestionZh, p.followUpQuestionZh, p.themeZh]
  .some(v => kana.test(stripQuoted(v)))).map(p => p.itemId);
const zhQuotesJa = practices.filter(p => [p.starterQuestionZh, p.followUpQuestionZh]
  .some(v => kana.test(String(v)) && !kana.test(stripQuoted(v)))).map(p => p.itemId);
// 日本語欄が中国語だけになっていないか（かな0＝疑わしい）
const jaNoKana = practices.filter(p => !kana.test(p.starterQuestionJa)).map(p => p.itemId);

// テンプレート量産検知: starter/theme/followUp/support の完全重複
const dupStarterJa = dup(practices.map(p => p.starterQuestionJa));
const dupStarterZh = dup(practices.map(p => p.starterQuestionZh));
const dupThemeJa = dup(practices.map(p => p.themeJa));
const dupThemeZh = dup(practices.map(p => p.themeZh));
const dupFollowJa = dup(practices.map(p => p.followUpQuestionJa));
const dupSupport = dup(practices.map(p => JSON.stringify(p.supportExpressionsJa)));

// 対象表現が語と無関係になっていないか（itemId語幹の粗いチェックは辞書が要るので、支援表現の同一性のみ）
const dupTarget = dup(practices.map(p => JSON.stringify([...p.targetExpressions].sort())));

// learner-visible placeholder
const bad = /TODO|FIXME|準備中|coming soon|placeholder|undefined|null/i;
const placeholders = practices.filter(p => fields.some(f => bad.test(String(p[f])))).map(p => p.itemId);

const R = {
  itemsTotal: ids.length,
  practicesTotal: practices.length,
  covered: covered.size,
  missing, dead,
  emptyFields: Object.fromEntries(Object.entries(emptyBy).filter(([, v]) => v.length)),
  noTargetExpressions: noTarget,
  supportLenMismatch: supMismatch,
  supportUnder3: supThin,
  zhContainsKana: zhHasKana,
  zhQuotesJapaneseTerm_ok: zhQuotesJa.length,
  jaWithoutKana: jaNoKana,
  duplicateStarterJa: dupStarterJa.length,
  duplicateStarterZh: dupStarterZh.length,
  duplicateStarterZhItems: dupStarterZh.map(x => [practices[x.a].itemId, practices[x.b].itemId, x.v]),
  duplicateThemeJa: dupThemeJa.length,
  duplicateThemeZh: dupThemeZh.length,
  duplicateThemeZhItems: dupThemeZh.map(x => [practices[x.a].itemId, practices[x.b].itemId, x.v]),
  duplicateFollowUpJa: dupFollowJa.length,
  duplicateSupportSets: dupSupport.length,
  duplicateTargetSets: dupTarget.length,
  duplicateTargetExamples: dupTarget.slice(0, 5).map(d => practices[d.b].itemId),
  learnerVisiblePlaceholder: placeholders,
};
const fail = R.missing.length || R.dead.length || Object.keys(R.emptyFields).length || R.noTargetExpressions.length
  || R.supportLenMismatch.length || R.zhContainsKana.length || R.jaWithoutKana.length
  || R.duplicateStarterJa || R.duplicateStarterZh || R.duplicateThemeJa || R.duplicateThemeZh || R.learnerVisiblePlaceholder.length;
console.log(JSON.stringify(R, null, 2));
console.log(fail ? 'AUDIT: FAIL' : 'AUDIT: PASS');
process.exit(fail ? 1 : 0);

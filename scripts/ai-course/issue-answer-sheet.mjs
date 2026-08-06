// 答案用紙（マークシート）を learner へ発行する（CEO運用スクリプト）。
//
// 何をするか:
//   用紙の定義JSONを settings.adventureV2.answerSheets へ**追記**する。
//   問題文はどこにも置かない（問題はCEOがWeChatで個別に送る・advAnswerSheet.ts冒頭）。
//
// 使い方:
//   1. 用紙JSONを書く（例は docs/ai-course/answer-sheets/example-paper.json）
//   2. node scripts/ai-course/issue-answer-sheet.mjs \
//        --email learner@example.com --paper path/to/paper.json --confirm
//   確認だけ（書き込みなし）: --confirm を付けずに実行
//
// 取り消し:
//   node scripts/ai-course/issue-answer-sheet.mjs \
//        --email learner@example.com --revoke <paperId> --confirm
//
// 安全:
//   - 既定は dry-run。--confirm が無ければ書き込まない
//   - 同じ paperId が既にあれば拒否（誤って二重発行しない）
//   - learner の他の settings には触れない（answerSheets だけを書き換える）
//   - 正解（correctChoices）は任意。入れなければ「先生が確認します」表示になる
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '../..');
const RUNNER = join(ROOT, 'scripts/ai-course/remote-sql.mjs');

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const email = arg('--email');
const paperPath = arg('--paper');
const revokeId = arg('--revoke');
const confirm = argv.includes('--confirm');

if (!email || (!paperPath && !revokeId)) {
  console.error('usage: --email <addr> (--paper <json> | --revoke <paperId>) [--confirm]');
  process.exit(2);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('refuse: emailの形式が不正'); process.exit(2); }

/** SQL内文字列リテラル用（jsonbはパラメータ化できないrunnerなので厳格にエスケープする） */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const sql = (query, opts = []) => {
  const tmp = join(tmpdir(), `sheet-${Date.now()}.sql`);
  writeFileSync(tmp, query);
  return execFileSync('node', [RUNNER, '--file', tmp, ...opts], { encoding: 'utf8' });
};

/* ── 用紙の検証（アプリ側 restorePaper と同じ制約。半端な正解は拒否する） ── */
const validatePaper = (p) => {
  const errs = [];
  if (typeof p.paperId !== 'string' || !/^[a-z0-9-]{3,60}$/.test(p.paperId)) {
    errs.push('paperId は英小文字・数字・ハイフン 3〜60字');
  }
  if (typeof p.titleJa !== 'string' || !p.titleJa) errs.push('titleJa が必要');
  if (typeof p.titleZh !== 'string' || !p.titleZh) errs.push('titleZh が必要');
  if (p.level !== 'N2' && p.level !== 'N3') errs.push('level は N2 か N3');
  if (!Array.isArray(p.sections) || p.sections.length === 0) errs.push('sections が必要');
  for (const [i, s] of (p.sections ?? []).entries()) {
    const at = `sections[${i}]`;
    if (typeof s.id !== 'string' || !s.id) errs.push(`${at}.id が必要`);
    if (typeof s.labelJa !== 'string' || !s.labelJa) errs.push(`${at}.labelJa が必要`);
    if (typeof s.labelZh !== 'string' || !s.labelZh) errs.push(`${at}.labelZh が必要`);
    if (!Number.isInteger(s.questionCount) || s.questionCount < 1 || s.questionCount > 120) {
      errs.push(`${at}.questionCount は 1〜120`);
    }
    if (!Number.isInteger(s.choiceCount) || s.choiceCount < 2 || s.choiceCount > 6) {
      errs.push(`${at}.choiceCount は 2〜6`);
    }
    if (!Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 300) errs.push(`${at}.minutes は 1〜300`);
    if (s.correctChoices !== undefined) {
      const ok = Array.isArray(s.correctChoices)
        && s.correctChoices.length === s.questionCount
        && s.correctChoices.every((c) => Number.isInteger(c) && c >= 1 && c <= s.choiceCount);
      if (!ok) errs.push(`${at}.correctChoices は 全${s.questionCount}問ぶん・1〜${s.choiceCount}（半端な正解では採点が嘘になるので拒否）`);
    }
  }
  return errs;
};

/* ── 現状確認 ── */
const current = sql(`
select l.id, l.settings->'adventureV2'->>'targetJlpt' as target,
       coalesce(jsonb_array_length(l.settings->'adventureV2'->'answerSheets'), 0) as sheet_count,
       (select coalesce(jsonb_agg(x->>'paperId'), '[]'::jsonb)
          from jsonb_array_elements(coalesce(l.settings->'adventureV2'->'answerSheets', '[]'::jsonb)) x) as paper_ids
from ai_learners l join auth.users u on u.id = l.user_id
where u.email = ${q(email)};
`);
console.log('── 対象learner ──');
console.log(current.trim());
if (!current.includes('|') || /\(0 rows\)/.test(current)) {
  console.error(`refuse: ${email} のlearnerが見つからない`);
  process.exit(1);
}
if (!/N2/.test(current)) {
  console.warn('⚠️ この learner の目標は N2 ではない。発行しても本人の画面に試験場は出ない（answerSheetsVisible）');
}

/* ── revoke ── */
if (revokeId) {
  const update = `
update ai_learners l set settings = jsonb_set(l.settings, '{adventureV2,answerSheets}',
  (select coalesce(jsonb_agg(x), '[]'::jsonb)
     from jsonb_array_elements(coalesce(l.settings->'adventureV2'->'answerSheets', '[]'::jsonb)) x
    where x->>'paperId' <> ${q(revokeId)}))
from auth.users u where u.id = l.user_id and u.email = ${q(email)};
select 'revoked' as result;
`;
  if (!confirm) { console.log('\n[dry-run] --confirm で実行:'); console.log(update); process.exit(0); }
  console.log(sql(update, ['--write', '--label', `answer-sheet-revoke-${revokeId}`]).trim());
  process.exit(0);
}

/* ── 発行 ── */
const paper = JSON.parse(readFileSync(paperPath, 'utf8'));
const errs = validatePaper(paper);
if (errs.length > 0) { console.error('refuse: 用紙JSONが不正:'); for (const e of errs) console.error(`  - ${e}`); process.exit(1); }
if (current.includes(paper.paperId)) {
  console.error(`refuse: paperId "${paper.paperId}" は既に発行済み（取り消しは --revoke）`);
  process.exit(1);
}
paper.issuedAtISO = new Date().toISOString();

const graded = paper.sections.every((s) => Array.isArray(s.correctChoices));
console.log(`\n発行内容: ${paper.paperId}（${paper.level}・${paper.sections.length}科目・` +
  `${paper.sections.reduce((n, s) => n + s.questionCount, 0)}問・` +
  `${graded ? '自己採点あり' : '採点は先生（正解未登録）'}）`);

const update = `
update ai_learners l set settings = jsonb_set(
  jsonb_set(l.settings, '{adventureV2}', coalesce(l.settings->'adventureV2', '{}'::jsonb)),
  '{adventureV2,answerSheets}',
  coalesce(l.settings->'adventureV2'->'answerSheets', '[]'::jsonb) || ${q(JSON.stringify(paper))}::jsonb)
from auth.users u where u.id = l.user_id and u.email = ${q(email)};
select 'issued' as result;
`;
if (!confirm) { console.log('\n[dry-run] --confirm で実行:'); console.log(update); process.exit(0); }
console.log(sql(update, ['--write', '--label', `answer-sheet-issue-${paper.paperId}`]).trim());
console.log('\n✅ 発行しました。問題そのものはWeChatで本人へ送ってください（アプリには問題を置かない）。');

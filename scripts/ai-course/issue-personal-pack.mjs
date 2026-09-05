// 個人復習パック（自分の書いた文章から復習する）を learner へ発行する（CEO運用スクリプト）。
//
// 何をするか:
//   パックJSONを settings.adventureV2.personalPacks へ**追記**する。
//   本人の記録（personalPack）には触らない＝作り直しても答えた記録は消えない。
//
// 使い方:
//   1. パックJSONを書く（様式は docs/ai-course/personal-packs/README.md）
//   2. node scripts/ai-course/issue-personal-pack.mjs \
//        --email learner@example.com --pack docs/ai-course/personal-packs/summer-20260824.json --confirm
//   確認だけ（書き込みなし）: --confirm を付けずに実行
//   実在生徒（protected-learners.json に載っている人）へ発行するときは --allow-protected も付ける
//
// 差し替え（内容を直したとき）:
//   同じ packId は二重発行しない。--replace を付けると同じIDの古いものを外して入れ直す
//
// 取り消し:
//   node scripts/ai-course/issue-personal-pack.mjs --email learner@example.com --revoke <packId> --confirm
//
// 安全:
//   - 既定は dry-run。--confirm が無ければ書き込まない
//   - アプリ側 restorePersonalPack と同じ制約で検証し、落ちる問題があれば発行しない
//     （黙って減らすと「N問あります」の表示が嘘になる）
//   - learner の他の settings には触れない
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '../..');
const RUNNER = join(ROOT, 'scripts/ai-course/remote-sql.mjs');

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const email = arg('--email');
const packPath = arg('--pack');
const revokeId = arg('--revoke');
const replace = argv.includes('--replace');
const confirm = argv.includes('--confirm');
// 実在生徒（protected-learners.json）への書き込みは remote-sql が既定で拒否する。
// 本人に発行するのが目的のスクリプトなので、明示フラグを付けたときだけ通す（監査ログに残る）
const allowProtected = argv.includes('--allow-protected');
const writeOpts = allowProtected ? ['--write', '--allow-protected'] : ['--write'];

if (!email || (!packPath && !revokeId)) {
  console.error('usage: --email <addr> (--pack <json> [--replace] | --revoke <packId>) [--confirm]');
  process.exit(2);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('refuse: emailの形式が不正'); process.exit(2); }

/** SQL内文字列リテラル用（jsonbはパラメータ化できないrunnerなので厳格にエスケープする） */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const sql = (query, opts = []) => {
  const tmp = join(tmpdir(), `personal-pack-${Date.now()}.sql`);
  writeFileSync(tmp, query);
  return execFileSync('node', [RUNNER, '--file', tmp, ...opts], { encoding: 'utf8' });
};

/** 空欄記号（advPersonalPack.ts の CLOZE_BLANK と同じもの） */
const CLOZE_BLANK = '＿＿';
const KINDS = new Set(['reading', 'meaning', 'cloze']);
const KANA = /^[ぁ-んー・\s]+$/;

/* ── パックの検証（アプリ側 restorePersonalPack と同じ制約＋運用上の注意） ── */
const validatePack = (p) => {
  const errs = [];
  const warns = [];
  if (typeof p.packId !== 'string' || !/^[a-z0-9-]{3,60}$/.test(p.packId)) {
    errs.push('packId は英小文字・数字・ハイフン 3〜60字');
  }
  if (typeof p.titleJa !== 'string' || !p.titleJa) errs.push('titleJa が必要');
  if (typeof p.titleZh !== 'string' || !p.titleZh) errs.push('titleZh が必要');
  if (!Array.isArray(p.items) || p.items.length === 0) errs.push('items が必要');
  if (Array.isArray(p.items) && p.items.length > 200) errs.push('items は200問まで');

  const seen = new Set();
  for (const [i, it] of (p.items ?? []).entries()) {
    const at = `items[${i}]`;
    if (typeof it.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(it.id)) errs.push(`${at}.id は英数字・- ・_ の1〜60字`);
    else if (seen.has(it.id)) errs.push(`${at}.id "${it.id}" が重複`);
    else seen.add(it.id);
    if (!KINDS.has(it.kind)) errs.push(`${at}.kind は reading / meaning / cloze`);
    if (typeof it.promptJa !== 'string' || !it.promptJa) errs.push(`${at}.promptJa が必要`);
    if (typeof it.answer !== 'string' || !it.answer) errs.push(`${at}.answer が必要`);
    const ds = Array.isArray(it.distractors)
      ? [...new Set(it.distractors.filter((d) => typeof d === 'string' && d !== '' && d !== it.answer))]
      : [];
    if (ds.length < 2) errs.push(`${at}.distractors は正解と違うものが2つ以上（2択未満は当てずっぽうで当たる）`);
    if (ds.length > 5) errs.push(`${at}.distractors は5つまで`);
    if (it.kind === 'cloze' && typeof it.promptJa === 'string'
      && it.promptJa.split(CLOZE_BLANK).length !== 2) {
      errs.push(`${at}.promptJa には空欄「${CLOZE_BLANK}」がちょうど1つ必要`);
    }
    // 答えが例文に書いてあると、意味が分からなくても写すだけで正解できる（2026-08-24 CEO指摘）
    if (typeof it.promptJa === 'string' && typeof it.answer === 'string' && it.answer
      && it.promptJa.includes(it.answer)) {
      errs.push(`${at}: 答え「${it.answer}」が例文にそのまま書いてある（写すだけで正解できる問題は出さない）`);
    }
    for (const d of ds) {
      if (typeof it.promptJa === 'string' && it.promptJa.includes(d)) {
        warns.push(`${at}: ダミー「${d}」が例文に出ている（消去法のヒントになる）`);
      }
    }
    // 以下は「発行はできるが、たいてい間違い」なので警告にとどめる
    if (it.kind === 'reading') {
      if (typeof it.target !== 'string' || !it.target) errs.push(`${at}.target（読ませる漢字語）が必要`);
      else if (typeof it.promptJa === 'string' && !it.promptJa.includes(it.target)) {
        warns.push(`${at}: 本文に「${it.target}」が見当たらない（本人の文から出題していない可能性）`);
      }
      if (typeof it.answer === 'string' && !KANA.test(it.answer)) {
        warns.push(`${at}: 読みの答え「${it.answer}」がひらがなでない`);
      }
      for (const d of ds) if (!KANA.test(d)) warns.push(`${at}: ダミー「${d}」がひらがなでない`);
    }
    // meaning は「日本語の表現 → 中国語の意味」を選ばせる向き（advPersonalPack.ts 冒頭）。
    // 選択肢に日本語（かな）が混ざっていたら、向きを間違えている可能性が高い
    if (it.kind === 'meaning') {
      if (typeof it.target !== 'string' || !it.target) errs.push(`${at}.target（日本語の表現）が必要`);
      const kana = /[ぁ-んァ-ヶ]/;
      if (typeof it.answer === 'string' && kana.test(it.answer)) {
        warns.push(`${at}: 答え「${it.answer}」に かな が入っている（meaning の答えは中国語の意味）`);
      }
    }
  }
  for (const [i, s] of (p.passages ?? []).entries()) {
    if (typeof s.textJa !== 'string' || !s.textJa) errs.push(`passages[${i}].textJa が必要`);
  }
  return { errs, warns };
};

/* ── 現状確認（remote-sql.mjs は「# OK label=...」ヘッダ行＋JSON配列を返す） ── */
const currentOut = sql(`
select l.id,
       coalesce(jsonb_array_length(l.settings->'adventureV2'->'personalPacks'), 0) as pack_count,
       (select coalesce(jsonb_agg(x->>'packId'), '[]'::jsonb)
          from jsonb_array_elements(coalesce(l.settings->'adventureV2'->'personalPacks', '[]'::jsonb)) x) as pack_ids
from ai_learners l join auth.users u on u.id = l.user_id
where u.email = ${q(email)};
`);
const jsonStart = currentOut.indexOf('[');
const rows = jsonStart >= 0 ? JSON.parse(currentOut.slice(jsonStart)) : [];
if (rows.length === 0) {
  console.error(`refuse: ${email} のlearnerが見つからない`);
  process.exit(1);
}
console.log('── 対象learner ──');
console.log(`id=${rows[0].id} 発行済みパック=${rows[0].pack_count}件 ${JSON.stringify(rows[0].pack_ids)}`);
const issuedIds = Array.isArray(rows[0].pack_ids) ? rows[0].pack_ids : [];

/** 指定IDのパックを外すSQL断片（発行し直しにも使う） */
const removeSql = (packId) => `
  (select coalesce(jsonb_agg(x), '[]'::jsonb)
     from jsonb_array_elements(coalesce(l.settings->'adventureV2'->'personalPacks', '[]'::jsonb)) x
    where x->>'packId' <> ${q(packId)})`;

/* ── 取り消し（本人の記録 personalPack は消さない。画面から見えなくなるだけ） ── */
if (revokeId) {
  const update = `
update ai_learners l set settings = jsonb_set(l.settings, '{adventureV2,personalPacks}', ${removeSql(revokeId)})
from auth.users u where u.id = l.user_id and u.email = ${q(email)};
select 'revoked' as result;
`;
  if (!confirm) { console.log('\n[dry-run] --confirm で実行:'); console.log(update); process.exit(0); }
  console.log(sql(update, [...writeOpts, '--label', `personal-pack-revoke-${revokeId}`]).trim());
  console.log('\n✅ 取り消しました（本人の答えた記録は残っています。同じIDで発行し直せば戻ります）。');
  process.exit(0);
}

/* ── 発行 ── */
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const { errs, warns } = validatePack(pack);
for (const w of warns) console.warn(`⚠️ ${w}`);
if (errs.length > 0) {
  console.error('refuse: パックJSONが不正:');
  for (const e of errs) console.error(`  - ${e}`);
  process.exit(1);
}
if (issuedIds.includes(pack.packId) && !replace) {
  console.error(`refuse: packId "${pack.packId}" は既に発行済み（内容を直したなら --replace／消すなら --revoke）`);
  process.exit(1);
}
pack.issuedAtISO = new Date().toISOString();

const byKind = pack.items.reduce((m, i) => ({ ...m, [i.kind]: (m[i.kind] ?? 0) + 1 }), {});
console.log(`\n発行内容: ${pack.packId}（${pack.items.length}問 ${JSON.stringify(byKind)}・`
  + `本文${(pack.passages ?? []).length}本）${issuedIds.includes(pack.packId) ? ' ※同IDを差し替え' : ''}`);

const base = issuedIds.includes(pack.packId)
  ? removeSql(pack.packId)
  : `coalesce(l.settings->'adventureV2'->'personalPacks', '[]'::jsonb)`;
const update = `
update ai_learners l set settings = jsonb_set(
  jsonb_set(l.settings, '{adventureV2}', coalesce(l.settings->'adventureV2', '{}'::jsonb)),
  '{adventureV2,personalPacks}',
  ${base} || ${q(JSON.stringify([pack]))}::jsonb)
from auth.users u where u.id = l.user_id and u.email = ${q(email)};
select 'issued' as result;
`;
if (!confirm) { console.log('\n[dry-run] --confirm で実行:'); console.log(update); process.exit(0); }
console.log(sql(update, [...writeOpts, '--label', `personal-pack-issue-${pack.packId}`]).trim());
console.log('\n✅ 発行しました。本人のメニュー「自分の文章で復習」に出ます。');

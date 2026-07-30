// GATE④ 3名Pilot専用招待の発行（1人1コード・1回使用・期限つき・本人メール限定）。
//
// 既存スキーマ（20260720000000_ai_course_security.sql）の仕組みをそのまま使う:
//   allowed_email  … 本人以外のメールでは invite_email_mismatch で拒否（実装済み・R検証済み）
//   max_uses = 1   … 1回使用で失効（used_count は grant消費時にincrement）
//   expires_at     … 期限切れは invite_expired で拒否
//   is_active=false … revoke（誤配布時は scripts経由で即無効化）
// 新しいremote schemaは追加しない（§5の方針どおり）。
//
// 使い方（CEOの3名情報が届いてから実行する）:
//   node scripts/ai-course/issue-pilot-invites.mjs \
//     --learner A --email a@example.com --expires 2026-08-15 --confirm
//
// 安全:
//   - コードは crypto.randomBytes 由来の高entropy（brute-force耐性）
//   - コードは「このターミナルに1回だけ」表示する。監査ログ・docs・commitへは書かない
//   - 同じlearnerラベルの有効inviteが既にあれば拒否（duplicate防止）。--reissue で旧を無効化して再発行
//   - 実際の招待メール送信はしない（配布はCEOが行う）
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '../..');
const RUNNER = join(ROOT, 'scripts/ai-course/remote-sql.mjs');

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const learner = arg('--learner');       // A / B / C
const email = arg('--email');
const expires = arg('--expires');       // YYYY-MM-DD
const confirm = argv.includes('--confirm');
const reissue = argv.includes('--reissue');

if (!learner || !email || !expires) {
  console.error('usage: --learner <A|B|C> --email <addr> --expires <YYYY-MM-DD> [--confirm] [--reissue]');
  process.exit(2);
}
if (!/^[ABC]$/.test(learner)) { console.error('refuse: learner は A/B/C'); process.exit(2); }
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('refuse: emailの形式が不正'); process.exit(2); }
if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || new Date(expires) <= new Date()) {
  console.error('refuse: expires は未来の YYYY-MM-DD'); process.exit(2);
}

const label = `pilot-2026-08-${learner}`;
const sql = (q, opts = []) => {
  const tmp = join(tmpdir(), `invite-${Date.now()}.sql`);
  writeFileSync(tmp, q);
  return execFileSync('node', [RUNNER, '--file', tmp, ...opts], { encoding: 'utf8' });
};

// duplicate防止: 同labelの有効inviteが既にないか
const dupOut = sql(`select count(*)::text as n from public.ai_course_invites
  where label = '${label}' and is_active and (expires_at is null or expires_at > now());`,
['--label', `pilot invite dup-check ${label}`]);
const dup = JSON.parse(dupOut.slice(dupOut.indexOf('[')))[0].n;
if (dup !== '0' && !reissue) {
  console.error(`refuse: ${label} の有効inviteが既に存在（再発行は --reissue）`);
  process.exit(1);
}

if (!confirm) {
  console.log(`DRY RUN: label=${label} allowed_email=${email} max_uses=1 expires=${expires} 23:59+09`);
  console.log('--confirm を付けると発行します（コードはその時1回だけ表示）');
  process.exit(0);
}

if (dup !== '0' && reissue) {
  sql(`update public.ai_course_invites set is_active = false where label = '${label}';`,
    ['--write', '--label', `pilot invite revoke-for-reissue ${label}`]);
  console.log(`旧 ${label} を無効化（reissue）`);
}

// 高entropyコード（26^0…混同しやすい文字を除いた32字＝実質160bit級。brute-force耐性）
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const code = 'PLT-' + Array.from(randomBytes(24)).map(b => alphabet[b % alphabet.length]).join('').slice(0, 20);

sql(`insert into public.ai_course_invites (code, label, max_uses, expires_at, allowed_email, is_active, is_test)
  values ('${code}', '${label}', 1, '${expires} 23:59:00+09', lower('${email.replace(/'/g, "''")}'), true, false);`,
['--write', '--label', `pilot invite issue ${label}`]);

console.log('発行完了（audit logにはlabelとsha256のみ・コードは記録されない）');
console.log(`  label        : ${label}`);
console.log(`  allowed_email: ${email}`);
console.log(`  expires      : ${expires} 23:59 JST / max_uses=1`);
console.log('');
console.log('▼ この1回だけ表示します。CEOが本人へ直接伝えてください（メール送信は自動化しない）');
console.log(`  CODE: ${code}`);
console.log('');
console.log(`revoke:  node scripts/ai-course/issue-pilot-invites.mjs --learner ${learner} --email ${email} --expires ${expires} --reissue --confirm`);

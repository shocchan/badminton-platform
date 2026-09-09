// 7日間の実力診断（無料）の招待コードを、配布経路ごとに発行する。2026-09-10。
//
// なぜ経路を分けるか:
//   小紅書・朋友圈・生徒紹介で**別のコード**を配ると、どこから来たかが受講権まで残る。
//   「どこへ配ると人が来るか」を勘ではなく数字で決められるようにするための1手間。
//
// 安全装置（create-student-login.mjs と同じ作法）:
//   - dry-run 既定。--confirm を付けたときだけ発行する
//   - project ref を照合してから動く（別プロジェクトへ誤射しない）
//   - service_role キーは Management API から都度取得し、標準出力へ出さない
//   - 発行したコードと配布用URLだけを出す
//
// 使い方:
//   node scripts/ai-course/issue-free-trial-invite.mjs --channel xhs --label "小紅書 2026-09"
//   node scripts/ai-course/issue-free-trial-invite.mjs --channel xhs --label "小紅書 2026-09" --confirm
//   --max 100          # 先着何人か（既定100）
//   --until 2026-12-06 # いつまで（既定: JLPT当日 2026-12-06）
//   --days 7           # 受講権の日数（既定7。紹介経由を14日にするならここ）
//   --list             # いま生きているコードの一覧（発行しない）
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REF = 'jdkwijdphlkrcoiggfqw';
const SUPA_URL = `https://${REF}.supabase.co`;
/** 生徒が実際に開くドメイン（WeChatが *.pages.dev を弾くため study. を使う） */
const SITE = 'https://study.kawabado.com';
/** 既定の締め切り。JLPT本番の日（この日を過ぎたら配らない） */
const DEFAULT_UNTIL = '2026-12-06';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (n) => argv.includes(n);

const ROOT = join(import.meta.dirname, '../..');
const linked = existsSync(join(ROOT, 'supabase/.temp/project-ref'))
  ? readFileSync(join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim() : '';
if (linked !== REF) {
  console.error(`refuse: linked project ref mismatch (linked="${linked}" expected="${REF}")`);
  process.exit(2);
}

const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!token) { console.error('refuse: no access token'); process.exit(2); }

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) { console.error(`SQL失敗: ${r.status} ${await r.text()}`); process.exit(1); }
  return await r.json();
};

/** 配布用URL。踏むと招待コードつきの登録画面へ着く */
const inviteUrl = (code, lang = 'zh') => `${SITE}/${lang}/ai-course/login?invite=${code}`;

if (flag('--list')) {
  const rows = await sql(`
    select code, coalesce(channel,'-') as channel, coalesce(label,'-') as label,
           plan_id, access_days, used_count, max_uses,
           coalesce(expires_at::date::text,'期限なし') as until, is_active
      from public.ai_course_invites
     where plan_id is not null
     order by created_at desc limit 50`);
  if (rows.length === 0) { console.log('（無料枠の招待コードはまだありません）'); process.exit(0); }
  for (const r of rows) {
    console.log(
      `${r.code}  ${String(r.channel).padEnd(16)} ${r.used_count}/${r.max_uses ?? '∞'}人  `
      + `${r.plan_id}/${r.access_days}日  〜${r.until}  ${r.is_active ? '' : '(停止中)'}`,
    );
    console.log(`   ${inviteUrl(r.code)}`);
    console.log(`   ${String(r.label)}`);
  }
  process.exit(0);
}

const channel = (arg('--channel') ?? '').trim();
const label = (arg('--label') ?? '').trim();
const max = Number(arg('--max') ?? 100);
const days = Number(arg('--days') ?? 7);
const until = (arg('--until') ?? DEFAULT_UNTIL).trim();

const CHANNELS = ['xhs', 'moments', 'student_referral', 'wechat', 'other'];
if (!CHANNELS.includes(channel)) {
  console.error(`usage: --channel <${CHANNELS.join('|')}> --label "説明" [--max 100] [--days 7] [--until ${DEFAULT_UNTIL}] [--confirm]`);
  console.error('       --list  いま生きているコードを見る');
  process.exit(2);
}
if (!label) { console.error('refuse: --label は必須（あとで何のコードか分からなくなる）'); process.exit(2); }
if (!Number.isInteger(max) || max < 1 || max > 5000) { console.error('refuse: --max は 1〜5000'); process.exit(2); }
if (!Number.isInteger(days) || days < 1 || days > 60) { console.error('refuse: --days は 1〜60'); process.exit(2); }
if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) { console.error('refuse: --until は YYYY-MM-DD'); process.exit(2); }

if (!flag('--confirm')) {
  console.log('DRY RUN: 発行しません');
  console.log(`  経路      : ${channel}`);
  console.log(`  説明      : ${label}`);
  console.log(`  プラン    : free-7d（AI会話0回・冒険は最初の3地域まで）`);
  console.log(`  受講権    : ${days}日`);
  console.log(`  先着      : ${max}人`);
  console.log(`  締め切り  : ${until}`);
  console.log('--confirm を付けると発行します');
  process.exit(0);
}

// 発行は SQL で直接（RPCは admin セッションを要求するため、ここでは同じ内容を postgres 権限で行う）
const esc = (s) => String(s).replace(/'/g, "''");
const [row] = await sql(`
  with gen as (
    select string_agg(substr('23456789ABCDEFGHJKMNPQRSTVWXYZ',
                             1 + floor(random() * 30)::int, 1), '') as code
      from generate_series(1, 8)
  )
  insert into public.ai_course_invites
    (code, label, max_uses, expires_at, is_active, is_test, plan_id, access_days, channel)
  select gen.code, '${esc(label)}', ${max}, '${until}T23:59:59+09:00'::timestamptz,
         true, false, 'free-7d', ${days}, '${esc(channel)}'
    from gen
  returning code`);

const code = row?.code;
if (!code) { console.error('発行に失敗しました'); process.exit(1); }

console.log(`✅ 発行しました  経路=${channel}  先着${max}人  ${days}日間  〜${until}`);
console.log('');
console.log('  中国語版（小紅書・朋友圈・微信はこちら）');
console.log(`  ${inviteUrl(code, 'zh')}`);
console.log('');
console.log('  日本語版');
console.log(`  ${inviteUrl(code, 'ja')}`);
console.log('');
console.log(`  コード: ${code}`);

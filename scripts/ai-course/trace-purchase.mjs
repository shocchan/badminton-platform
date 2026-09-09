// 実決済テストの追跡（2026-09-09）。**読み取り専用。**
//
// 【何のためか】
// 2026-08-20〜09-07 に checkout が14件開始され完了0件だったとき、
// 「誰も払わなかった」のか「払われたのに届かなかった」のかを区別できなかった。
// 記録が無く、Edge Function のログ保持は1日しかなかったため。
//
// 今回 CEO が ¥600 を実際に買うにあたって、
//   ① 開始 → ② Checkoutセッション作成 → ③ 支払い手段 → ④ statusの遷移
//   → ⑤ webhook受信 → ⑥ イベント保存 → ⑦ 台帳更新 → ⑧ アカウント発行
//   → ⑨ 体験開始 → ⑩ 自動ログイン
// のどこまで進んだかを、1つの時系列で出す。
//
// 【使い方】
//   node scripts/ai-course/trace-purchase.mjs                 直近3件を追う
//   node scripts/ai-course/trace-purchase.mjs --hours 2       直近2時間ぶん
//   node scripts/ai-course/trace-purchase.mjs --save          証拠をJSONで残す
//   node scripts/ai-course/trace-purchase.mjs --watch         15秒ごとに更新（購入中に開いておく）
//
// 【個人情報】
// buyer_email は「あるか無いか」だけを出す。session_id は末尾8桁。
// 失敗したときの証拠として残すのは、原因究明に要るものだけ。
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const HOURS = Number(arg('--hours', 24));
const LIMIT = Number(arg('--limit', 3));

/** remote-sql.mjs（読み取り専用の正準経路）に投げて JSON を返す */
const q = (label, sql) => {
  const out = execFileSync('node', [
    join(ROOT, 'scripts/ai-course/remote-sql.mjs'), '--label', label, '--sql', sql,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const start = out.indexOf('[');
  if (start < 0) throw new Error('想定外の応答:\n' + out.slice(0, 400));
  return JSON.parse(out.slice(start));
};

const jst = (iso) => (iso
  ? new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  : '—');

/** 台帳（購入セッション）。個人情報は出さない */
const purchases = () => q('trace: 購入セッション', `
  select
    right(stripe_session_id, 8) as session_ref,
    plan_id, locale, status, livemode, coalesce(is_test,false) as is_test,
    amount_jpy,
    coalesce(payment_method, '') as payment_method,
    (stripe_payment_intent_id is not null) as has_payment_intent,
    (buyer_email is not null) as has_buyer_email,
    (user_id is not null) as has_user,
    coalesce(login_id, '') as login_id,
    (provisioned_at is not null) as provisioned,
    (login_claimed_at is not null) as login_claimed,
    coalesce(error, '') as error,
    created_at, updated_at
  from ai_plan_purchases
  where created_at > now() - interval '${HOURS} hours'
  order by created_at desc
  limit ${LIMIT}
`);

/** webhook と checkout の受信ログ */
const events = () => q('trace: 決済イベント', `
  select
    coalesce(session_ref, '') as session_ref,
    coalesce(stripe_event_id, '') as event_id,
    event_type,
    coalesce(payment_status, '') as payment_status,
    coalesce(payment_method, '') as payment_method,
    livemode, outcome, detail, received_at
  from ai_payment_events
  where received_at > now() - interval '${HOURS} hours'
  order by received_at asc
`);

/** 発行されたアカウントの受講権と、体験を始めたか */
const access = (sessionRefs) => {
  if (sessionRefs.length === 0) return [];
  const list = sessionRefs.map((r) => `'${r.replace(/'/g, '')}'`).join(',');
  return q('trace: 受講権', `
    select
      right(p.stripe_session_id, 8) as session_ref,
      (a.user_id is not null) as access_granted,
      a.plan_id as access_plan,
      a.valid_from, a.valid_until,
      (a.trial_started_at is not null) as trial_started,
      a.trial_started_at,
      a.trial_days
    from ai_plan_purchases p
    left join ai_course_access a on a.user_id = p.user_id
    where right(p.stripe_session_id, 8) in (${list})
  `);
};

const line = (s = '─') => console.log(s.repeat(72));

const render = () => {
  const rows = purchases();
  const evs = events();
  const refs = rows.map((r) => r.session_ref);
  const acc = access(refs);
  const accBy = Object.fromEntries(acc.map((a) => [a.session_ref, a]));

  console.clear?.();
  console.log(`\n決済の追跡  (直近${HOURS}時間 / 最大${LIMIT}件)   ${jst(new Date().toISOString())}`);
  line('═');

  if (rows.length === 0) {
    console.log('\nこの期間に checkout セッションはありません。');
    console.log('LP の「600円で試してみる」を押すと、ここに行が出ます。\n');
  }

  for (const p of rows) {
    const a = accBy[p.session_ref] ?? {};
    const mine = evs.filter((e) => e.session_ref === p.session_ref);
    console.log(`\n■ session …${p.session_ref}  ${p.plan_id} / ${p.locale} / ¥${p.amount_jpy}`
      + `${p.is_test ? '  [テスト行]' : ''}${p.livemode ? '' : '  [testmode]'}`);
    line();
    const steps = [
      ['① 開始（checkout関数）', mine.some((e) => e.event_type === 'checkout_created'), jst(p.created_at)],
      ['② Checkoutセッション作成', true, jst(p.created_at)],
      ['③ 支払い手段', !!p.payment_method, p.payment_method || '（未確定＝まだ選ばれていない）'],
      ['⑤ webhook 受信', mine.some((e) => e.outcome === 'received'), mine.find((e) => e.outcome === 'received') ? jst(mine.find((e) => e.outcome === 'received').received_at) : '—'],
      ['⑥ イベント保存', mine.length > 0, `${mine.length} 件`],
      ['⑦ 台帳更新', p.updated_at !== p.created_at, `status=${p.status}`],
      ['⑧ アカウント発行', !!p.provisioned, p.login_id ? `loginId=${p.login_id}` : '—'],
      ['   受講権', !!a.access_granted, a.valid_until ? `〜${jst(a.valid_until)}` : '—'],
      ['⑨ 体験開始', !!a.trial_started, a.trial_started_at ? jst(a.trial_started_at) : '（未開始＝準備中は時計が動かない）'],
      ['⑩ 自動ログイン', !!p.login_claimed, p.login_claimed ? '交換済み' : '—'],
    ];
    for (const [label, ok, note] of steps) {
      console.log(`  ${ok ? '✓' : '·'} ${label.padEnd(24)} ${note}`);
    }
    if (p.error) console.log(`  ⚠ error: ${p.error}`);
    if (!p.has_buyer_email && p.provisioned) {
      console.log('  ⚠ 購入者メールが取れていません（初期パスワードが渡らない可能性）');
    }

    if (mine.length > 0) {
      console.log('\n  ④ status と webhook の流れ');
      for (const e of mine) {
        console.log(`     ${jst(e.received_at)}  ${e.event_type.padEnd(38)} ${e.outcome.padEnd(16)} ${e.detail}`);
      }
    } else {
      console.log('\n  ⚠ このセッションについて webhook を1件も受け取っていません。');
      console.log('    → 払われていないか、Stripe から届いていないかのどちらか。');
      console.log('       Stripe ダッシュボード → Developers → Webhooks で、送信先と');
      console.log('       checkout.session.completed / async_payment_succeeded /');
      console.log('       async_payment_failed / expired が有効か確認してください。');
    }
  }

  // session に紐づかないイベント（署名エラー・例外など）も必ず見せる
  const orphan = evs.filter((e) => !refs.includes(e.session_ref));
  if (orphan.length > 0) {
    console.log('\n■ セッションに紐づかない受信（署名エラー・例外など）');
    line();
    for (const e of orphan) {
      console.log(`  ${jst(e.received_at)}  ${e.event_type.padEnd(24)} ${e.outcome.padEnd(16)} ${e.detail}`);
    }
  }

  console.log('');
  return { generatedAt: new Date().toISOString(), purchases: rows, events: evs, access: acc };
};

const snapshot = render();

if (has('--save')) {
  const dir = join(ROOT, 'docs/ai-course/production/purchase-traces');
  mkdirSync(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(join(dir, name), JSON.stringify(snapshot, null, 2));
  console.log(`証拠を保存しました: docs/ai-course/production/purchase-traces/${name}`);
  console.log('（個人情報は含みません。session は末尾8桁・メールは有無だけ）\n');
}

if (has('--watch')) {
  console.log('15秒ごとに更新します。止めるときは Ctrl+C。\n');
  setInterval(() => { try { render(); } catch (e) { console.error('取得に失敗:', e.message); } }, 15_000);
}

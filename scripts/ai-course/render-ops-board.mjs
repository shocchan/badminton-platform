// 朝ひらく1枚（経営点検ボード）。2026-08-23 開始 / 2026-08-24 に3事業へ拡張。
//
// なぜ要るか（CEO報告）:
//   「システム情報が多くなりすぎて、ちょいとチェックするのが難しい」「管理ページを使いこなせていない」。
//   管理ページはタブを開いて回らないと状況が分からない。**開いた瞬間に全部見える1枚**が要る。
//
// 何を出すか（CEOが朝に持つ問いの順）:
//   1. 今すぐ手を打つことはあるか（人がいるときだけ出す。無ければ「ありません」と言い切る）
//   2. 会社ぜんぶで今月いくら入ったか・本人1時間あたりいくらか
//   3. 1件売れるために足りないもの（逆算）
//   4. 機械は生きているか
//   5. 事業ごと（バドミントン / AI日本語コース / wild-flow）
//
// 新しい画面を増やさない（2026-08-24）:
//   ダッシュボードを別に作ると「どっちを見るか」が生まれ、逆算ダッシュボード
//   （~/ai-company/departments/marketing/reverse-calc-dashboard.md・2026-04-27で更新停止）と
//   同じ道をたどる。だから**この1枚に足す**。設計原則は docs/ai-course/ops/ADMIN_JOBS.md。
//
// 数字の性質を混ぜない（このスクリプトの最重要ルール）:
//   実入金 / DB上の理論値 / 推定 は別のものとして出す。
//   通常活動の料金回収は意図的にアナログ運用のままなので、DBから出るのは常に理論値。
//   自動徴収の仕組みは作らない（スコープ外）。実入金はCEOの手入力欄で受ける。
//
// 個人情報:
//   学習IDと表示名だけ。**メールアドレスは出さない**（@より前だけ・ドメインは伏せる）。
//   通常活動の名寄せは氏名をSQL側で md5 にしてから受け取る（生の氏名をこのプロセスに載せない）。
//
// 実行: node scripts/ai-course/render-ops-board.mjs [out.html]
//   読み取り専用（select と stable な関数だけ）。--write は渡さない。
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  repeatStats, machineChecks, costView, mailHealthView, entitlementIssues,
  ownerHoursView, revenuePerHour, monthMoney, reverseCalcView, nextSaleGap, wildflowView,
} from './opsBoardLib.mjs';
import { readWildflow } from './wildflow-read.mjs';

const REMOTE_SQL = join(import.meta.dirname, 'remote-sql.mjs');

// 子プロセスの node は process.execPath で呼ぶ（'node' を PATH 解決に頼ると
// launchd 配下で spawnSync ENOENT になる。2026-08-16〜24 に日次点検が8回連続で
// 即死した原因そのもの。docs/ai-course/ops/ADMIN_JOBS.md「機械の生存確認」）
const runSql = (q, label) => {
  const out = execFileSync(process.execPath, [REMOTE_SQL, '--sql', q, '--label', label ?? 'ops-board'],
    { encoding: 'utf8' });
  const body = out.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
  return body ? JSON.parse(body) : [];
};

const sql = (q) => runSql(q, 'ops-board');
const one = (q) => sql(q)[0] ?? {};

/**
 * 未適用のmigrationがある状態でも1枚を出し切るための実行。
 * ⚠️ 失敗を黙って捨てない。ただし2種類に分ける:
 *   - まだ適用していないmigrationのテーブル/関数（42883/42P01）→「適用待ち」。手を打つことには数えない
 *   - それ以外（権限・タイムアウト・SQLの誤り）→「手を打つこと」に出す。壊れているのはこちら
 * 混ぜると、適用待ちが毎朝16件の警報になってボードが読まれなくなる。
 */
const readFailures = [];      // 本当に壊れているもの
const pendingMigrations = []; // まだ当てていないだけのもの
const NOT_APPLIED_RE = /does not exist|42883|42P01|42703/;
const soft = (label, q) => {
  try {
    return { ok: true, rows: runSql(q, `ops-board:${label}`) };
  } catch (e) {
    const raw = [e?.stderr, e?.stdout, e?.message].map((x) => `${x ?? ''}`).join('\n');
    const reason = (/"message"\s*:\s*"([^"]+)"/.exec(raw)?.[1]
      ?? raw.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? `${e?.message ?? e}`)
      .split('\\n')[0].slice(0, 160);
    if (NOT_APPLIED_RE.test(raw)) pendingMigrations.push({ label, reason });
    else readFailures.push({ label, reason });
    return { ok: false, reason, rows: [] };
  }
};
const softOne = (label, q) => {
  const r = soft(label, q);
  return { ...r, row: r.rows[0] ?? {} };
};

// JSTの当月の範囲。SQLの中でも同じ式を使う（サーバのTZに依存させない）
const MONTH_FROM = `date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date`;
const TODAY_JST = `(now() at time zone 'Asia/Tokyo')::date`;

// ── 1. 数字（AI日本語コース。既存） ──────────────────────────
//
// **is_test の申込は数えない**（2026-08-23）。CEO確認: いまある申込はすべて本人の
// 動作確認で、まだ誰にも見つかっていない。テストを売上として出すと、
// ボードが実態より良い話をしてしまう。
const kpi = one(`
select
 (select count(*) from public.ai_learners) as learners,
 (select count(*) from public.ai_course_access where now() between valid_from and valid_until) as active_access,
 (select count(*) from public.ai_plan_purchases where status = 'provisioned' and not is_test) as paid_count,
 (select coalesce(sum(amount_jpy),0) from public.ai_plan_purchases where status = 'provisioned' and not is_test) as paid_jpy,
 (select coalesce(sum(amount_jpy),0) from public.ai_plan_purchases
    where status = 'provisioned' and not is_test and created_at >= date_trunc('month', now())) as paid_jpy_month,
 (select count(*) from public.ai_plan_purchases
    where status = 'provisioned' and not is_test and created_at >= date_trunc('month', now())) as paid_count_month,
 (select count(*) from public.ai_plan_purchases where status = 'pending' and not is_test) as pending_count,
 (select count(*) from public.ai_lp_views where viewed_on > (now() at time zone 'Asia/Tokyo')::date - 7) as lp_views_7d,
 (select count(*) from public.ai_lp_views where viewed_on > (now() at time zone 'Asia/Tokyo')::date - 30) as lp_views_30d,
 (select round(coalesce(sum(estimated_cost_usd),0)::numeric,2) from public.ai_usage_daily
    where usage_date >= date_trunc('month', now())::date) as ai_usd_month,
 (select count(*) from public.ai_learning_sessions where started_at > now() - interval '24 hours') as sessions_24h,
 (select count(distinct learner_id) from public.ai_learning_sessions where started_at > now() - interval '7 days') as learners_7d
`);

// ── 2. 手を打つ人（既存） ────────────────────────────────
// 買ったのに始めていない（購入から24時間以上・学習セッション0）
const notStarted = sql(`
select split_part(coalesce(p.login_id, ''), '@', 1) as login_id,
       p.plan_id, p.created_at::date as bought_on,
       (now() - p.created_at) > interval '24 hours' as over_24h
from public.ai_plan_purchases p
where p.status = 'provisioned' and not p.is_test and p.user_id is not null
  and not exists (
    select 1 from public.ai_learners l
    join public.ai_learning_sessions s on s.learner_id = l.id
    where l.user_id = p.user_id)
order by p.created_at desc limit 20
`);

// 受講権があと7日以内に切れる
const expiring = sql(`
select split_part(coalesce(u.email, ''), '@', 1) as login_id,
       a.plan_id, a.valid_until::date as until,
       greatest(0, extract(day from a.valid_until - now())::int) as days_left
from public.ai_course_access a
join auth.users u on u.id = a.user_id
where a.valid_until between now() and now() + interval '7 days'
order by a.valid_until limit 20
`);

// 決済を始めて完了しなかった（お金が落ちていない）
const abandoned = sql(`
select p.plan_id, p.created_at::date as day, count(*) as n
from public.ai_plan_purchases p
where p.status = 'pending' and not p.is_test and p.created_at > now() - interval '30 days'
group by 1,2 order by 2 desc limit 10
`);

// 発行したのに一度もログインしていないアカウント
const neverLoggedIn = sql(`
select split_part(u.email, '@', 1) as login_id, u.created_at::date as issued
from auth.users u
where u.last_sign_in_at is null and u.created_at > now() - interval '90 days'
order by u.created_at desc limit 20
`);

// ── 3. 直近の学習（既存） ────────────────────────────────
const recent = sql(`
select split_part(coalesce(u.email,''), '@', 1) as login_id,
       coalesce(l.settings->'adventureV2'->>'targetJlpt', '—') as target,
       l.settings->'adventureV2'->'lastQuest'->>'dateKey' as last_quest,
       jsonb_array_length(coalesce(l.settings->'adventureV2'->'questLog','[]'::jsonb)) as quest_days,
       coalesce((l.settings->'adventureV2'->>'xp')::int, 0) as xp
from public.ai_learners l join auth.users u on u.id = l.user_id
order by (l.settings->'adventureV2'->'lastQuest'->>'dateKey') desc nulls last
limit 12
`);

// 未対応の問題報告（放置がいちばんまずい）。本文は要点だけ・氏名や連絡先は取らない
const issues = sql(`
select left(coalesce(i.comment, ''), 80) as comment, coalesce(i.error_code, '') as code,
       coalesce(i.page, '') as page, i.created_at::date as day
from public.ai_issue_reports i
where i.resolved is not true and i.created_at > now() - interval '30 days'
order by i.created_at desc limit 10
`);

// ── 4. 異常（既存） ─────────────────────────────────────
const alerts = sql(`
select severity, kind, detail, created_at::date as day
from public.ai_course_alerts
where created_at > now() - interval '14 days'
order by created_at desc limit 10
`);

// ══════════════════════════════════════════════════════════
// 5. AI日本語コースの追加（2026-08-24）
// ══════════════════════════════════════════════════════════

// D1/D7。定義は src/lib/aiLesson/course/admin/adminFunnel.ts:30-53 と同じ:
//   「活動した日」= 会話セッション・音声利用・イベントのどれかがあった日（JST）
//   母数は**期間内に初めて活動した人**だけ（継続者を混ぜるとD1が膨らむ）
//
// ⚠️ `select * from ( with ... )` で包んでいるのは remote-sql.mjs の安全装置のため。
//    文頭の `with` は（CTE内 delete があり得るので）保守的に書き込み扱いされて拒否される。
//    読み取りしかしないので、文頭を select にして中で CTE を使う。
const retention = softOne('retention', `select * from (
with lr as (select l.id, l.user_id from public.ai_learners l where not coalesce(l.is_test, false)),
days as (
  select s.learner_id as lid, ((s.started_at at time zone 'Asia/Tokyo')::date) as d
    from public.ai_learning_sessions s join lr on lr.id = s.learner_id
  union
  select u.learner_id, u.usage_date from public.ai_usage_daily u join lr on lr.id = u.learner_id
  union
  select lr.id, ((ev.created_at at time zone 'Asia/Tokyo')::date)
    from public.ai_course_events ev join lr on lr.user_id = ev.user_id
),
firsts as (select lid, min(d) as f from days group by lid),
w as (select ${TODAY_JST} - 30 as since)
select
 count(*) filter (where f.f >= w.since) as base,
 count(*) filter (where f.f >= w.since
   and exists (select 1 from days d where d.lid = f.lid and d.d = f.f + 1)) as d1,
 count(*) filter (where f.f >= w.since
   and exists (select 1 from days d where d.lid = f.lid and d.d between f.f + 1 and f.f + 7)) as d7
from firsts f, w
) r`);

// mail health。「テーブルが0行」ではなく「そもそもジョブが cron に居るか」を見る。
// ai_course_mail_log が0行だった＝一度も送信されていなかった事故（2026-08-24）の再発検知。
const mailHealthRes = soft('mail_health', 'select * from public.ai_mail_health()');
const mailLogRes = softOne('mail_log', 'select count(*)::int as n from public.ai_course_mail_log');
const mailHealth = mailHealthView(
  mailHealthRes.ok ? mailHealthRes.rows : null,
  mailLogRes.ok ? mailLogRes.row.n : null,
);

// AI原価。**ai_usage_daily 直読みをやめて明細（ai_usage_events）に切り替える**。
// 直読みだとレポート生成などの原価が載っていなかった。推定と実トークンも区別する。
const costRes = softOne('ai_cost_summary', 'select public.ai_cost_summary() as j');
const cost = costView(costRes.ok ? costRes.row.j : null, kpi.ai_usd_month);

// 受講権の異常（1人1行なのに複数プランを持ちうる構造から出るもの）
const accessRes = soft('ai_course_access', `
select split_part(coalesce(u.email, ''), '@', 1) as login_id,
       a.plan_id, a.source, a.valid_from, a.valid_until,
       (a.purchase_id is not null) as has_purchase
from public.ai_course_access a left join auth.users u on u.id = a.user_id
order by a.valid_until desc limit 200
`);
const entIssues = entitlementIssues(accessRes.rows, Date.now());

// wild-flow からの送客（kawabado 側で数える。utm_source=wildflow のリンクが入った）
const wfReferral = softOne('wildflow_referral', `
select
 (select count(*) from public.ai_lp_views
    where utm_source = 'wildflow' and viewed_on > ${TODAY_JST} - 30) as lp_30d,
 (select count(*) from public.ai_plan_purchases
    where utm->>'utm_source' = 'wildflow' and not is_test) as purchases
`);

// ══════════════════════════════════════════════════════════
// 6. kawabado（バドミントン）2026-08-24 追加
//    大会テーブルもAIコーステーブルも同じプロジェクトなので SELECT を足すだけ
// ══════════════════════════════════════════════════════════

// 今月の通常活動。**理論売上（確定申込 × activities.price）で、実入金ではない**。
// 料金回収はアナログ運用のままなので、現金・PayPay・回数券消化の実額はDBに無い。
const act = softOne('activity_month', `
select
 count(distinct j.id)::int as held,
 coalesce(sum(j.quantity) filter (where j.status = 'confirmed'), 0)::int as heads,
 coalesce(sum(j.quantity) filter (where j.status = 'waitlist'), 0)::int as waitlist,
 coalesce(sum(j.quantity * j.price) filter (where j.status = 'confirmed'), 0)::int as theory_jpy,
 coalesce(sum(j.quantity * j.price) filter (where j.status = 'confirmed' and j.member_type = 'member'), 0)::int as member_theory_jpy
from (
  select a.id, a.price, e.status, e.quantity, e.member_type
  from public.activities a
  left join public.activity_entries e on e.activity_id = a.id
  where a.status <> 'cancelled' and a.date >= ${MONTH_FROM} and a.date <= ${TODAY_JST}
) j
`);

// 定員割れの回（これから開催するぶんだけ）
const capacityGaps = soft('capacity_gaps', `
select a.date::text as day, left(a.title, 30) as title, a.capacity::int as capacity,
       coalesce(sum(e.quantity) filter (where e.status = 'confirmed'), 0)::int as confirmed,
       (a.date - ${TODAY_JST})::int as days_ahead
from public.activities a
left join public.activity_entries e on e.activity_id = a.id
where a.status <> 'cancelled' and a.date between ${TODAY_JST} and ${TODAY_JST} + 30
group by a.id, a.date, a.title, a.capacity
having coalesce(sum(e.quantity) filter (where e.status = 'confirmed'), 0) < a.capacity
order by a.date limit 12
`);

// 今月の大会。ダブルスの entry_fee はペア単位で登録されているので1人あたりに換算する
// （src/lib/fee.ts feePerPerson と同じ規則）。これも理論値。
const FEE_PER_PERSON = `(case when t.event_type like '%ダブルス%'
  then round(t.entry_fee / 2.0) else t.entry_fee end)`;
const tour = softOne('tournament_month', `
select
 (select count(*) from public.entries e where e.created_at >= ${MONTH_FROM})::int as applied,
 (select count(*) from public.entries e
    where e.created_at >= ${MONTH_FROM} and e.status = 'confirmed')::int as confirmed,
 (select count(*) from public.entries e
    where e.created_at >= ${MONTH_FROM} and e.status = 'cancelled')::int as cancelled,
 (select count(*) from public.entries e join public.tournaments t on t.id = e.tournament_id
    where e.status = 'confirmed' and t.payment_required
      and coalesce(e.payment_status, 'pending') <> 'completed')::int as unpaid,
 (select coalesce(sum(${FEE_PER_PERSON} * coalesce(e.participant_count, 1)), 0)
    from public.entries e join public.tournaments t on t.id = e.tournament_id
    where e.created_at >= ${MONTH_FROM} and e.status = 'confirmed'
      and coalesce(e.payment_status, 'pending') = 'completed')::int as paid_jpy,
 (select coalesce(sum(${FEE_PER_PERSON} * coalesce(e.participant_count, 1)), 0)
    from public.entries e join public.tournaments t on t.id = e.tournament_id
    where e.created_at >= ${MONTH_FROM} and e.status = 'confirmed'
      and coalesce(e.payment_status, 'pending') <> 'completed')::int as unpaid_jpy
`);

// 未返信の問い合わせ。2026-08-24 の調査で **5件が49日間放置**されていたのが見つかった箇所
const contacts = softOne('contacts', `
select count(*)::int as new_count,
       coalesce(max(extract(day from now() - created_at))::int, 0) as oldest_days
from public.contacts where status = 'new'
`);

// リピート率の材料。名寄せキーは 20260824110000_activity_entries_contact.sql のコメントどおり
//   coalesce(user_id::text, lower(trim(email)), 'name:' || name)
// email / name は md5 にしてから受ける（生の個人情報をこのプロセスに載せない。
// lower+trim したあとのハッシュなので同値判定はハッシュ前と完全に一致する）。
// to_jsonb(e)->>'...' で読むのは、列がまだ無いDB（migration未適用）でも落ちないようにするため。
const repeatRows = soft('repeat_rows', `
select to_jsonb(e)->>'user_id' as user_id,
       nullif(md5(lower(trim(coalesce(to_jsonb(e)->>'email', '')))), md5('')) as email_key,
       md5(lower(trim(coalesce(e.name, '')))) as name_key,
       a.date::text as day
from public.activity_entries e join public.activities a on a.id = e.activity_id
where e.status = 'confirmed'
`);
const repeat = repeatStats(repeatRows.rows);

// ══════════════════════════════════════════════════════════
// 7. 手元のファイル（DBに無い数字）
// ══════════════════════════════════════════════════════════
const AI_COMPANY = join(homedir(), 'ai-company');
const HEARTBEAT_PATH = join(AI_COMPANY, 'logs/daily-pf-analytics/ops-check-heartbeat.json');
const OWNER_HOURS_PATH = join(AI_COMPANY, 'logs/owner-hours.json');
const REVERSE_CALC_PATH = join(AI_COMPANY, 'departments/marketing/reverse-calc-dashboard.md');
const BACKUP_DIR = join(AI_COMPANY, 'backups/kawabado');

const readIfExists = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

const backupDays = existsSync(BACKUP_DIR)
  ? readdirSync(BACKUP_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  : [];
const backupLatestDay = backupDays[backupDays.length - 1] ?? null;

const machine = machineChecks({
  heartbeatRaw: readIfExists(HEARTBEAT_PATH),
  heartbeatPath: HEARTBEAT_PATH,
  nowMs: Date.now(),
  backupLatestDay,
  backupHasLearners: backupLatestDay
    ? existsSync(join(BACKUP_DIR, backupLatestDay, 'ai_learners.json'))
    : false,
  mailLogCount: mailLogRes.ok ? mailLogRes.row.n : null,
});

const monthKey = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7); // JSTの当月
const ownerHours = ownerHoursView(readIfExists(OWNER_HOURS_PATH), monthKey);
const reverse = reverseCalcView(readIfExists(REVERSE_CALC_PATH), Date.now());

const money = monthMoney({
  aiPaidJpy: kpi.paid_jpy_month,
  tourPaidJpy: tour.row.paid_jpy,
  tourUnpaidJpy: tour.row.unpaid_jpy,
  activityTheoryJpy: act.row.theory_jpy,
  activityCashJpy: ownerHours.activityCashJpy ?? null,
  axis2Jpy: null, // note/ココナラはDBが無い＝ここでは計測しない
});
const perHour = revenuePerHour(money.total, ownerHours.hours);
const gap = nextSaleGap({
  lpViews30d: kpi.lp_views_30d,
  paidCountMonth: kpi.paid_count_month,
  pendingCount: kpi.pending_count,
});

// wild-flow（別プロジェクト・失敗しても落ちない）
let wildflow;
try {
  wildflow = wildflowView(await readWildflow());
} catch (e) {
  wildflow = wildflowView({ connected: false, reason: `${e?.message ?? e}`.split('\n')[0] });
}

/**
 * 管理ページの「その人」へ直接ひらくリンク（2026-08-23）。
 * ボードで見つけた相手に、探し直さずそのまま手を打てるようにする。
 * 学習IDで当てる（管理ページ側が loginId/email/userId のどれでも解決する）
 */
const ADMIN = 'https://study.kawabado.com/ja/ai-course/admin';
const SYSTEM_WHO = new Set(['機械', '問題報告', 'バドミントン', '受講権', 'メール']);
const adminLink = (loginId) => (loginId && !SYSTEM_WHO.has(loginId)
  ? `${ADMIN}?tab=students&account=${encodeURIComponent(loginId)}` : null);
const adminTab = (tab) => `${ADMIN}?tab=${tab}`;
const KAWABADO_ADMIN = 'https://kawabado.com/ja/admin';

const yen = (n) => `¥${Number(n ?? 0).toLocaleString('ja-JP')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (r) => (r === null ? '—' : `${Math.round(r * 1000) / 10}%`);
/** 適用待ちの項目を、内部名ではなく「何が見えないか」で書く */
const PENDING_LABEL = {
  mail_health: 'メール配信ジョブの登録状況（20260824130000）',
  ai_cost_summary: 'AI原価の内訳と推定/実トークンの区別（20260824150000）',
  mail_log: 'メール配信ログ（20260824130000）',
  repeat_rows: '通常活動の名寄せ（20260824110000）',
};
const usd = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;

/** 今すぐ手を打つこと。**人がいるときだけ**出す（無いのに枠だけ出さない） */
const todo = [];
for (const r of notStarted.filter((x) => x.over_24h)) {
  todo.push({ who: r.login_id || '（IDなし）', what: `${r.plan_id} を買ったまま、まだ一度も始めていない（${r.bought_on}）`, act: '声をかける' });
}
for (const r of expiring) {
  todo.push({ who: r.login_id, what: `受講権があと${r.days_left}日（${r.until}）`, act: '延長するか決める' });
}
for (const r of neverLoggedIn) {
  todo.push({ who: r.login_id, what: `アカウントを発行したのに一度もログインしていない（${r.issued}）`, act: 'ログイン方法を送る' });
}
// ── バドミントン（2026-08-24 追加） ──
if (Number(contacts.row.new_count) > 0) {
  todo.push({
    who: 'バドミントン',
    what: `未返信の問い合わせ ${contacts.row.new_count}件（最古 ${contacts.row.oldest_days}日前）`,
    act: '返信する', href: `${KAWABADO_ADMIN}?tab=contacts`,
  });
}
if (Number(tour.row.unpaid) > 0) {
  todo.push({
    who: 'バドミントン',
    what: `大会の未入金 ${tour.row.unpaid}件（${yen(tour.row.unpaid_jpy)}ぶん・確定済み）`,
    act: '入金を確認する', href: `${KAWABADO_ADMIN}?tab=tournaments`,
  });
}
// 直近7日で定員に届いていない回だけを「手を打つこと」に出す（先の回まで出すと毎朝鳴り続ける）
for (const g of capacityGaps.rows.filter((r) => Number(r.days_ahead) <= 7)) {
  todo.push({
    who: 'バドミントン',
    what: `${g.day}「${g.title}」が定員割れ（${g.confirmed}/${g.capacity}人・あと${g.days_ahead}日）`,
    act: '声をかける', href: `${KAWABADO_ADMIN}?tab=activities`,
  });
}
// ── 機械 ──
// 日次点検の ALERT には、このボードが自分で数え直している項目が混ざる
// （未返信の問い合わせ・バックアップ鮮度）。二重に出すと同じ用事が2行になるので落とす。
// 「消す」のではなく「上でもう言った」から落とすので、どちらの経路が死んでも1回は出る。
const COVERED_BY_BOARD = /未返信の問い合わせ|バックアップ/;
for (const p of machine.problems) {
  if (p.kind === '日次点検' && COVERED_BY_BOARD.test(p.text)) continue;
  todo.push({ who: '機械', what: `${p.kind}：${p.text}`, act: '運用タブで見る', href: adminTab('ops') });
}
for (const p of mailHealth.problems) {
  todo.push({ who: 'メール', what: p, act: '運用タブで見る', href: adminTab('ops') });
}
for (const i of entIssues) {
  todo.push({ who: i.who, what: `受講権：${i.text}`, act: '受講権を直す' });
}
for (const a of alerts.filter((x) => x.severity !== 'info')) {
  todo.push({ who: '機械', what: `${a.kind}：${a.detail}`, act: '運用タブで見る', href: adminTab('ops') });
}
for (const i of issues) {
  todo.push({ who: '問題報告', what: `${i.day}・${i.page || '画面不明'}${i.code ? `（${i.code}）` : ''}：${i.comment || '（コメントなし）'}`, act: '運用タブで見る', href: adminTab('ops') });
}
for (const f of readFailures) {
  todo.push({ who: '機械', what: `点検ボードが「${f.label}」を読めませんでした：${f.reason}`, act: 'migrationの適用状況を見る' });
}

const todoHtml = todo.length === 0
  ? '<p class="none">いまは手を打つことはありません。</p>'
  : `<ul class="todo">${todo.map((t) => {
    const href = t.href ?? adminLink(t.who);
    const act = href
      ? `<a class="act go" href="${href}" target="_blank" rel="noopener">${esc(t.act)} →</a>`
      : `<span class="act">${esc(t.act)}</span>`;
    return `<li>
      <span class="who">${esc(t.who)}</span>
      <span class="what">${esc(t.what)}</span>
      ${act}
    </li>`;
  }).join('')}</ul>`;

const recentRows = recent.map((r) => `<tr>
  <td class="mono">${adminLink(r.login_id)
    ? `<a href="${adminLink(r.login_id)}" target="_blank" rel="noopener">${esc(r.login_id)}</a>`
    : esc(r.login_id)}</td><td>${esc(r.target)}</td>
  <td class="mono">${esc(r.last_quest ?? '—')}</td>
  <td class="num">${r.quest_days}</td><td class="num">${r.xp}</td></tr>`).join('');

const abandonedRows = abandoned.length === 0
  ? '<p class="none">直近30日、決済の途中離脱はありません。</p>'
  : `<ul class="plain">${abandoned.map((a) => `<li><b class="mono">${a.day}</b> ${esc(a.plan_id)} — 支払い画面で止まったまま <b>${a.n}</b>件</li>`).join('')}</ul>`;

const alertRows = alerts.length === 0
  ? '<p class="none">直近14日、監視からの知らせはありません。</p>'
  : `<ul class="plain">${alerts.map((a) => `<li><b class="mono">${a.day}</b> <span class="sev ${esc(a.severity)}">${esc(a.severity)}</span> ${esc(a.kind)} — ${esc(a.detail)}</li>`).join('')}</ul>`;

const lines = (items) => (items.length === 0
  ? ''
  : `<ul class="plain">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`);
const fact = (k, v, sub) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="k">${sub}</div>` : ''}</div>`;
const THEORY = '<span class="tag">理論値</span>';

// ── 会社ぜんぶ ────────────────────────────────────────────
const companyFacts = [
  fact('今月の売上（3事業）', yen(money.total),
    money.includesTheory ? '通常活動は理論値（実入金とは異なる）' : '通常活動はCEO入力の実入金'),
  fact('本人が手を動かした時間', ownerHours.entered ? `${ownerHours.hours}h` : '未入力',
    ownerHours.entered ? `${monthKey}${ownerHours.updatedAt ? `・更新 ${ownerHours.updatedAt}` : ''}` : `${OWNER_HOURS_PATH}`),
  fact('1時間あたり売上', perHour === null ? '—' : yen(perHour),
    perHour === null ? '稼働時間が未入力のため出せません' : '今後1年の主指標'),
].join('');

const businessLines = [
  `AI日本語コース ${yen(money.aiPaidJpy)}<span class="tag ok">実入金</span> — Stripe決済 ${kpi.paid_count_month}件`,
  `大会 ${yen(money.tourPaidJpy)}<span class="tag ok">入金済</span> ＋ ${yen(money.tourUnpaidJpy)}${THEORY} 未入金`,
  money.activity.basis === 'cash'
    ? `通常活動 ${yen(money.activity.jpy)}<span class="tag ok">CEO入力の実入金</span>`
    : `通常活動 ${yen(money.activity.jpy)}${THEORY} — 確定申込×単価。現金・PayPay・回数券消化の実額はDBにありません`,
  '軸2（note・ココナラ・X）計測なし ⚠ — DBが無く、数字は手入力の逆算ダッシュボードだけ',
];

// ── 逆算 ─────────────────────────────────────────────────
const reverseLines = [
  gap.enoughTraffic
    ? `AIコース：LP閲覧30日 ${gap.lpViews30d}人。想定CVR${gap.assumedCvrPct}%なら1件出ていい水準に達しています（${gap.paidCountMonth}件）。足りないのは流入ではなく中身か価格`
    : `AIコース：LP閲覧30日 ${gap.lpViews30d}人 → 1件売れる計算に <b>あと${gap.shortfallViews}人</b>（想定CVR${gap.assumedCvrPct}%＝${gap.neededViews}人で1件）`,
  `AIコース：支払い画面で止まったまま ${kpi.pending_count}件。ここが取りこぼしの本体`,
  Number(contacts.row.new_count) > 0
    ? `バドミントン：未返信の問い合わせ ${contacts.row.new_count}件。<b>いちばん売上に近い在庫</b>で、返信だけで動く`
    : 'バドミントン：未返信の問い合わせはありません',
  reverse.available
    ? `軸2：逆算ダッシュボードの最終更新 <b>${reverse.updatedOn ?? '不明'}</b>${reverse.ageDays !== null ? `（${reverse.ageDays}日前）` : ''}${reverse.stale ? '<span class="tag">古い数字</span>' : ''}${reverse.bottleneck ? `<br><span class="sub">最大ボトルネック: ${esc(reverse.bottleneck)}</span>` : ''}`
    : `軸2：逆算ダッシュボードが読めません（${esc(reverse.reason ?? '')}）`,
];

// ── 機械 ─────────────────────────────────────────────────
const hb = machine.heartbeat;
const machineLines = [
  hb.level === 'ok'
    ? `日次点検：${hb.ageHours !== undefined ? `${hb.ageHours.toFixed(1)}時間前に完走` : '完走'}・異常なし`
    : `日次点検：<b>${hb.lines.join(' / ')}</b>`,
  machine.backup.ok ? machine.backup.text : `<b>${machine.backup.text}</b>`,
  mailHealth.available
    ? (mailHealth.problems.length === 0
      ? `メール配信：${mailHealth.jobs.map((j) => `${j.job} 登録あり`).join('・')}`
      : `メール配信：<b>${mailHealth.problems.join(' / ')}</b>`)
    : `メール配信：${esc(mailHealth.note)}`,
  `配信ログ：${mailLogRes.ok ? `${mailLogRes.row.n}件` : `読めません（${esc(mailLogRes.reason ?? '')}）`}`,
  pendingMigrations.length === 0
    ? null
    : `適用待ちのmigrationがあるため、まだ出せない項目：${pendingMigrations.map((p) => esc(PENDING_LABEL[p.label] ?? p.label)).join('・')}<br><span class="sub">壊れているのではなく、まだ当てていないだけ。当たれば自動で出ます</span>`,
].filter(Boolean);

// ── バドミントン ───────────────────────────────────────────
const heldN = Number(act.row.held ?? 0);
const headsN = Number(act.row.heads ?? 0);
const badmintonFacts = [
  fact('今月の通常活動', `${heldN}回`, `のべ ${headsN}人・平均 ${heldN > 0 ? (headsN / heldN).toFixed(1) : '—'}人/回`),
  fact('通常活動の理論売上', `${yen(act.row.theory_jpy)}`, `うち会員ぶん ${yen(act.row.member_theory_jpy)}（回数券消化の想定）`),
  fact('今月の大会', `申込 ${tour.row.applied ?? 0}件`, `確定 ${tour.row.confirmed ?? 0}・キャンセル ${tour.row.cancelled ?? 0}・未入金 ${tour.row.unpaid ?? 0}`),
  fact('リピート率', pct(repeat.rate), `${repeat.repeaters}/${repeat.people}人${repeat.approximate ? '・氏名照合のため誤差あり' : ''}`),
].join('');

const badmintonLines = [
  `通常活動の売上は<b>DB上の理論値</b>（確定申込 × activities.price）。料金回収はアナログ運用のままなので、実入金はここに出ません`,
  repeat.approximate
    ? `リピート率は<b>氏名の一致</b>で数えています（既存${repeat.people}人のうち${repeat.nameFallbackPeople}人が氏名しか手がかりが無い）。同姓同名は1人に潰れ、表記ゆれは別人に割れます。任意メール欄が入った申込から順に精度が上がります`
    : 'リピート率は本人ID／メールで名寄せしています',
];

const capacityRows = capacityGaps.ok
  ? (capacityGaps.rows.length === 0
    ? '<p class="none">これから開催する回に、定員割れはありません。</p>'
    : `<ul class="plain">${capacityGaps.rows.map((g) => `<li><b class="mono">${esc(g.day)}</b> ${esc(g.title)} — <b>${g.confirmed}/${g.capacity}人</b>（あと${g.days_ahead}日）</li>`).join('')}</ul>`)
  : `<p class="none">定員の状況を読めませんでした（${esc(capacityGaps.reason ?? '')}）。</p>`;

// ── AI日本語コース（追加分） ────────────────────────────────
const ret = retention.row;
const aiExtraFacts = [
  fact('D1 再訪', retention.ok && Number(ret.base) > 0 ? `${ret.d1}/${ret.base}` : '—',
    retention.ok ? '30日以内に初めて学習した人が母数' : '読めませんでした'),
  fact('D7 再訪', retention.ok && Number(ret.base) > 0 ? `${ret.d7}/${ret.base}` : '—',
    '初日から7日以内に戻ってきた人'),
  // 上のカードの「今月のAI原価」は ai_usage_daily（会話ぶんだけ）。ここは明細ベースで、
  // レポート生成などの原価も含む。差（gap）が出たら日次に載っていない原価がある
  fact('AI原価（明細ベース）', cost.available ? usd(cost.eventsUsd) : '未適用',
    cost.available
      ? `推定 ${usd(cost.estimatedUsd)}／実トークン ${usd(cost.reportedUsd)}／実請求突合 ${usd(cost.billedUsd)}・日次との差 ${usd(cost.gapUsd)}`
      : '会話以外の原価はまだ数えられません'),
].join('');

const aiExtraLines = [
  cost.available && cost.byKind.length > 0
    ? `原価の内訳：${cost.byKind.map((k) => `${esc(k.kind)} ${usd(k.usd)}`).join('・')}`
    : null,
  entIssues.length === 0
    ? '受講権の異常はありません。'
    : `受講権の異常 ${entIssues.length}件（上の「手を打つ」に出しています）`,
].filter(Boolean);

// ── wild-flow ─────────────────────────────────────────────
const wfLines = [
  wildflow.connected
    ? `${wildflow.lines.join('・')}${wildflow.counts?.quiz_leads?.ok === false ? '' : ''}`
    : `未接続（${esc(wildflow.reason)}）。service_role キーを渡すと読めます（環境変数 WILDFLOW_SERVICE_ROLE_KEY）`,
  wildflow.ga4Configured
    ? 'PV：GA4で計測中'
    : 'PV：<b>計測なし ⚠</b> — GA4の測定IDが未設定のため、閲覧数は誰も持っていません',
  wfReferral.ok
    ? `kawabado への送客：AIコースLP ${wfReferral.row.lp_30d}人（30日・utm_source=wildflow）／購入 ${wfReferral.row.purchases}件`
    : `kawabado への送客：読めませんでした（${esc(wfReferral.reason ?? '')}）`,
  '大会・通常活動の申込は wildflow 経由でも <code>source=web</code> に丸められます（normalizeTrafficSource が line/wechat/web の3値しか受けない）。送客はLP側の utm でしか数えられません',
];

const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

const html = `<title>経営の点検ボード</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
:root{
  --ground:#F6F8F6; --surface:#FFFFFF; --ink:#182523; --muted:#5B6A68;
  --line:#DCE4E0; --line-soft:#EAEFEC; --pine:#1F6F63; --pine-soft:#E4F0ED;
  --clay:#B4622F; --clay-soft:#F7EAE1; --sea:#2F6E8F;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --ground:#101615; --surface:#18211F; --ink:#E7EDEA; --muted:#94A5A2;
  --line:#25302E; --line-soft:#1E2826; --pine:#5FBFAC; --pine-soft:#152B27;
  --clay:#DD9163; --clay-soft:#2A1D15; --sea:#7FB6D2;
}}
:root[data-theme="dark"]{
  --ground:#101615; --surface:#18211F; --ink:#E7EDEA; --muted:#94A5A2;
  --line:#25302E; --line-soft:#1E2826; --pine:#5FBFAC; --pine-soft:#152B27;
  --clay:#DD9163; --clay-soft:#2A1D15; --sea:#7FB6D2;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"Noto Sans JP",system-ui,sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto;padding:48px 20px 90px}
h1,h2{font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif;margin:0;text-wrap:balance}
h1{font-size:clamp(24px,3.6vw,34px);font-weight:700}
h2{font-size:18px;font-weight:700;margin-bottom:12px}
h2 .hint{font-family:"Noto Sans JP",sans-serif;font-size:12px;font-weight:400;color:var(--muted);margin-left:8px}
p{margin:0}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.stamp{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted);margin-top:10px}
hr.rule{height:1px;background:var(--line);border:0;margin:36px 0}
.mono{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
.none{color:var(--muted);font-size:14px;padding:14px 16px;border:1px dashed var(--line);border-radius:12px}
.sub{font-size:12px;color:var(--muted)}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:26px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:14px 16px}
.kpi .label{font-size:12px;color:var(--muted)}
.kpi .value{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;font-size:26px;font-weight:500;margin-top:2px}
.kpi .sub{font-size:11px;color:var(--muted)}

.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:12px}
.fact{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 14px}
.fact .k{font-size:11px;color:var(--muted)}
.fact .v{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;font-size:22px;font-weight:500;margin:1px 0}
.tag{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.04em;padding:2px 7px;border-radius:999px;
  background:var(--clay-soft);color:var(--clay);margin-left:6px;white-space:nowrap}
.tag.ok{background:var(--pine-soft);color:var(--pine)}

ul.todo{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
ul.todo li{display:grid;grid-template-columns:120px 1fr auto;gap:12px;align-items:baseline;
  background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--clay);
  border-radius:0 12px 12px 0;padding:12px 14px}
@media (max-width:640px){ul.todo li{grid-template-columns:1fr;gap:4px}}
ul.todo .who{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--clay)}
ul.todo .what{font-size:14px}
ul.todo .act{font-size:12px;color:var(--muted);white-space:nowrap}
ul.todo a.go{color:var(--pine);text-decoration:none;border:1px solid var(--line);
  border-radius:999px;padding:5px 11px;background:var(--surface)}
ul.todo a.go:hover{border-color:var(--pine)}
td.mono a{color:var(--pine);text-decoration:none}
td.mono a:hover{text-decoration:underline}
.open-admin{display:inline-flex;gap:8px;align-items:center;margin-top:14px;font-size:13px;
  color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:10px;
  padding:9px 13px;background:var(--surface)}
.open-admin:hover{border-color:var(--pine);color:var(--pine)}

ul.plain{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;font-size:14px}
ul.plain li{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 14px}
.sev{font-family:"IBM Plex Mono",monospace;font-size:11px;padding:2px 7px;border-radius:999px;background:var(--clay-soft);color:var(--clay)}
.sev.info{background:var(--pine-soft);color:var(--pine)}

table{width:100%;border-collapse:collapse;font-size:14px;background:var(--surface);
  border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line-soft)}
th{font-size:12px;color:var(--muted);font-weight:500}
td.num{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;text-align:right}
.scroller{overflow-x:auto}
small.foot{display:block;margin-top:34px;color:var(--muted);font-size:12px}
code{font-family:"IBM Plex Mono",monospace;font-size:12px}
</style>

<div class="wrap">
  <p class="eyebrow">3事業の点検 / バドミントン・AI日本語コース・wild-flow</p>
  <h1>いま、手を打つことは ${todo.length === 0 ? 'ありません' : `${todo.length}件`}</h1>
  <p class="stamp">${stamp} 時点・本番のデータから生成</p>

  <hr class="rule">
  <h2>今すぐ手を打つ</h2>
  ${todoHtml}

  <hr class="rule">
  <h2>会社ぜんぶ<span class="hint">${monthKey}</span></h2>
  <div class="facts">${companyFacts}</div>
  ${lines(businessLines)}

  <hr class="rule">
  <h2>1件売れるために足りないもの</h2>
  ${lines(reverseLines)}

  <hr class="rule">
  <h2>機械は生きているか</h2>
  ${lines(machineLines)}

  <hr class="rule">
  <h2>バドミントン</h2>
  <div class="facts">${badmintonFacts}</div>
  ${lines(badmintonLines)}
  <h2 style="margin-top:22px">定員に届いていない回</h2>
  ${capacityRows}

  <hr class="rule">
  <h2>AI日本語コース</h2>
  <div class="kpis" style="margin-top:0">
    <div class="kpi"><div class="label">今月の売上</div><div class="value">${yen(kpi.paid_jpy_month)}</div><div class="sub">累計 ${yen(kpi.paid_jpy)}／${kpi.paid_count}件</div></div>
    <div class="kpi"><div class="label">今月のAI原価</div><div class="value">$${kpi.ai_usd_month}</div><div class="sub">会話に使ったぶん</div></div>
    <div class="kpi"><div class="label">使える人</div><div class="value">${kpi.active_access}</div><div class="sub">受講権が期間内</div></div>
    <div class="kpi"><div class="label">7日で学習した人</div><div class="value">${kpi.learners_7d}</div><div class="sub">24時間 ${kpi.sessions_24h}セッション</div></div>
    <div class="kpi"><div class="label">支払い途中</div><div class="value">${kpi.pending_count}</div><div class="sub">画面で止まったまま</div></div>
    <div class="kpi"><div class="label">LPを見た人</div><div class="value">${kpi.lp_views_7d}</div><div class="sub">7日／30日 ${kpi.lp_views_30d}</div></div>
  </div>
  <div class="facts" style="margin-top:12px">${aiExtraFacts}</div>
  ${lines(aiExtraLines)}

  <h2 style="margin-top:22px">お金が落ちなかったところ</h2>
  ${abandonedRows}

  <h2 style="margin-top:22px">生徒の動き</h2>
  <div class="scroller">
    <table>
      <thead><tr><th>学習ID</th><th>目標</th><th>最後に学習した日</th><th>学習した日数</th><th>XP</th></tr></thead>
      <tbody>${recentRows}</tbody>
    </table>
  </div>

  <hr class="rule">
  <h2>wild-flow</h2>
  ${lines(wfLines)}

  <hr class="rule">
  <h2>機械からの知らせ</h2>
  ${alertRows}

  <p><a class="open-admin" href="${ADMIN}" target="_blank" rel="noopener">管理ページをひらく（発行・期間の変更・教材レビュー）</a></p>

  <small class="foot">
    名前を押すと、その人の管理画面が直接ひらきます。
    出しているのは学習IDだけで、メールアドレス・氏名・会話の中身は載せていません。
    <b>通常活動の売上はDB上の理論値</b>で、実入金ではありません（料金回収はアナログ運用のまま）。
    本人稼働時間と通常活動の実入金は <code>${OWNER_HOURS_PATH}</code> に
    <code>{"months":{"${monthKey}":{"hours":40,"activityCashJpy":0,"updatedAt":"${monthKey}-01"}}}</code> の形で書きます。
    再生成は <code>node scripts/ai-course/render-ops-board.mjs</code>（読み取りのみ）。
  </small>
</div>
`;

const out = process.argv[2] ?? 'docs/ai-course/generated/ops-board.html';
writeFileSync(out, html);
console.log(`${out} を書きました（手を打つこと ${todo.length}件・生徒 ${kpi.learners}人）`);
if (readFailures.length > 0) {
  // 黙って成功しない: 読めなかった問い合わせは標準出力にも残す（ボードにも出している）
  for (const f of readFailures) console.log(`  読めなかった: ${f.label} — ${f.reason}`);
}

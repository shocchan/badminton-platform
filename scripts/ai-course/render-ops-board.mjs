// 朝ひらく1枚（点検ボード）。2026-08-23。
//
// なぜ要るか（CEO報告）:
//   「システム情報が多くなりすぎて、ちょいとチェックするのが難しい」「管理ページを使いこなせていない」。
//   管理ページはタブを開いて回らないと状況が分からない。**開いた瞬間に全部見える1枚**が要る。
//
// 何を出すか（CEOが朝に持つ問いの順）:
//   1. 今すぐ手を打つ人はいるか（人がいるときだけ出す。無ければ「なし」と言い切る）
//   2. 昨日〜今日、何が起きたか
//   3. お金（今月の売上・AI原価）
//   4. 機械の異常（監視が拾ったもの）
//
// 個人情報:
//   学習IDと表示名だけ。**メールアドレスは出さない**（@より前だけ・ドメインは伏せる）。
//   このページは共有すると他人が読めるので、住所・連絡先・購入者メールは載せない。
//
// 実行: node scripts/ai-course/render-ops-board.mjs [out.html]
//   読み取り専用（select だけ）。書き込みはしない。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const sql = (q) => {
  const out = execFileSync('node', ['scripts/ai-course/remote-sql.mjs', '--sql', q], { encoding: 'utf8' });
  const body = out.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
  return body ? JSON.parse(body) : [];
};

const one = (q) => sql(q)[0] ?? {};

// ── 1. 数字 ──────────────────────────────────────────────
const kpi = one(`
select
 (select count(*) from public.ai_learners) as learners,
 (select count(*) from public.ai_course_access where now() between valid_from and valid_until) as active_access,
 (select count(*) from public.ai_plan_purchases where status = 'provisioned') as paid_count,
 (select coalesce(sum(amount_jpy),0) from public.ai_plan_purchases where status = 'provisioned') as paid_jpy,
 (select coalesce(sum(amount_jpy),0) from public.ai_plan_purchases
    where status = 'provisioned' and created_at >= date_trunc('month', now())) as paid_jpy_month,
 (select count(*) from public.ai_plan_purchases where status = 'pending') as pending_count,
 (select round(coalesce(sum(estimated_cost_usd),0)::numeric,2) from public.ai_usage_daily
    where usage_date >= date_trunc('month', now())::date) as ai_usd_month,
 (select count(*) from public.ai_learning_sessions where started_at > now() - interval '24 hours') as sessions_24h,
 (select count(distinct learner_id) from public.ai_learning_sessions where started_at > now() - interval '7 days') as learners_7d
`);

// ── 2. 手を打つ人 ────────────────────────────────────────
// 買ったのに始めていない（購入から24時間以上・学習セッション0）
const notStarted = sql(`
select split_part(coalesce(p.login_id, ''), '@', 1) as login_id,
       p.plan_id, p.created_at::date as bought_on,
       (now() - p.created_at) > interval '24 hours' as over_24h
from public.ai_plan_purchases p
where p.status = 'provisioned' and p.user_id is not null
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
where p.status = 'pending' and p.created_at > now() - interval '30 days'
group by 1,2 order by 2 desc limit 10
`);

// 発行したのに一度もログインしていないアカウント
const neverLoggedIn = sql(`
select split_part(u.email, '@', 1) as login_id, u.created_at::date as issued
from auth.users u
where u.last_sign_in_at is null and u.created_at > now() - interval '90 days'
order by u.created_at desc limit 20
`);

// ── 3. 直近の学習 ────────────────────────────────────────
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

// ── 4. 異常 ─────────────────────────────────────────────
const alerts = sql(`
select severity, kind, detail, created_at::date as day
from public.ai_course_alerts
where created_at > now() - interval '14 days'
order by created_at desc limit 10
`);

const yen = (n) => `¥${Number(n ?? 0).toLocaleString('ja-JP')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
for (const a of alerts.filter((x) => x.severity !== 'info')) {
  todo.push({ who: '機械', what: `${a.kind}：${a.detail}`, act: '中身を見る' });
}

const todoHtml = todo.length === 0
  ? '<p class="none">いまは手を打つことはありません。</p>'
  : `<ul class="todo">${todo.map((t) => `<li>
      <span class="who">${esc(t.who)}</span>
      <span class="what">${esc(t.what)}</span>
      <span class="act">${esc(t.act)}</span>
    </li>`).join('')}</ul>`;

const recentRows = recent.map((r) => `<tr>
  <td class="mono">${esc(r.login_id)}</td><td>${esc(r.target)}</td>
  <td class="mono">${esc(r.last_quest ?? '—')}</td>
  <td class="num">${r.quest_days}</td><td class="num">${r.xp}</td></tr>`).join('');

const abandonedRows = abandoned.length === 0
  ? '<p class="none">直近30日、決済の途中離脱はありません。</p>'
  : `<ul class="plain">${abandoned.map((a) => `<li><b class="mono">${a.day}</b> ${esc(a.plan_id)} — 支払い画面で止まったまま <b>${a.n}</b>件</li>`).join('')}</ul>`;

const alertRows = alerts.length === 0
  ? '<p class="none">直近14日、監視からの知らせはありません。</p>'
  : `<ul class="plain">${alerts.map((a) => `<li><b class="mono">${a.day}</b> <span class="sev ${esc(a.severity)}">${esc(a.severity)}</span> ${esc(a.kind)} — ${esc(a.detail)}</li>`).join('')}</ul>`;

const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

const html = `<title>AIコース 点検ボード</title>
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
p{margin:0}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.stamp{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted);margin-top:10px}
hr.rule{height:1px;background:var(--line);border:0;margin:36px 0}
.mono{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
.none{color:var(--muted);font-size:14px;padding:14px 16px;border:1px dashed var(--line);border-radius:12px}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:26px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:14px 16px}
.kpi .label{font-size:12px;color:var(--muted)}
.kpi .value{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;font-size:26px;font-weight:500;margin-top:2px}
.kpi .sub{font-size:11px;color:var(--muted)}

ul.todo{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
ul.todo li{display:grid;grid-template-columns:120px 1fr auto;gap:12px;align-items:baseline;
  background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--clay);
  border-radius:0 12px 12px 0;padding:12px 14px}
@media (max-width:640px){ul.todo li{grid-template-columns:1fr;gap:4px}}
ul.todo .who{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--clay)}
ul.todo .what{font-size:14px}
ul.todo .act{font-size:12px;color:var(--muted);white-space:nowrap}

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
  <p class="eyebrow">AI日本語コース / 運営の点検</p>
  <h1>いま、手を打つことは ${todo.length === 0 ? 'ありません' : `${todo.length}件`}</h1>
  <p class="stamp">${stamp} 時点・本番のデータから生成</p>

  <div class="kpis">
    <div class="kpi"><div class="label">今月の売上</div><div class="value">${yen(kpi.paid_jpy_month)}</div><div class="sub">累計 ${yen(kpi.paid_jpy)}／${kpi.paid_count}件</div></div>
    <div class="kpi"><div class="label">今月のAI原価</div><div class="value">$${kpi.ai_usd_month}</div><div class="sub">会話に使ったぶん</div></div>
    <div class="kpi"><div class="label">使える人</div><div class="value">${kpi.active_access}</div><div class="sub">受講権が期間内</div></div>
    <div class="kpi"><div class="label">7日で学習した人</div><div class="value">${kpi.learners_7d}</div><div class="sub">24時間 ${kpi.sessions_24h}セッション</div></div>
    <div class="kpi"><div class="label">支払い途中</div><div class="value">${kpi.pending_count}</div><div class="sub">画面で止まったまま</div></div>
  </div>

  <hr class="rule">
  <h2>今すぐ手を打つ</h2>
  ${todoHtml}

  <hr class="rule">
  <h2>お金が落ちなかったところ</h2>
  ${abandonedRows}

  <hr class="rule">
  <h2>生徒の動き</h2>
  <div class="scroller">
    <table>
      <thead><tr><th>学習ID</th><th>目標</th><th>最後に学習した日</th><th>学習した日数</th><th>XP</th></tr></thead>
      <tbody>${recentRows}</tbody>
    </table>
  </div>

  <hr class="rule">
  <h2>機械からの知らせ</h2>
  ${alertRows}

  <small class="foot">
    出しているのは学習IDだけで、メールアドレス・氏名・会話の中身は載せていません。
    再生成は <code>node scripts/ai-course/render-ops-board.mjs</code>（読み取りのみ）。
  </small>
</div>
`;

const out = process.argv[2] ?? 'docs/ai-course/generated/ops-board.html';
writeFileSync(out, html);
console.log(`${out} を書きました（手を打つこと ${todo.length}件・生徒 ${kpi.learners}人）`);

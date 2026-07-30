// GATE⑤ 日次チェックの自動判定版。dashboardを実行し、閾値を機械評価して
// 異常があれば macOS通知＋非0 exit で知らせる（新しい有料サービスは使わない）。
//
// 実行: node scripts/ai-course/daily-ops-check.mjs
// 自動化: launchd（com.kawabado.daily-ops-check.plist を参照。導入はCEOが1コマンド）
// ログ: ~/ai-company/logs/daily-pf-analytics/ops-check-YYYY-MM-DD.log
//
// 閾値は docs/ai-course/production/pilot-operations.md §0 と同一に保つこと。
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const out = execFileSync('node', [join(ROOT, 'scripts/ai-course/remote-sql.mjs'),
  '--file', join(ROOT, 'scripts/ai-course/daily-ops-dashboard.sql'), '--label', 'daily-ops-check'],
{ encoding: 'utf8' });
const rows = JSON.parse(out.slice(out.indexOf('[')));
const val = (metric) => rows.find(r => r.metric === metric)?.value ?? '(missing)';
const num = (metric) => Number(val(metric));

// 閾値（pilot-operations.md §0「見方」と同一）
const alerts = [];
if (num('abandoned_24h') >= 2) alerts.push(`会話の中断が多い: abandoned_24h=${val('abandoned_24h')}`);
if (num('error_code_24h') >= 1) alerts.push(`セッションエラー: error_code_24h=${val('error_code_24h')}`);
if (num('cost_usd_this_month') >= 40) alerts.push(`AIコスト警告閾値超過: $${val('cost_usd_this_month')}`);
if (num('issue_reports_unresolved') >= 1) alerts.push(`未対応の不具合報告: ${val('issue_reports_unresolved')}件`);
if (num('contacts_new') >= 1) alerts.push(`未返信の問い合わせ: ${val('contacts_new')}件`);
if (num('login_locked_now') >= 1) alerts.push(`ログインロック中: ${val('login_locked_now')}件`);
if (num('invites_usable') === 0) alerts.push('有効な招待が0件（新規サインアップ不可）');
// 同期障害の疑い: AI会話（ai_learning_sessions）はunit progressを書かないため、
// sessions>0 だけを条件にすると会話だけの日に必ず誤警報する（2026-07-31初回実行で実際に誤検出）。
// 「過去に単元同期の実績があるlearnerがいる」場合だけ、更新0を停滞のシグナルとして扱う。
if (num('learners_with_unit_progress') > 0 && num('sessions_24h') > 0
  && num('unit_progress_updated_24h') === 0 && num('vocab_updated_24h') === 0) {
  alerts.push(`同期停滞の疑い: 同期実績learner=${val('learners_with_unit_progress')} sessions_24h=${val('sessions_24h')} progress更新0`);
}

const today = new Date().toISOString().slice(0, 10);
const logDir = join(homedir(), 'ai-company/logs/daily-pf-analytics');
mkdirSync(logDir, { recursive: true });
const summary = rows.map(r => `${r.section}.${r.metric}=${r.value}`).join('\n');
const status = alerts.length ? `ALERT(${alerts.length})` : 'OK';
writeFileSync(join(logDir, `ops-check-${today}.log`),
  `# AI course daily ops check ${new Date().toISOString()}\nstatus: ${status}\n${alerts.map(a => `ALERT: ${a}`).join('\n')}\n\n${summary}\n`);

console.log(`status: ${status}`);
for (const a of alerts) console.log(`ALERT: ${a}`);

if (alerts.length) {
  // macOS通知（Macが起動していれば気づける。メール通知は導入していない＝runbookに明記）
  try {
    execFileSync('osascript', ['-e',
      `display notification "${alerts[0].replace(/"/g, '')}" with title "kawabado AIコース 要確認 (${alerts.length}件)"`]);
  } catch { /* 通知失敗でもlogは残る */ }
  process.exit(1);
}

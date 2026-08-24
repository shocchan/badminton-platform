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
const today = new Date().toISOString().slice(0, 10);
const logDir = join(homedir(), 'ai-company/logs/daily-pf-analytics');
// 生存確認（heartbeat）。点検ボード等が「この機械が動いているか」を読むための唯一の場所。
// 仕様は docs/ai-course/ops/ADMIN_JOBS.md「機械の生存確認」を参照。
// リポジトリの外（~/ai-company配下）に置く: worktreeのパスは変わり得る＝今回の事故そのものなので、
// 状態ファイルをリポジトリ内に置くと同じ理由で読めなくなる。
const HEARTBEAT = join(logDir, 'ops-check-heartbeat.json');
const STALE_AFTER_HOURS = 36; // 日次ジョブ＋点検ボードが前日分を読む余裕（07:32に前日10:05を読む＝約21h）

mkdirSync(logDir, { recursive: true });

/** 成否によらず必ず呼ぶ。「機械が動いていない」と「機械は動いたが異常を見つけた」を区別する。 */
function writeHeartbeat(fields) {
  try {
    writeFileSync(HEARTBEAT, JSON.stringify({
      job: 'com.kawabado.daily-ops-check',
      lastRunAt: new Date().toISOString(),
      staleAfterHours: STALE_AFTER_HOURS,
      script: import.meta.filename,
      node: process.version,
      ...fields,
    }, null, 2) + '\n');
  } catch { /* heartbeatが書けなくても本体の判定は続ける */ }
}

/** 異常時のmacOS通知。osascriptもPATHに依存させない（今回の事故と同じ轍を踏まない）。 */
function notify(title, message) {
  try {
    execFileSync('/usr/bin/osascript', ['-e',
      `display notification "${String(message).replace(/["\\]/g, '')}" with title "${title}"`]);
  } catch { /* 通知失敗でもlog/heartbeatは残る */ }
}

// 子プロセスのnodeは process.execPath で呼ぶ。'node' を PATH 解決に頼ると、
// launchd（PATH=/usr/bin:/bin:/usr/sbin:/sbin）配下で spawnSync ENOENT になり、
// 2026-08-16〜24 のあいだ8回連続で即死していた（＝監視が死んでいることに誰も気づけなかった）。
let out;
try {
  out = execFileSync(process.execPath, [join(ROOT, 'scripts/ai-course/remote-sql.mjs'),
    '--file', join(ROOT, 'scripts/ai-course/daily-ops-dashboard.sql'), '--label', 'daily-ops-check'],
  { encoding: 'utf8' });
} catch (e) {
  // ここで落ちるのは「本番DBを読めていない」＝点検そのものが成立していない状態。
  // 黙って終わらせず、log・heartbeat・通知の3経路すべてに残す。
  const detail = `${e?.message ?? e}`.split('\n')[0];
  writeFileSync(join(logDir, `ops-check-${today}.log`),
    `# AI course daily ops check ${new Date().toISOString()}\nstatus: ERROR\nERROR: 点検を実行できませんでした: ${detail}\n`);
  writeHeartbeat({ status: 'ERROR', alertCount: null, alerts: [], error: detail });
  notify('kawabado AIコース 点検が実行できません', detail);
  console.error(`status: ERROR\nERROR: ${detail}`);
  process.exit(1);
}
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

// バックアップ鮮度（2026-08-15 監査P0）: 日次バックアップが止まっても誰も気づけなかった。
// 最終成功が36時間より古い、または今日のdirに ai_learners.json が無ければ警報。
{
  const { readdirSync, existsSync: ex } = await import('node:fs');
  const bdir = join(homedir(), 'ai-company/backups/kawabado');
  const dayDirs = ex(bdir)
    ? readdirSync(bdir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    : [];
  const latest = dayDirs[dayDirs.length - 1];
  const ageH = latest ? (Date.now() - Date.parse(`${latest}T10:00:00`)) / 3600000 : Infinity;
  if (!latest || ageH > 36) {
    alerts.push(`DBバックアップが止まっています: 最終=${latest ?? 'なし'}（bash scripts/backup-supabase.sh で手動実行を）`);
  } else if (!ex(join(bdir, latest, 'ai_learners.json'))) {
    alerts.push(`最新バックアップ(${latest})に ai_learners.json がありません（途中終了の疑い）`);
  }
}

const summary = rows.map(r => `${r.section}.${r.metric}=${r.value}`).join('\n');
const status = alerts.length ? `ALERT(${alerts.length})` : 'OK';
writeFileSync(join(logDir, `ops-check-${today}.log`),
  `# AI course daily ops check ${new Date().toISOString()}\nstatus: ${status}\n${alerts.map(a => `ALERT: ${a}`).join('\n')}\n\n${summary}\n`);
writeHeartbeat({ status: alerts.length ? 'ALERT' : 'OK', alertCount: alerts.length, alerts, error: null });

console.log(`status: ${status}`);
for (const a of alerts) console.log(`ALERT: ${a}`);

if (alerts.length) {
  // macOS通知（Macが起動していれば気づける。メール通知は導入していない＝runbookに明記）
  notify(`kawabado AIコース 要確認 (${alerts.length}件)`, alerts[0]);
  process.exit(1);
}

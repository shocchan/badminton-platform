// launchd ジョブの設定ミスを静的に検出する（読み取りのみ・副作用なし）。
//
// なぜ要るか: 2026-08-16〜24、日次点検ジョブ com.kawabado.daily-ops-check は
// 毎朝きちんと起動していたのに、PATH未設定のせいで子プロセスの node が
// spawnSync ENOENT で即死し、8回連続で何も点検しないまま終わっていた。
// launchctl list には出ているので「動いている」ように見え、誰も気づけなかった。
// 「設定が壊れている」を人の注意力ではなく機械で拾うための入口。
//
// 実行: node scripts/ai-course/check-launch-agents.mjs
//       node scripts/ai-course/check-launch-agents.mjs --self-test   （判定ロジック自体の検証）
// 終了コード: 0=問題なし / 1=問題あり
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const AGENT_DIR = join(homedir(), 'Library/LaunchAgents');
const PREFIX = 'com.kawabado.';
// launchd が既定で与えるPATH。ここに無いディレクトリの実行ファイルを使うジョブは
// EnvironmentVariables/PATH を自分で持っていないと、子プロセスの解決に失敗する。
const LAUNCHD_DEFAULT_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

// ジョブ固有の期待値。「どのコードで本番を監視するか」を明文化しておく場所。
const EXPECTATIONS = {
  'com.kawabado.daily-ops-check': {
    // 本番デプロイ元。feature worktree を指すと本番と違うコードで本番を監視することになる。
    scriptMustStartWith: '/Users/shocchan/badminton-aicourse/',
    heartbeat: join(homedir(), 'ai-company/logs/daily-pf-analytics/ops-check-heartbeat.json'),
  },
};

/**
 * plistの中身（plutilでJSON化したオブジェクト）を検査して問題文字列の配列を返す。
 * ファイルシステムへの問い合わせは exists で差し替えられる＝self-testできる。
 */
export function auditPlist(label, plist, opts = {}) {
  const exists = opts.exists ?? ((p) => existsSync(p));
  const problems = [];

  const args = plist.ProgramArguments;
  if (!Array.isArray(args) || args.length === 0) {
    problems.push('ProgramArguments が無い（何も実行されない）');
    return problems;
  }

  // 1. 実行ファイルとスクリプトの実在
  for (const [i, a] of args.entries()) {
    if (typeof a !== 'string' || !a.startsWith('/')) continue; // オプション文字列は対象外
    if (!exists(a)) {
      problems.push(`ProgramArguments[${i}] のパスが存在しない: ${a}`);
    }
  }

  // 2. PATH（今回の事故そのもの）
  const interp = args[0];
  const interpDir = dirname(interp);
  const envPath = plist.EnvironmentVariables?.PATH;
  if (!LAUNCHD_DEFAULT_PATH.includes(interpDir)) {
    if (!envPath) {
      problems.push(
        `EnvironmentVariables/PATH が無い。実行ファイルが ${interpDir} にあり、launchd既定PATH`
        + `(${LAUNCHD_DEFAULT_PATH.join(':')}) に含まれないため、子プロセスの解決に失敗する`);
    } else if (!envPath.split(':').includes(interpDir)) {
      problems.push(`EnvironmentVariables/PATH に ${interpDir} が含まれていない（PATH=${envPath}）`);
    }
  }

  // 3. ログの出力先ディレクトリ
  for (const key of ['StandardOutPath', 'StandardErrorPath']) {
    const p = plist[key];
    if (typeof p === 'string' && !exists(dirname(p))) {
      problems.push(`${key} の親ディレクトリが存在しない: ${dirname(p)}`);
    }
  }

  // 4. 起動時刻の指定（消えると永久に動かないまま「登録済み」に見える）
  if (!plist.StartCalendarInterval && !plist.StartInterval && plist.RunAtLoad !== true) {
    problems.push('StartCalendarInterval / StartInterval / RunAtLoad のいずれも無い（起動契機が無い）');
  }

  // 5. ジョブ固有の期待
  const exp = EXPECTATIONS[label];
  if (exp?.scriptMustStartWith) {
    const script = args.find((a) => typeof a === 'string' && a.endsWith('.mjs'));
    if (script && !script.startsWith(exp.scriptMustStartWith)) {
      problems.push(
        `監視対象のコードが本番デプロイ元ではない: ${script}\n`
        + `      （${exp.scriptMustStartWith} 配下を指すこと）`);
    }
  }

  return problems;
}

/** heartbeat の鮮度を見る。「ジョブが登録されている」と「実際に動いた」は別物。 */
export function auditHeartbeat(path, now = Date.now(), opts = {}) {
  const read = opts.read ?? ((p) => (existsSync(p) ? readFileSync(p, 'utf8') : null));
  const raw = read(path);
  if (raw === null) return [`生存確認ファイルが無い: ${path}（一度も完走していない疑い）`];
  let hb;
  try { hb = JSON.parse(raw); } catch { return [`生存確認ファイルが壊れている: ${path}`]; }
  const ageH = (now - Date.parse(hb.lastRunAt)) / 3600000;
  const limit = Number(hb.staleAfterHours) || 36;
  const out = [];
  if (!Number.isFinite(ageH)) out.push(`生存確認の lastRunAt が読めない: ${hb.lastRunAt}`);
  else if (ageH > limit) {
    out.push(`点検ジョブが ${ageH.toFixed(1)}時間 動いていない（上限${limit}h・最終=${hb.lastRunAt}）`);
  }
  if (hb.status === 'ERROR') out.push(`前回の点検が失敗している: ${hb.error ?? '(理由不明)'}`);
  return out;
}

// ---- self-test（判定ロジックそのものの検証。実環境に触らない） ----
if (process.argv.includes('--self-test')) {
  const allExists = () => true;
  const cases = [];
  const check = (name, got, want) => cases.push({ name, ok: got === want, got, want });

  const good = {
    ProgramArguments: ['/usr/local/bin/node', '/Users/shocchan/badminton-aicourse/scripts/ai-course/daily-ops-check.mjs'],
    EnvironmentVariables: { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' },
    StartCalendarInterval: { Hour: 10, Minute: 5 },
    StandardOutPath: '/Users/shocchan/ai-company/backups/ops-check-launchd.log',
  };
  check('正しいplistは問題なし',
    auditPlist('com.kawabado.daily-ops-check', good, { exists: allExists }).length, 0);

  const noPath = { ...good, EnvironmentVariables: undefined };
  check('PATH欠落を検出（事故の再現）',
    auditPlist('com.kawabado.daily-ops-check', noPath, { exists: allExists })
      .some((p) => p.includes('PATH')), true);

  const shortPath = { ...good, EnvironmentVariables: { PATH: '/usr/bin:/bin' } };
  check('PATHに実行ファイルのディレクトリが無いのを検出',
    auditPlist('com.kawabado.daily-ops-check', shortPath, { exists: allExists })
      .some((p) => p.includes('/usr/local/bin')), true);

  const wrongRepo = {
    ...good,
    ProgramArguments: ['/usr/local/bin/node', '/Users/shocchan/badminton-platform/scripts/ai-course/daily-ops-check.mjs'],
  };
  check('本番デプロイ元でないパスを検出（事故の再現）',
    auditPlist('com.kawabado.daily-ops-check', wrongRepo, { exists: allExists })
      .some((p) => p.includes('本番デプロイ元')), true);

  check('存在しないパスを検出',
    auditPlist('com.kawabado.daily-ops-check', good, { exists: () => false })
      .some((p) => p.includes('存在しない')), true);

  check('起動契機なしを検出',
    auditPlist('x', { ProgramArguments: ['/bin/bash', '/tmp/a.sh'] }, { exists: allExists })
      .some((p) => p.includes('起動契機')), true);

  const now = Date.parse('2026-08-24T12:00:00Z');
  check('heartbeatが新しければ問題なし',
    auditHeartbeat('/x', now, { read: () => JSON.stringify({ lastRunAt: '2026-08-24T10:05:00Z', status: 'OK', staleAfterHours: 36 }) }).length, 0);
  check('heartbeatが古ければ検出',
    auditHeartbeat('/x', now, { read: () => JSON.stringify({ lastRunAt: '2026-08-20T10:05:00Z', status: 'OK', staleAfterHours: 36 }) })
      .some((p) => p.includes('動いていない')), true);
  check('heartbeat不在を検出',
    auditHeartbeat('/x', now, { read: () => null }).some((p) => p.includes('一度も完走')), true);
  check('前回ERRORを検出',
    auditHeartbeat('/x', now, { read: () => JSON.stringify({ lastRunAt: '2026-08-24T10:05:00Z', status: 'ERROR', error: 'boom', staleAfterHours: 36 }) })
      .some((p) => p.includes('失敗')), true);

  let failed = 0;
  for (const c of cases) {
    console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : ` (got=${c.got} want=${c.want})`}`);
    if (!c.ok) failed++;
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  process.exit(failed ? 1 : 0);
}

// ---- 実環境の検査 ----
let bad = 0;
const files = existsSync(AGENT_DIR)
  ? readdirSync(AGENT_DIR).filter((f) => f.startsWith(PREFIX) && f.endsWith('.plist')).sort()
  : [];

if (files.length === 0) {
  console.log(`(検査対象なし: ${AGENT_DIR} に ${PREFIX}*.plist がありません)`);
  process.exit(0);
}

for (const f of files) {
  const path = join(AGENT_DIR, f);
  const label = f.replace(/\.plist$/, '');
  let plist;
  try {
    plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }));
  } catch (e) {
    console.log(`NG  ${label}\n      plistが読めない: ${`${e?.message ?? e}`.split('\n')[0]}`);
    bad++;
    continue;
  }

  const problems = auditPlist(label, plist);

  // 実行ビットは実環境でだけ見る
  const interp = plist.ProgramArguments?.[0];
  if (typeof interp === 'string' && existsSync(interp)) {
    try { accessSync(interp, constants.X_OK); }
    catch { problems.push(`実行ファイルに実行権限が無い: ${interp}`); }
  }

  const hbPath = EXPECTATIONS[label]?.heartbeat;
  if (hbPath) problems.push(...auditHeartbeat(hbPath));

  if (problems.length === 0) {
    console.log(`ok  ${label}`);
  } else {
    console.log(`NG  ${label}`);
    for (const p of problems) console.log(`      - ${p}`);
    bad++;
  }
}

console.log(`\n${files.length - bad}/${files.length} ジョブが正常`);
if (bad) {
  console.log('直し方: docs/ai-course/ops/ADMIN_JOBS.md「機械の生存確認」を参照');
}
process.exit(bad ? 1 : 0);

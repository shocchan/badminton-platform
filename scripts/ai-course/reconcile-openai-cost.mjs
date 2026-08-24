// OpenAI の実請求と、自社の原価記録を突き合わせる（読み取り専用・2026-08-24 WAVE 4-4）。
//
// ── なぜ要るか ────────────────────────────────────────────────
// これまで「実測 $8.11/時間」と呼んでいた数字は、自分の見積り式の出力を
// 時間で割り戻したものだった（循環参照）。OpenAI の実請求とは一度も比べていない。
// このスクリプトが、比べる手段そのもの。**書き込みは一切しない。**
//
// ── 実行 ────────────────────────────────────────────────────
//   OPENAI_ADMIN_KEY=sk-admin-... \
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/ai-course/reconcile-openai-cost.mjs --from 2026-08-01 --to 2026-08-24
//
//   --from / --to を省くと JST の今月1日〜今日。
//   --json を付けると機械可読な JSON だけを出す。
//
// ── 必要な環境変数 ──────────────────────────────────────────
//   OPENAI_ADMIN_KEY            組織の **Admin API key**（sk-admin-…）。
//                               通常の OPENAI_API_KEY では /v1/organization/* は 401 になる。
//                               発行は OpenAI ダッシュボード > Organization > Admin keys（CEO作業）。
//   SUPABASE_URL                本番/staging の URL
//   SUPABASE_SERVICE_ROLE_KEY   ai_usage_events / ai_usage_daily を読むため
//   （どれか欠けていれば、その部分は取得せず「未取得」と出す。落とさない）
//
// ── 突合の粒度 ──────────────────────────────────────────────
//   日次 × モデル。それ以上細かくすると OpenAI 側の bucket と噛み合わない。
//   OpenAI の日付境界は **UTC**、こちらの usage_date は **Asia/Tokyo**。
//   JST 0:00〜9:00 の利用は OpenAI 側では前日に入る。1日単位で±9時間ずれるので、
//   **1日だけを見て一致を判断しない**（月合計か、数日の移動合計で見る）。
//
// ── ズレたときに何を疑うか ──────────────────────────────────
//   A. OpenAI > 自社 のとき（自社が過少）
//      1. デモモード（/ai-lesson-demo）の利用。learner が居ないので原価が誰にも紐づかない
//      2. 音声の分数が入っていない → ai_backfill_voice_usage_events() を実行したか
//      3. 記録RPCの失敗（Edge Function は記録失敗でも会話を続ける設計）。
//         Supabase の Function ログで "usage event record failed" を探す
//      4. こちらが知らないモデル・機能を使っている（画像・埋め込み等）
//      5. **音声の1分あたりトークン仮定が低すぎる**（ai_config.realtime_token_estimate）
//   B. 自社 > OpenAI のとき（自社が過大）
//      1. 未知モデルのフォールバック（表の最大単価で計上している）。
//         ai_usage_events の model を見て、単価表に無い名前が無いか確認する
//      2. 音声の分数に接続待ち・無音が入っている（duration_source を見る）
//      3. キャッシュ入力を通常入力として数えている
//   C. トークン数は合うのに金額が合わないとき
//      → 単価表（ai_model_prices）が実際と違う。provenance に "(未突合)" が
//        残っている行が犯人候補。ここを直したら "(未突合)" を消す。
//
// 突合できた月の値は、ai_usage_events.source='billed' として別途記録する運用にする
// （このスクリプトは書かないので、記録はCEO承認のうえ別途）。

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const JSON_ONLY = args.includes('--json');

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const jstMonthStart = () => `${jstToday().slice(0, 7)}-01`;

const FROM = argOf('from') ?? jstMonthStart();
const TO = argOf('to') ?? jstToday();

if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO)) {
  console.error('--from / --to は YYYY-MM-DD で指定してください');
  process.exit(2);
}

const ADMIN_KEY = process.env.OPENAI_ADMIN_KEY?.trim();
const SUPA_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const log = (...a) => { if (!JSON_ONLY) console.log(...a); };
const usd = (n) => `$${Number(n ?? 0).toFixed(4)}`;

/* ── OpenAI 側（読み取りのみ） ─────────────────────────────── */

// UTC の epoch 秒。OpenAI の start_time/end_time は UTC 基準
const utcSec = (dateStr, endOfDay = false) =>
  Math.floor(Date.parse(`${dateStr}T${endOfDay ? '23:59:59' : '00:00:00'}Z`) / 1000);

const openaiGet = async (path, params) => {
  const url = new URL(`https://api.openai.com/v1/organization/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  const out = [];
  let page = null;
  // ページングは必ず辿る（途中で切ると「OpenAI のほうが少ない」と誤診する）
  for (let guard = 0; guard < 50; guard += 1) {
    if (page) url.searchParams.set('page', page);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${ADMIN_KEY}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI ${path} ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    out.push(...(json.data ?? []));
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return out;
};

/** 完了API（chat）の利用量をモデル別・日別に */
const fetchCompletionsUsage = async () => {
  const buckets = await openaiGet('usage/completions', {
    start_time: utcSec(FROM),
    end_time: utcSec(TO, true),
    bucket_width: '1d',
    group_by: 'model',
    limit: 31,
  });
  const rows = [];
  for (const b of buckets) {
    const day = new Date(b.start_time * 1000).toISOString().slice(0, 10);
    for (const r of b.results ?? []) {
      rows.push({
        day,
        model: r.model ?? '(unknown)',
        inputTokens: r.input_tokens ?? 0,
        cachedInputTokens: r.input_cached_tokens ?? 0,
        outputTokens: r.output_tokens ?? 0,
        requests: r.num_model_requests ?? 0,
      });
    }
  }
  return rows;
};

// 音声（realtime）は usage/completions には出てこない。
// 実請求（Costs API）の line_item に出るので、そちらで見る。
// つまり音声については **トークン数の突合はできず、金額の突合しかできない**。
// だからこそ ai_usage_events に「分数」と「その分数をどう測ったか」を残している。

/** 実請求（Costs API）。**これが唯一の「実測」** */
const fetchCosts = async () => {
  const buckets = await openaiGet('costs', {
    start_time: utcSec(FROM),
    end_time: utcSec(TO, true),
    bucket_width: '1d',
    limit: 31,
  });
  const rows = [];
  for (const b of buckets) {
    const day = new Date(b.start_time * 1000).toISOString().slice(0, 10);
    for (const r of b.results ?? []) {
      rows.push({
        day,
        lineItem: r.line_item ?? '(all)',
        amountUsd: r.amount?.value ?? 0,
      });
    }
  }
  return rows;
};

/* ── 自社側（読み取りのみ） ─────────────────────────────── */

const supaGet = async (path) => {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const fetchOurEvents = async () => {
  const rows = await supaGet(
    `ai_usage_events?usage_date=gte.${FROM}&usage_date=lte.${TO}`
    + '&select=usage_date,kind,model,source,input_tokens,cached_input_tokens,output_tokens,'
    + 'audio_input_tokens,audio_output_tokens,realtime_seconds,estimated_cost_usd&limit=10000',
  );
  return rows;
};

const fetchOurDaily = async () => supaGet(
  `ai_usage_daily?usage_date=gte.${FROM}&usage_date=lte.${TO}&select=usage_date,seconds_used,estimated_cost_usd&limit=10000`,
);

/* ── 突合 ─────────────────────────────── */

const sum = (rows, pick) => rows.reduce((a, r) => a + Number(pick(r) ?? 0), 0);

const main = async () => {
  const report = { from: FROM, to: TO, openai: null, ours: null, gap: null, warnings: [] };

  log(`\n=== AI原価の突合 ${FROM} 〜 ${TO} ===`);
  log('※ OpenAI の日付境界は UTC、こちらは Asia/Tokyo。1日単位では±9時間ずれる。月合計で見ること。\n');

  if (!ADMIN_KEY) {
    report.warnings.push('OPENAI_ADMIN_KEY 未設定: OpenAI 側は未取得');
    log('[skip] OPENAI_ADMIN_KEY が無いので OpenAI 側は取得しない');
    log('       → OpenAI ダッシュボード > Organization > Admin keys で sk-admin-… を発行（CEO作業）\n');
  } else {
    try {
      const [completions, costs] = await Promise.all([fetchCompletionsUsage(), fetchCosts()]);
      const byModel = new Map();
      for (const r of completions) {
        const cur = byModel.get(r.model) ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, requests: 0 };
        cur.inputTokens += r.inputTokens;
        cur.cachedInputTokens += r.cachedInputTokens;
        cur.outputTokens += r.outputTokens;
        cur.requests += r.requests;
        byModel.set(r.model, cur);
      }
      report.openai = {
        billedUsd: sum(costs, (r) => r.amountUsd),
        byLineItem: costs.reduce((acc, r) => {
          acc[r.lineItem] = (acc[r.lineItem] ?? 0) + r.amountUsd; return acc;
        }, {}),
        byModel: Object.fromEntries(byModel),
      };
      log('── OpenAI 実請求 ──');
      log(`  合計: ${usd(report.openai.billedUsd)}`);
      for (const [item, amt] of Object.entries(report.openai.byLineItem).sort((a, b) => b[1] - a[1])) {
        log(`    ${item.padEnd(38)} ${usd(amt)}`);
      }
      log('\n── OpenAI 利用量（chat/completions・モデル別） ──');
      for (const [model, t] of byModel) {
        log(`    ${model.padEnd(34)} req=${String(t.requests).padStart(6)} in=${t.inputTokens} cached=${t.cachedInputTokens} out=${t.outputTokens}`);
      }
      log('');
    } catch (e) {
      report.warnings.push(`OpenAI 取得失敗: ${e.message}`);
      log(`[error] OpenAI 取得失敗: ${e.message}\n`);
    }
  }

  if (!SUPA_URL || !SERVICE_KEY) {
    report.warnings.push('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定: 自社側は未取得');
    log('[skip] Supabase の環境変数が無いので自社側は取得しない\n');
  } else {
    try {
      const [events, daily] = await Promise.all([fetchOurEvents(), fetchOurDaily()]);
      const byKey = new Map();
      for (const e of events) {
        const k = `${e.kind}/${e.model}/${e.source}`;
        const cur = byKey.get(k) ?? { calls: 0, in: 0, cached: 0, out: 0, aIn: 0, aOut: 0, sec: 0, usd: 0 };
        cur.calls += 1;
        cur.in += Number(e.input_tokens ?? 0);
        cur.cached += Number(e.cached_input_tokens ?? 0);
        cur.out += Number(e.output_tokens ?? 0);
        cur.aIn += Number(e.audio_input_tokens ?? 0);
        cur.aOut += Number(e.audio_output_tokens ?? 0);
        cur.sec += Number(e.realtime_seconds ?? 0);
        cur.usd += Number(e.estimated_cost_usd ?? 0);
        byKey.set(k, cur);
      }
      report.ours = {
        eventsUsd: sum(events, (r) => r.estimated_cost_usd),
        dailyUsd: sum(daily, (r) => r.estimated_cost_usd),
        byKey: Object.fromEntries(byKey),
        estimatedUsd: sum(events.filter((e) => e.source === 'estimated'), (r) => r.estimated_cost_usd),
        reportedUsd: sum(events.filter((e) => e.source === 'reported'), (r) => r.estimated_cost_usd),
      };
      log('── 自社の記録（ai_usage_events） ──');
      log(`  合計: ${usd(report.ours.eventsUsd)}`);
      log(`    うち推定(estimated・分数から): ${usd(report.ours.estimatedUsd)}`);
      log(`    うち実トークン(reported):      ${usd(report.ours.reportedUsd)}`);
      for (const [k, v] of [...byKey].sort((a, b) => b[1].usd - a[1].usd)) {
        log(`    ${k.padEnd(46)} calls=${String(v.calls).padStart(5)} ${usd(v.usd)}`);
      }
      log(`\n  参考: ai_usage_daily の合計 ${usd(report.ours.dailyUsd)}`);
      log('       （明細との差は「日次に載っていない原価」。点検ボードはこの日次を見ている）');
      log('');
    } catch (e) {
      report.warnings.push(`Supabase 取得失敗: ${e.message}`);
      log(`[error] Supabase 取得失敗: ${e.message}\n`);
    }
  }

  if (report.openai && report.ours) {
    const gap = report.openai.billedUsd - report.ours.eventsUsd;
    const ratio = report.ours.eventsUsd > 0 ? report.openai.billedUsd / report.ours.eventsUsd : null;
    report.gap = { usd: gap, ratio };
    log('── 差 ──');
    log(`  OpenAI 実請求 ${usd(report.openai.billedUsd)} − 自社記録 ${usd(report.ours.eventsUsd)} = ${usd(gap)}`);
    if (ratio !== null) log(`  倍率: ${ratio.toFixed(2)}x`);
    log(gap > 0
      ? '  → 自社が過少。上の「A」の順に疑う（デモ利用・音声分数未反映・記録失敗・未知の機能）'
      : '  → 自社が過大。上の「B」の順に疑う（未知モデルのフォールバック・分数の水増し・キャッシュ扱い）');
    log('');
  }

  if (JSON_ONLY) console.log(JSON.stringify(report, null, 2));
  if (report.warnings.length && !JSON_ONLY) {
    log('── 未取得・警告 ──');
    for (const w of report.warnings) log(`  - ${w}`);
    log('');
  }
};

main().catch((e) => { console.error(e); process.exit(1); });

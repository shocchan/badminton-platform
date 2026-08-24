// wild-flow（別 Supabase プロジェクト）を**読むだけ**の経路（2026-08-24 WAVE7）。
//
// なぜ別経路が要るか:
//   点検ボードの本体は remote-sql.mjs 経由で kawabado のプロジェクト
//   （jdkwijdphlkrcoiggfqw）を読む。大会もAIコースも同じプロジェクトなので
//   SELECTを足すだけで済む。ところが wild-flow だけは別プロジェクト
//   （sfpgajxqmcymzetjwypz）なので、読み取り経路を1本足す必要がある。
//
// 使うキー:
//   手元にあるのは anon キーだけ（~/wildflow-platform/wrangler.json の vars。公開値）。
//   quiz_leads の SELECT は認証済み管理者のみなので、anon では読めない。
//   読めないものは「読めません」と返す。**service_role キーが無いことを理由に落ちてはいけない。**
//   service_role を使いたい場合は環境変数 WILDFLOW_SERVICE_ROLE_KEY を渡す（保存しない）。
//
// 読み取り専用: GET だけ。POST/PATCH/DELETE は一切しない。
import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_REPO = '/Users/shocchan/wildflow-platform';
export const WILDFLOW_PROJECT_REF = 'sfpgajxqmcymzetjwypz';

/** 数えるテーブル。増やすときはここだけ触る */
export const WILDFLOW_TABLES = ['quiz_leads', 'lessons', 'lesson_entries'];

/**
 * anon キーで**本当に**数えられるテーブル（＝公開SELECTポリシーがあるもの）。
 *
 * ⚠️ これが要る理由: quiz_leads / lesson_entries は「匿名はINSERTのみ・SELECTは管理者だけ」で、
 *    anon キーで数えると 200 + [] が返る（count=0）。**0件なのか読めていないのか区別できない。**
 *    0件と表示すると「リードが1件も取れていない」と誤読するので、
 *    anon のときは数字を出さず「読めません」と言う。
 *    実際の RLS は wildflow-platform/supabase/migrations/20260824_quiz_leads_source.sql に明記。
 */
export const ANON_READABLE_TABLES = new Set(['lessons']);

/**
 * 接続情報を集める。**キー本体は返り値に入れるが、呼び出し側で絶対に出力しないこと。**
 * @returns {{ok:boolean, reason?:string, url?:string, key?:string, keyKind?:'service_role'|'anon', ga4:{configured:boolean, reason:string}}}
 */
export const loadWildflowConfig = (repo = DEFAULT_REPO, env = process.env) => {
  const ga4 = readGa4(repo, env);
  const wranglerPath = `${repo}/wrangler.json`;
  let url = env.WILDFLOW_SUPABASE_URL ?? '';
  let anon = '';
  if (existsSync(wranglerPath)) {
    try {
      const w = JSON.parse(readFileSync(wranglerPath, 'utf8'));
      url = url || (w?.vars?.SUPABASE_URL ?? '');
      anon = w?.vars?.SUPABASE_ANON_KEY ?? '';
    } catch { /* 読めなければ .env にフォールバック */ }
  }
  if (!url || !anon) {
    const envPath = `${repo}/.env`;
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        if (m[1] === 'VITE_SUPABASE_URL' && !url) url = m[2].trim();
        if (m[1] === 'VITE_SUPABASE_ANON_KEY' && !anon) anon = m[2].trim();
      }
    }
  }
  const service = (env.WILDFLOW_SERVICE_ROLE_KEY ?? '').trim();
  const key = service || anon;
  if (!url || !key) {
    return { ok: false, reason: `接続情報が見つかりません（${repo}）`, ga4 };
  }
  if (!url.includes(WILDFLOW_PROJECT_REF)) {
    // 別プロジェクトへ誤射しないための歯止め（remote-sql.mjs と同じ考え方）
    return { ok: false, reason: `想定と違うプロジェクトを指しています（${url}）`, ga4 };
  }
  return { ok: true, url, key, keyKind: service ? 'service_role' : 'anon', ga4 };
};

/** GA4の測定IDが仕込まれているか。空なら「計測なし」と正直に出す */
const readGa4 = (repo, env) => {
  const fromEnv = (env.VITE_GA4_ID ?? '').trim();
  if (fromEnv) return { configured: true, reason: '環境変数 VITE_GA4_ID' };
  const envPath = `${repo}/.env`;
  if (existsSync(envPath)) {
    const m = /^\s*VITE_GA4_ID\s*=\s*(\S+)\s*$/m.exec(readFileSync(envPath, 'utf8'));
    if (m && m[1]) return { configured: true, reason: `${envPath}` };
  }
  return {
    configured: false,
    // GitHub Secrets 側に入っている可能性は手元から確認できない。断定せず「手元では未設定」と言う
    reason: '手元に VITE_GA4_ID が無い（ビルド時Secretは手元から確認できない）',
  };
};

/** PostgREST の count=exact で件数だけ取る（行の中身は取らない＝個人情報を持ち出さない） */
const countRows = async (cfg, table, fetchImpl) => {
  try {
    const res = await fetchImpl(`${cfg.url}/rest/v1/${table}?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    if (!res.ok) {
      const reason = res.status === 401 || res.status === 403 || res.status === 404
        ? `${cfg.keyKind}キーでは権限がありません（http ${res.status}）`
        : `http ${res.status}`;
      return { ok: false, reason };
    }
    const range = res.headers?.get?.('content-range') ?? '';
    const total = Number(String(range).split('/')[1]);
    if (!Number.isFinite(total)) return { ok: false, reason: '件数が返りませんでした' };
    return { ok: true, count: total };
  } catch (e) {
    return { ok: false, reason: `${e?.message ?? e}`.split('\n')[0] };
  }
};

/**
 * wild-flow の件数を読む。**どんな失敗でも例外を投げない。**
 * @returns {{connected:boolean, reason?:string, ga4:object, counts?:object, keyKind?:string}}
 */
export const readWildflow = async (opts = {}) => {
  const repo = opts.repo ?? DEFAULT_REPO;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const tables = opts.tables ?? WILDFLOW_TABLES;
  const cfg = opts.config ?? loadWildflowConfig(repo, opts.env ?? process.env);
  if (!cfg.ok) return { connected: false, reason: cfg.reason, ga4: cfg.ga4 };
  if (typeof fetchImpl !== 'function') {
    return { connected: false, reason: 'fetch が使えません', ga4: cfg.ga4 };
  }
  const counts = {};
  for (const t of tables) {
    if (cfg.keyKind === 'anon' && !ANON_READABLE_TABLES.has(t)) {
      // 問い合わせすらしない。RLSで0件に見えるだけの数字を持ち帰らない
      counts[t] = { ok: false, reason: 'anonキーでは読めません（RLSで0件に見える）' };
      continue;
    }
    counts[t] = await countRows(cfg, t, fetchImpl);
  }
  return { connected: true, keyKind: cfg.keyKind, ga4: cfg.ga4, counts };
};

// 手で確認するとき: node scripts/ai-course/wildflow-read.mjs
if (process.argv[1] && process.argv[1].endsWith('wildflow-read.mjs')) {
  const r = await readWildflow();
  console.log(JSON.stringify({ ...r, keyKind: r.keyKind }, null, 1));
}

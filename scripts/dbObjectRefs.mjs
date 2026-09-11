// コードが呼んでいる「DBの関数（RPC）とテーブル」の名前を、ソースから取り出す（2026-09-10）。
//
// 【なぜ要るか】
// 管理画面の「入金確認」ボタンは admin_set_entry_payment という関数を呼んでいたが、
// その関数を作る migration が本番DBに一度も適用されておらず、押すと404だった。
// 8/28 のブランチ統合から約2週間、誰も気づかなかった（問い合わせタブも同じ理由で壊れていた）。
// **repo に migration ファイルがあることは、本番DBにあることの証拠にならない。**
// デプロイ前に「コードが呼ぶもの」と「本番DBにあるもの」を突き合わせるための部品
// （突き合わせる本体は scripts/check-db-objects.mjs）。
//
// 【拾う書き方】実際のコードにある形だけ。増やすときは、実物の例をテストに足してから広げる
//   1. supabase-js           supabase.rpc('name', …) / supabase.from('table')
//   2. REST を直に叩く        `${url}/rest/v1/rpc/name` / `${url}/rest/v1/table?…`
//   3. Edge Function の      const rpc = async (fn, args) => fetch(`${u}/rest/v1/rpc/${fn}`, …)
//      ローカルヘルパー       を rpc("name", …) で呼ぶ形。名前が何番目の引数かは定義から読む
//                           （ai-course-auth は rpc(url, key, "name", args) で3番目）。
//                           path を受けるヘルパー get("table?select=…") と、それを1段かぶせたものも辿る
//
// 【拾わないもの】拾うと嘘でデプロイが止まり、面倒がられて門ごと外される（それが一番危ない）
//   - storage.from('bucket')      … テーブルではなく Storage のバケット
//   - Array.from('…') など組み込みの from
//   - 名前が変数のもの rpc(fn, …)  … 実行するまで分からない。見逃しにはなるが、嘘の停止はしない
//   - 引数の中の文字列（{ status: 'awaiting_payment' }）
//   - コメントに書いた名前

const NAME = /^[a-z_][a-z0-9_]*$/;
const QUOTES = new Set(['"', "'", '`']);
const BUILTIN_FROM = /(?:\bstorage|\b(?:Array|Buffer|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array|Object|String|Set|Map|Promise))\s*\??\.$/;

/** 本番で実行されるコードだけを見る（テスト・型定義は除く） */
export const isScannedFile = (path) =>
  /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path)
  && !/\.d\.ts$/.test(path)
  && !/[._](?:test|spec)\.[cm]?[jt]sx?$/.test(path)
  && !/(?:^|[\\/])__tests__[\\/]/.test(path);

export const emptyRefs = () => ({ rpcs: new Map(), tables: new Map() });

/** 1ファイル分（名前 → 行番号）を、全体（名前 → "ファイル:行"）へ足す */
export const addRefs = (into, refs, file) => {
  for (const kind of ['rpcs', 'tables']) {
    for (const [name, lines] of refs[kind]) {
      if (!into[kind].has(name)) into[kind].set(name, []);
      for (const line of lines) into[kind].get(name).push(`${file}:${line}`);
    }
  }
  return into;
};

/** 呼んでいるのに本番DBに無いもの（名前順） */
export const findMissing = (refs, liveFunctions, liveRelations) => ({
  rpcs: [...refs.rpcs.keys()].filter((n) => !liveFunctions.has(n)).sort(),
  tables: [...refs.tables.keys()].filter((n) => !liveRelations.has(n)).sort(),
});

/** コメントを同じ長さの空白にする（行番号をずらさない） */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, (m) => ' '.repeat(m.length));

const lineOf = (s, index) => s.slice(0, index).split('\n').length;

/** open の位置の括弧に対応する閉じ括弧の位置（文字列の中は数えない） */
const matchClose = (s, open, opener, closer) => {
  let depth = 0;
  let quote = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (QUOTES.has(c)) quote = c;
    else if (c === opener) depth++;
    else if (c === closer && --depth === 0) return i;
  }
  return -1;
};

/** 呼び出しの引数を、トップレベルのカンマで分ける（open は "(" の位置） */
const readArgs = (s, open) => {
  const close = matchClose(s, open, '(', ')');
  if (close < 0) return [];
  const inner = s.slice(open + 1, close);
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === '\\') cur += inner[++i] ?? '';
      else if (c === quote) quote = null;
      continue;
    }
    if (QUOTES.has(c)) quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

/** 引数が文字列リテラルそのものなら中身。テンプレートは ${ より前だけを返し complete=false */
const literalOf = (arg) => {
  const m = /^(['"`])([\s\S]*)\1$/.exec(arg ?? '');
  if (!m) return null;
  if (m[1] !== '`' || !m[2].includes('${')) return { value: m[2], complete: true };
  return { value: m[2].slice(0, m[2].indexOf('${')), complete: false };
};

/** 関数定義の引数名（型注釈 Record<string, unknown> の中のカンマでは分けない） */
const paramNames = (text) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{<'.includes(c)) depth++;
    else if (')]}'.includes(c) || (c === '>' && text[i - 1] !== '=')) depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim().replace(/^\.\.\./, '').split(/[?:=\s]/)[0]);
};

/** 関数定義の本体（引数の閉じ括弧 close の後ろ）。ヘルパーの中身だけを見るために使う */
const bodyOf = (s, close) => {
  let i = close + 1;
  let depth = 0;
  let found = false;
  // 戻り値の型注釈（: Promise<{ ok: boolean }>）を飛ばして、=> か { を探す
  for (; i < s.length && i < close + 300; i++) {
    const c = s[i];
    if ('(<['.includes(c)) depth++;
    else if (')]'.includes(c) || (c === '>' && s[i - 1] !== '=')) depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === '=' && s[i + 1] === '>') { i += 2; found = true; break; }
    else if (depth === 0 && c === '{') { found = true; break; }
    else if (depth === 0 && (c === ';' || c === ',')) return '';
  }
  if (!found) return '';
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] === '{') {
    const end = matchClose(s, i, '{', '}');
    return s.slice(i, end < 0 ? Math.min(s.length, i + 3000) : end + 1);
  }
  // 式だけの本体（=> fetch(…);）は、文の終わりまで
  let d = 0;
  let quote = null;
  let j = i;
  for (; j < s.length && j < i + 2000; j++) {
    const c = s[j];
    if (quote) {
      if (c === '\\') j++;
      else if (c === quote) quote = null;
      continue;
    }
    if (QUOTES.has(c)) quote = c;
    else if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { if (d === 0) break; d--; }
    else if (d === 0 && c === ';') break;
    else if (d === 0 && c === '\n'
      && /^\s*(?:const|let|var|function|export|async\s+function|if|for|return)\b/.test(s.slice(j + 1, j + 40))) break;
  }
  return s.slice(i, j);
};

const escapeRe = (name) => name.replace(/\$/g, '\\$');
/** 名前そのものの呼び出し（obj.name( は別物なので除く） */
const callsOf = (s, name) => s.matchAll(new RegExp(`(?<![\\w$.])${escapeRe(name)}\\s*\\(`, 'g'));

/** `${u}/rest/v1/rpc/${fn}` や `${u}/rest/v1/${path}` を組み立てるヘルパーを探す */
const findHelpers = (s) => {
  const defs = [];
  const DEF = /(?:\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(|\bfunction\s+([A-Za-z_$][\w$]*)\s*\()/g;
  for (const m of s.matchAll(DEF)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(s, open, '(', ')');
    if (close < 0) continue;
    defs.push({
      name: m[1] ?? m[2],
      defOpen: open,
      params: paramNames(s.slice(open + 1, close)),
      body: bodyOf(s, close),
    });
  }

  const helpers = [];
  const known = (name) => helpers.some((h) => h.name === name);
  for (const d of defs) {
    const rpc = /\/rest\/v1\/rpc\/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/.exec(d.body);
    const path = /\/rest\/v1\/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/.exec(d.body);
    const hit = rpc ? { kind: 'rpc', param: rpc[1] } : path ? { kind: 'path', param: path[1] } : null;
    if (!hit || known(d.name)) continue;
    const pos = d.params.indexOf(hit.param);
    if (pos >= 0) helpers.push({ name: d.name, kind: hit.kind, pos, defOpen: d.defOpen });
  }

  // 1段かぶせたヘルパー（get(path) の中で rest(path) を呼ぶ）も辿る。
  // それより深いものは追わない（見逃すだけで、嘘の停止はしない）
  for (let round = 0; round < 2; round++) {
    for (const d of defs) {
      if (known(d.name)) continue;
      for (const h of [...helpers]) {
        for (const m of callsOf(d.body, h.name)) {
          const arg = readArgs(d.body, m.index + m[0].length - 1)[h.pos];
          const pos = arg ? d.params.indexOf(arg) : -1;
          if (pos >= 0) {
            helpers.push({ name: d.name, kind: h.kind, pos, defOpen: d.defOpen });
            break;
          }
        }
        if (known(d.name)) break;
      }
    }
  }
  return helpers;
};

/**
 * 1ファイルのソースから、呼んでいる関数（rpcs）とテーブル（tables）を取り出す。
 * どちらも Map<名前, 行番号[]>。
 */
export const extractDbRefs = (source) => {
  const s = stripComments(source);
  const refs = emptyRefs();
  const add = (kind, name, index) => {
    if (!NAME.test(name)) return;
    if (!refs[kind].has(name)) refs[kind].set(name, []);
    refs[kind].get(name).push(lineOf(s, index));
  };

  // 1. supabase-js
  for (const m of s.matchAll(/\.rpc(?:<[^>()]*>)?\(\s*(['"`])([^'"`]+)\1/g)) add('rpcs', m[2], m.index);
  for (const m of s.matchAll(/\.\s*from(?:<[^>()]*>)?\(\s*(['"`])([^'"`]+)\1/g)) {
    if (BUILTIN_FROM.test(s.slice(Math.max(0, m.index - 40), m.index + 1))) continue;
    add('tables', m[2], m.index);
  }

  // 2. REST を直に叩く（名前が文字で書いてあるものだけ）
  for (const m of s.matchAll(/\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)(?![\w$])/g)) add('rpcs', m[1], m.index);
  for (const m of s.matchAll(/\/rest\/v1\/(?!rpc\/)([a-z_][a-z0-9_]*)(?=[?/`'"]|$)/gm)) add('tables', m[1], m.index);

  // 3. ヘルパー経由
  for (const h of findHelpers(s)) {
    for (const m of callsOf(s, h.name)) {
      const open = m.index + m[0].length - 1;
      if (open === h.defOpen) continue;
      const lit = literalOf(readArgs(s, open)[h.pos]);
      if (!lit) continue;
      if (h.kind === 'rpc') {
        if (lit.complete) add('rpcs', lit.value, m.index);
        continue;
      }
      const rpcPath = /^rpc\/([a-z_][a-z0-9_]*)$/.exec(lit.value);
      if (rpcPath && lit.complete) {
        add('rpcs', rpcPath[1], m.index);
        continue;
      }
      // テンプレートの途中までしか分からないときは、? か / で名前が終わっている場合だけ信じる
      const table = (lit.complete ? /^([a-z_][a-z0-9_]*)(?=$|[?/])/ : /^([a-z_][a-z0-9_]*)(?=[?/])/).exec(lit.value);
      if (table && table[1] !== 'rpc') add('tables', table[1], m.index);
    }
  }
  return refs;
};

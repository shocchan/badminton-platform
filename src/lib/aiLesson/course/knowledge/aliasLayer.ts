/**
 * Alias層 — 表示文字列を正準の知識IDへ解決する（2026-09-10 Phase 2-2）。
 *
 * 【なぜ要るか】
 * Phase 1 で「関連（similarPatterns）の37%がIDへ解決できない」と出た。
 * 中身を見ると、**無いのではなく、書き方が違うだけ**のものが大半だった:
 *
 *   参照側「〜は」          教材側「〜は（主題）」        … 括弧の曖昧さ回避
 *   参照側「〜ています」    教材側「〜ています（進行）」  … 同上
 *   参照側「〜はずだ」      教材側「〜はずです」          … 普通体／丁寧体
 *   参照側「〜ませんか」    教材側「〜ましょう／〜ませんか」… 複合パターンの片側
 *   参照側「〜ため」        教材側「〜ために」            … 末尾の助詞
 *
 * 「〜ています」と「〜ている」を別教材として作るのは誤り。**同じ概念の丁寧体／普通体**
 * であって、1つの知識項目に2つの表示形がある、が正しい。
 *
 * 【守ること】
 *  - 既存の表示文字列は1文字も変えない（画面にそのまま出ている）
 *  - 解決は「確度の高い順」に試し、当たらなければ null（近いものへ当てずっぽうで繋がない）
 *  - 括弧の中身（主題・伝聞…）は**曖昧なときの決め手**として使う。捨てない
 */

import { parseKnowledgeId, type KnowledgeLevel } from './knowledgeId';

/** 「〜そうです（伝聞）」→ { core: 'そうです', qualifier: '伝聞' } */
export const splitQualifier = (display: string): { core: string; qualifier: string | null } => {
  const s = (display ?? '').trim();
  const m = /^(.*?)[（(]([^）)]*)[）)]\s*$/.exec(s);
  if (!m) return { core: s, qualifier: null };
  return { core: m[1].trim(), qualifier: m[2].trim() || null };
};

/** 波ダッシュ・空白・記号を落として照合の芯にする */
const strip = (s: string): string =>
  s.replace(/[〜～\s・、，]/g, '').replace(/[＋+].*$/, '').trim();

/**
 * 丁寧体 ↔ 普通体、末尾の助詞など、**同じ概念の別形**を機械的に生む。
 * 生む順が確度の順（先に当たったものを採る）。
 */
export const formVariants = (core: string): string[] => {
  const base = strip(core);
  if (!base) return [];
  const out = new Set<string>([base]);

  // 丁寧体 ↔ 普通体（末尾だけ）
  const pairs: [RegExp, string][] = [
    [/です$/, 'だ'], [/だ$/, 'です'],
    [/ます$/, 'る'],
    [/ています$/, 'ている'], [/ている$/, 'ています'],
    [/ません$/, 'ない'], [/ない$/, 'ません'],
    [/ですか$/, ''], [/ますか$/, ''],
    [/でした$/, 'だった'], [/ました$/, 'た'],
  ];
  for (const [re, rep] of pairs) if (re.test(base)) out.add(base.replace(re, rep));

  // 末尾の助詞・接尾（「〜ため」↔「〜ために」、「〜次第」↔「〜次第では」）
  for (const suf of ['に', 'は', 'では', 'で', 'と', 'の', 'だ', 'です']) {
    if (base.endsWith(suf) && base.length > suf.length) out.add(base.slice(0, -suf.length));
  }
  for (const suf of ['に', 'だ', 'です']) out.add(base + suf);

  return [...out].filter(Boolean);
};

export interface AliasIndex {
  /** 芯 → 候補 { id, qualifier, original }。original=false は形の異形から作った索引 */
  byCore: Map<string, { id: string; qualifier: string | null; original: boolean }[]>;
}

export interface AliasSource {
  grammarId: string;
  pattern?: string;
}

/**
 * 教材のパターンから索引を作る。1つのパターンから複数の芯を出す:
 *   「〜ましょう／〜ませんか」 → ましょう, ませんか
 *   「〜は（主題）」          → は（qualifier=主題）
 */
export const buildAliasIndex = (items: readonly AliasSource[]): AliasIndex => {
  const byCore = new Map<string, { id: string; qualifier: string | null; original: boolean }[]>();
  const add = (core: string, id: string, qualifier: string | null, original: boolean) => {
    const k = strip(core);
    if (!k) return;
    const cur = byCore.get(k) ?? [];
    const hit = cur.find((c) => c.id === id);
    if (!hit) cur.push({ id, qualifier, original });
    else if (original) hit.original = true;   // 元の形が後から来たら格上げ
    byCore.set(k, cur);
  };
  for (const g of items) {
    const raw = g.pattern ?? '';
    if (!raw) continue;
    // 複合パターンは片側ずつ
    for (const part of raw.split(/[／/]/)) {
      const { core, qualifier } = splitQualifier(part);
      add(core, g.grammarId, qualifier, true);
      // 形の異形も索引に載せる（教材側が丁寧体で参照側が普通体、のため）
      for (const v of formVariants(core)) add(v, g.grammarId, qualifier, false);
    }
  }
  return { byCore };
};

export type AliasResolution =
  | { kind: 'exact'; id: string }        // 芯も括弧も一致
  | { kind: 'variant'; id: string }      // 丁寧体／普通体・助詞の違いだけ
  | { kind: 'ambiguous'; ids: string[] } // 複数の項目に当たり、括弧でも決められない
  | { kind: 'none' };

/**
 * 表示文字列 → 正準ID。
 * 1. 芯が一致する候補を集める
 * 2. 括弧（主題・伝聞…）があれば、それで絞る
 * 3. まだ複数なら、呼び元と同じ級を優先
 * 4. それでも決まらなければ ambiguous（当てずっぽうで選ばない）
 */
export const resolveAlias = (
  index: AliasIndex, display: string, fromLevel?: KnowledgeLevel | null,
): AliasResolution => {
  const { core, qualifier } = splitQualifier(display);
  const tries = formVariants(core);
  if (tries.length === 0) return { kind: 'none' };

  for (let i = 0; i < tries.length; i += 1) {
    let cands = index.byCore.get(tries[i]);
    if (!cands || cands.length === 0) continue;

    if (qualifier) {
      const q = cands.filter((c) => c.qualifier && c.qualifier === qualifier);
      if (q.length > 0) cands = q;
    }
    if (cands.length > 1 && fromLevel) {
      const same = cands.filter((c) => parseKnowledgeId(c.id)?.level === fromLevel);
      if (same.length > 0) cands = same;
    }
    const ids = [...new Set(cands.map((c) => c.id))];
    if (ids.length === 1) {
      // 「exact」は参照の芯が教材の元の形そのものだったとき。異形経由なら variant
      const viaOriginal = i === 0 && cands.some((c) => c.id === ids[0] && c.original);
      return { kind: viaOriginal ? 'exact' : 'variant', id: ids[0] };
    }
    return { kind: 'ambiguous', ids };
  }
  return { kind: 'none' };
};

/* ────────────────────────────────────────────────────────────
   分類（Phase 2-2 の主目的）
   ──────────────────────────────────────────────────────────── */

export type UnresolvedClass =
  | 'alias'      // 既存項目の別表記（括弧・丁寧体・助詞）
  | 'partial'    // 既存項目の一部・活用形・敬語形（「〜はともかく」⊂「〜はともかくとして」）
  | 'ambiguous'  // 既存項目が複数当たり、人が決める
  | 'non-item'   // 単独の助詞・接続など。教材の1項目にする対象ではない
  | 'missing';   // 本当に教材が無い

export interface Classified {
  display: string;
  refs: number;
  cls: UnresolvedClass;
  id?: string;
  ids?: string[];
}

/**
 * 「教材の1項目にはしない」形。
 * 単独の格助詞・接続助詞・終助詞を関連として参照しているだけのもの。
 * これらは N5 の項目として既に在るか（は・を・が…）、在っても意味が薄い。
 * **在るものは alias 側で先に解決される**ので、ここに来るのは索引に無いものだけ。
 */
const NON_ITEM = /^[〜～]?(と|で|に|は|が|を|も|の|し|だ|よ|ね|か|や|て、〜|て|より|けど|けれども|から|まで)$/;

/**
 * 活用形・敬語形を辞書形へ戻す。**同じ概念の別形**を新教材にしないための最小の表。
 * ここに無い活用は戻さない（当てずっぽうの語形変化で別項目に繋がるほうが害）。
 */
const CONJUGATION: [RegExp, string][] = [
  [/思う$/, '思います'],     // 〜と思う → 〜と思います（丁寧体が教材側）
  [/すぎて$/, 'すぎる'],     // て形 → 辞書形
  [/くださる$/, 'くれる'],   // 敬語 → 普通（〜てくださる ⊂ 〜てくれる の敬語形）
  [/られない$/, 'られる'],   // 可能否定 → 可能
  [/きれない$/, 'きれる'],
  [/なくて$/, 'なくてもいい'], // 断片 → 代表形
];

/**
 * 既存項目の**一部**か。
 *   「〜はともかく」  ⊂ 「〜はともかくとして」（教材側が長い）
 *   「〜より〜のほうが」⊃ 「〜のほうが」        （参照側が短い）
 * 芯が3文字以上のときだけ見る（2文字だと何にでも含まれて誤爆する）。
 * 複数に含まれるときは**最も短い項目**を採る（最も近い概念）。
 */
export const resolvePartial = (
  index: AliasIndex, display: string, fromLevel?: KnowledgeLevel | null,
): { id: string } | null => {
  let core = strip(splitQualifier(display).core);
  for (const [re, rep] of CONJUGATION) if (re.test(core)) { core = core.replace(re, rep); break; }
  if ([...core].length < 3) return null;

  const hits: { id: string; key: string }[] = [];
  for (const [key, cands] of index.byCore) {
    if (key === core) continue;
    if (key.includes(core) || core.includes(key)) {
      if ([...key].length < 3) continue;
      for (const c of cands) hits.push({ id: c.id, key });
    }
  }
  if (hits.length === 0) return null;
  const rank = (h: { id: string; key: string }) =>
    (fromLevel && parseKnowledgeId(h.id)?.level === fromLevel ? 0 : 1000) + [...h.key].length;
  hits.sort((a, b) => rank(a) - rank(b));
  return { id: hits[0].id };
};

/**
 * 機械では決められなかった別表記を、**人が読んで決めた**対応表。
 * 機械の規則に無理に載せると誤爆が増えるものだけをここに置く。
 *   「〜結果」    → 「〜た結果」（先頭の「た」は規則で落とさない：落とすと別語に当たる）
 *   「〜ですよね」→ 「〜ね／〜よ」（終助詞の組み合わせ。単独項目にしない）
 *   「〜てくださる」→「〜てくれる」（敬語形。部分一致だと授受の別項目に当たっていた）
 *   「〜られない」→ 可能形（部分一致だと「迷惑の受身」に当たっていた）
 * 表示文字列は変えない。ここは**読み方**の追加。
 */
export const MANUAL_ALIASES: Record<string, string> = {
  '〜結果': 'n3g-takekka',
  '〜ですよね': 'n5g-ne-yo',
  '〜てくださる': 'n4g-tekureru',
  '〜られない': 'n4g-kanoukei',
  '〜ような': 'n3g-noyouna',
};

export const classifyUnresolved = (
  index: AliasIndex,
  unresolved: readonly { display: string; refs: number; fromLevel?: KnowledgeLevel | null }[],
): Classified[] =>
  unresolved.map((u) => {
    const manual = MANUAL_ALIASES[u.display.trim()];
    if (manual) return { display: u.display, refs: u.refs, cls: 'alias', id: manual };
    const r = resolveAlias(index, u.display, u.fromLevel);
    if (r.kind === 'exact' || r.kind === 'variant') return { display: u.display, refs: u.refs, cls: 'alias', id: r.id };
    if (r.kind === 'ambiguous') return { display: u.display, refs: u.refs, cls: 'ambiguous', ids: r.ids };
    if (NON_ITEM.test(u.display.trim())) return { display: u.display, refs: u.refs, cls: 'non-item' };
    const p = resolvePartial(index, u.display, u.fromLevel);
    if (p) return { display: u.display, refs: u.refs, cls: 'partial', id: p.id };
    return { display: u.display, refs: u.refs, cls: 'missing' };
  });

/**
 * 語彙へ Practical Axis のタグを付ける（2026-09-10 Phase 2-1）。
 *
 * 【方針：機械で付け、根拠を必ず残す】
 * 4,697語を人が手で分類するのは現実的でない。かといってAIに一括で振らせて
 * 「できました」で終わらせると、**間違っていても誰も気づけない**。
 * だから、どの語のどこに当たって付いたタグなのかを**1件ずつ残す**。
 * あとから人が見て直せる形にしておくことが、正確さそのものより大事。
 *
 * 【strong / weak を分ける理由】（実データで確認した誤判定）
 *   「兄」  例文=「兄は東京で働いています」→ work に当たるが、これは家族の語
 *   「病院」見出し語そのものが病院 → health は確実
 * 見出し語に当たったものだけを strong、例文・連語にしか出ないものを weak にする。
 * **weak を strong と同じ顔で出さない。** weak は「人が見る候補」であって結論ではない。
 *
 * 【付けないという判断】
 * どの手がかりにも当たらない語には**何も付けない**。
 * 「たぶん social」のような埋め方をすると、分野で引いたときに関係ない語が混ざり、
 * 軸そのものが信用されなくなる。空欄は空欄のまま残す。
 */

import {
  DOMAIN_KEYWORDS, SITUATION_KEYWORDS,
  type DomainTag, type PracticalDomain, type SituationTag, type SituationTagged, type TagSource,
} from './practicalAxis';

/** タグ付けに必要な、語彙の形（既存 VocabOriginalContent の部分集合） */
export interface TaggableWord {
  wordId: string;
  surface: string;
  level?: string;
  exampleJa?: string;
  collocationsJa?: readonly string[];
  /** その語の説明文（「代金」は買った物に対して払うお金です）。**語そのものの定義** */
  explanationJa?: string;
  /** 中国語の語釈 */
  glossZh?: string;
}

export interface TaggedWord {
  wordId: string;
  domains: DomainTag[];
  situations: SituationTagged[];
}

/*
 * 見出し語に当たったか、連語か。
 *
 * **例文は根拠にしない**（2026-09-10 実データで検証した結果）。
 * 例文に出る分野語は「その1文の状況」を表しているだけで、見出し語の分野ではない:
 *   「時間」 例文=「駅で時間を聞きました」        → transport になってしまう
 *   「今日」 例文=「今日は仕事が忙しい」          → work になってしまう
 *   「もう」 例文=「宿題はもう終わりました」      → school になってしまう
 * 実測で2,660本のタグが付いたが、見本を読むとほとんどがこの型の誤りだった。
 * **数を増やすより、間違ったタグを出さないほうを取る。**
 *
 * 1文字の手がかり語は**完全一致のときだけ**採る。
 * 部分一致を許すと「意味」が「味」に当たって food になる（実際に起きた）。
 */
const findHit = (
  word: TaggableWord, keyword: string,
): { source: TagSource; via: string } | null => {
  const oneChar = [...keyword].length === 1;
  const surfaceHit = oneChar ? word.surface === keyword : word.surface.includes(keyword);
  if (surfaceHit) return { source: 'surface', via: word.surface };

  /*
   * 説明文はその語の**定義**なので、例文と違って語の分野を表す。
   *   「代金」＝「買った物に対して払うお金です」→ shopping / money（正しい）
   * ただし1文字の手がかり語は定義文でも拾わない（「味」で「意味」を拾う類の事故を防ぐ）。
   */
  if (!oneChar) {
    if ((word.explanationJa ?? '').includes(keyword)) {
      return { source: 'definition', via: keyword };
    }
    const col = (word.collocationsJa ?? []).find((c) => c.includes(keyword));
    if (col) return { source: 'collocation', via: col };
  }
  return null;
};

/**
 * 1語にタグを付ける。
 * - 同じ分野は**いちばん強い根拠のものだけ**残す（同じタグが3本出ても意味がない）
 * - 1語が複数の分野を持ってよい（「予約」＝ food / health / work）
 */
export const tagWord = (word: TaggableWord): TaggedWord => {
  const domains: DomainTag[] = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [PracticalDomain, readonly string[]][]) {
    let best: DomainTag | null = null;
    for (const k of keywords) {
      const hit = findHit(word, k);
      if (!hit) continue;
      // 見出し語と定義文は語そのものについての根拠＝strong。連語は使われ方なので weak
      const confidence = (hit.source === 'surface' || hit.source === 'definition')
        ? 'strong' as const : 'weak' as const;
      // surface が見つかったらそれで確定（それ以上強い根拠は無い）
      if (hit.source === 'surface') { best = { domain, confidence, via: k, source: hit.source }; break; }
      if (!best) best = { domain, confidence, via: k, source: hit.source };
    }
    if (best) domains.push(best);
  }

  const situations: SituationTagged[] = [];
  for (const [situation, keywords] of Object.entries(SITUATION_KEYWORDS) as [SituationTag, readonly string[]][]) {
    for (const k of keywords) {
      const hit = findHit(word, k);
      if (!hit) continue;
      situations.push({ situation, via: k, source: hit.source });
      break;   // 場面は1語につき1本あれば足りる
    }
  }

  return { wordId: word.wordId, domains, situations };
};

export const tagWords = (words: readonly TaggableWord[]): TaggedWord[] => words.map(tagWord);

/* ────────────────────────────────────────────────────────────
   引く（Practical Axis の目的そのもの）
   ──────────────────────────────────────────────────────────── */

export interface LookupOptions {
  /** weak な根拠のタグも含めるか。既定は含めない（画面に出すのは確かなものだけ） */
  includeWeak?: boolean;
  level?: string;
}

/** 「病院で必要な語」を引く */
export const wordsInDomain = (
  tagged: readonly TaggedWord[], byId: ReadonlyMap<string, TaggableWord>,
  domain: PracticalDomain, opts: LookupOptions = {},
): TaggableWord[] => {
  const out: TaggableWord[] = [];
  for (const t of tagged) {
    const hit = t.domains.find((d) => d.domain === domain
      && (opts.includeWeak ? true : d.confidence === 'strong'));
    if (!hit) continue;
    const w = byId.get(t.wordId);
    if (!w) continue;
    if (opts.level && w.level !== opts.level) continue;
    out.push(w);
  }
  return out;
};

/** 「会社で依頼するときの語」を引く（どこで × 何をする） */
export const wordsInDomainSituation = (
  tagged: readonly TaggedWord[], byId: ReadonlyMap<string, TaggableWord>,
  domain: PracticalDomain, situation: SituationTag, opts: LookupOptions = {},
): TaggableWord[] => {
  const ids = new Set(tagged
    .filter((t) => t.situations.some((s) => s.situation === situation))
    .map((t) => t.wordId));
  return wordsInDomain(tagged, byId, domain, opts).filter((w) => ids.has(w.wordId));
};

/* ────────────────────────────────────────────────────────────
   QA（仕様が要求している検証項目）
   ──────────────────────────────────────────────────────────── */

export interface TagQaReport {
  total: number;
  /** 何らかの分野タグが付いた語 */
  tagged: number;
  /** strong な分野タグが付いた語 */
  taggedStrong: number;
  untagged: number;
  /** 2つ以上の分野を持つ語の割合（0〜1） */
  multiDomainRatio: number;
  /** weak しか根拠が無いタグの本数＝**人が見るべき候補** */
  suspicious: number;
  perDomain: Record<string, { strong: number; weak: number }>;
  perSituation: Record<string, number>;
  /** 級ごとの被覆（strong 基準） */
  perLevel: Record<string, { total: number; tagged: number }>;
}

export const tagQaReport = (
  words: readonly TaggableWord[], tagged: readonly TaggedWord[],
): TagQaReport => {
  const byId = new Map(words.map((w) => [w.wordId, w]));
  const perDomain: Record<string, { strong: number; weak: number }> = {};
  const perSituation: Record<string, number> = {};
  const perLevel: Record<string, { total: number; tagged: number }> = {};
  let withAny = 0; let withStrong = 0; let multi = 0; let suspicious = 0;

  for (const w of words) {
    const lv = w.level ?? '(不明)';
    perLevel[lv] ??= { total: 0, tagged: 0 };
    perLevel[lv].total += 1;
  }

  for (const t of tagged) {
    const strong = t.domains.filter((d) => d.confidence === 'strong');
    if (t.domains.length > 0) withAny += 1;
    if (strong.length > 0) {
      withStrong += 1;
      const lv = byId.get(t.wordId)?.level ?? '(不明)';
      perLevel[lv] ??= { total: 0, tagged: 0 };
      perLevel[lv].tagged += 1;
    }
    if (t.domains.length >= 2) multi += 1;
    for (const d of t.domains) {
      perDomain[d.domain] ??= { strong: 0, weak: 0 };
      perDomain[d.domain][d.confidence] += 1;
      if (d.confidence === 'weak') suspicious += 1;
    }
    for (const s of t.situations) perSituation[s.situation] = (perSituation[s.situation] ?? 0) + 1;
  }

  return {
    total: words.length,
    tagged: withAny,
    taggedStrong: withStrong,
    untagged: words.length - withAny,
    multiDomainRatio: words.length === 0 ? 0 : multi / words.length,
    suspicious,
    perDomain, perSituation, perLevel,
  };
};

/**
 * 人が読んで確かめるための見本。
 * **強いタグと弱いタグを混ぜて出す**（弱いほうにこそ間違いがあるため）。
 */
export const qaSamples = (
  words: readonly TaggableWord[], tagged: readonly TaggedWord[], perKind = 5,
): { strong: string[]; weak: string[]; untagged: string[] } => {
  const byId = new Map(words.map((w) => [w.wordId, w]));
  const line = (t: TaggedWord, d: DomainTag): string => {
    const w = byId.get(t.wordId);
    return `${w?.surface ?? t.wordId}(${w?.level ?? '?'}) → ${d.domain} [${d.source}:${d.via}]`;
  };
  const strong: string[] = []; const weak: string[] = []; const untagged: string[] = [];
  for (const t of tagged) {
    if (t.domains.length === 0) {
      if (untagged.length < perKind) {
        const w = byId.get(t.wordId);
        untagged.push(`${w?.surface ?? t.wordId}(${w?.level ?? '?'}) 例文=${w?.exampleJa ?? ''}`);
      }
      continue;
    }
    for (const d of t.domains) {
      if (d.confidence === 'strong' && strong.length < perKind) strong.push(line(t, d));
      if (d.confidence === 'weak' && weak.length < perKind) weak.push(line(t, d));
    }
  }
  return { strong, weak, untagged };
};

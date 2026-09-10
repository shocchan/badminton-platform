/**
 * 教材間の接続（2026-09-10 Phase 4 — 文法 ↔ 語彙 ↔ 読解 ↔ 聴解 ↔ 産出 ↔ 分野）。
 *
 * 【目的】
 * 文法だけを孤立させない。「仕事で依頼する」から始めて
 *   分野 → 語彙 → 文法 → 例文 → 読解 → 聴解 → 産出（AI会話ミッション）
 * をIDで辿れるようにする。教材本文は1文字も変えない。既存IDをそのまま使う。
 *
 * 【辺の根拠を必ず残す】
 * 辺は「明示」と「導出」に分ける。
 *   explicit: 教材が自分で持っているリンク（vocabularyLinks・MaterialKnowledge.grammarLinks/vocabularyLinks/domain）
 *   derived : 本文に語・型が実際に出ていることから機械で引いた辺（例文に語が出る／本文に文法の芯が出る）
 * derived は根拠（何が本文のどこに出たか）を via に残し、あとから人が見て外せるようにする。
 * Phase 2-1 の教訓＝**間違った辺を作らない**ほうを取る：語彙は2文字以上かつ漢字を含む語だけ、
 * 文法は芯が3文字以上のときだけ本文照合する（「〜は」「〜に」で何にでも繋がる事故を防ぐ）。
 */
import { parseKnowledgeId, LEVEL_ORDER, isHigherLevel, type KnowledgeLevel } from './knowledgeId';
import { tagWords, type TaggableWord } from './practicalTagger';
import { SITUATION_KEYWORDS, type PracticalDomain, type SituationTag } from './practicalAxis';
import type { MaterialKnowledge } from './materialKnowledge';

/* ────────────────────────────────────────────────────────────
   入力の形（既存の教材の部分集合）
   ──────────────────────────────────────────────────────────── */

export interface GrammarForLinks {
  grammarId: string;
  pattern: string;
  level: string;
  examplesJa?: readonly string[];
  vocabularyLinks?: readonly string[];
  /** 産出（AI会話ミッション）の材料。あれば production 層へ繋がる */
  practice?: { themeJa: string; targetUse: string } | null;
}

export interface VocabForLinks extends TaggableWord {
  wordId: string;
  surface: string;
  level?: string;
}

/** 基礎語彙（fi-）。文法の vocabularyLinks の参照先 */
export interface FoundationForLinks {
  id: string;
  displayForm: string;
  lemma?: string;
}

export interface MaterialForLinks {
  setId: string;
  kind: 'reading' | 'listening';
  level: string;
  /** 本文（読解 passageJa／聴解 transcriptJa） */
  text: string;
  knowledge?: MaterialKnowledge;
}

export type LinkEvidence = 'explicit' | 'derived';

export interface CrossEdge {
  from: string;
  to: string;
  /** どの層からどの層へ */
  layer: 'grammar-vocab' | 'grammar-material' | 'vocab-material' | 'vocab-domain' | 'material-domain' | 'grammar-production';
  evidence: LinkEvidence;
  /** 根拠（本文に出た語・芯、または明示リンク名） */
  via: string;
}

export interface CrossLinkIndex {
  edges: CrossEdge[];
  grammar: Map<string, GrammarForLinks>;
  vocab: Map<string, VocabForLinks>;
  materials: Map<string, MaterialForLinks>;
  /** 項目ID → 隣接（層別） */
  out: Map<string, CrossEdge[]>;
  in: Map<string, CrossEdge[]>;
  /** 分野 → 語彙（strong タグのみ） */
  vocabByDomain: Map<PracticalDomain, string[]>;
  /** 語彙 → 場面 */
  situationsByVocab: Map<string, SituationTag[]>;
}

/* ────────────────────────────────────────────────────────────
   照合の道具
   ──────────────────────────────────────────────────────────── */

const HAS_KANJI = /[一-龥]/;

/** 語彙の本文照合に使える表記か（2文字以上・漢字を含む。かなだけの短い語は何にでも当たる） */
export const linkableSurface = (surface: string): boolean =>
  [...surface].length >= 2 && HAS_KANJI.test(surface);

/** 「〜を余儀なくされる」→ 照合の芯。括弧・波線を落とし、スラッシュの片側ずつ */
export const grammarStems = (pattern: string): string[] =>
  pattern.replace(/（[^）]*）/g, '').split(/[／/]/)
    .map((p) => p.replace(/[〜～\s]/g, '').replace(/\(.*?\)/g, ''))
    .filter((p) => [...p].length >= 3);

/** 芯の前半（半分以上・3文字以上）が本文に出ていれば「出ている」。活用を吸収する */
export const stemAppears = (text: string, stem: string): string | null => {
  const chars = [...stem];
  const min = Math.max(3, Math.ceil(chars.length / 2));
  for (let n = chars.length; n >= min; n -= 1) {
    const head = chars.slice(0, n).join('');
    if (text.includes(head)) return head;
  }
  return null;
};

const levelOf = (s: string | undefined): KnowledgeLevel | null =>
  (s && (LEVEL_ORDER as readonly string[]).includes(s)) ? (s as KnowledgeLevel) : null;

/** 語彙の級が教材の級以下か（N1 の教材に N5 の語が出るのは自然。逆は繋がない） */
const levelWithin = (word: string | undefined, material: string): boolean => {
  const w = levelOf(word); const m = levelOf(material);
  if (!w || !m) return true;
  return !isHigherLevel(w, m);
};

/* ────────────────────────────────────────────────────────────
   索引の構築
   ──────────────────────────────────────────────────────────── */

export interface BuildCrossLinksInput {
  grammar: readonly GrammarForLinks[];
  vocab: readonly VocabForLinks[];
  foundation?: readonly FoundationForLinks[];
  materials: readonly MaterialForLinks[];
}

export const buildCrossLinks = (input: BuildCrossLinksInput): CrossLinkIndex => {
  const edges: CrossEdge[] = [];
  const push = (e: CrossEdge) => edges.push(e);

  const grammar = new Map(input.grammar.map((g) => [g.grammarId, g]));
  const vocab = new Map(input.vocab.map((v) => [v.wordId, v]));
  const materials = new Map(input.materials.map((m) => [m.setId, m]));
  const foundationIds = new Set((input.foundation ?? []).map((f) => f.id));

  // 本文照合に使う語（2文字以上・漢字を含む）。長い語から当てる＝「意味」で「味」を拾わない
  const linkableVocab = input.vocab.filter((v) => linkableSurface(v.surface))
    .sort((a, b) => [...b.surface].length - [...a.surface].length);

  // ── 語彙 → 分野・場面（Practical Axis。strong だけ） ──
  const tagged = tagWords(input.vocab);
  const vocabByDomain = new Map<PracticalDomain, string[]>();
  const situationsByVocab = new Map<string, SituationTag[]>();
  for (const t of tagged) {
    for (const d of t.domains) {
      if (d.confidence !== 'strong') continue;
      push({ from: t.wordId, to: `domain:${d.domain}`, layer: 'vocab-domain', evidence: 'derived', via: `${d.source}:${d.via}` });
      vocabByDomain.set(d.domain, [...(vocabByDomain.get(d.domain) ?? []), t.wordId]);
    }
    if (t.situations.length > 0) situationsByVocab.set(t.wordId, t.situations.map((s) => s.situation));
  }

  // ── 文法 → 語彙 ──
  for (const g of input.grammar) {
    for (const v of g.vocabularyLinks ?? []) {
      if (foundationIds.has(v) || vocab.has(v)) push({ from: g.grammarId, to: v, layer: 'grammar-vocab', evidence: 'explicit', via: 'vocabularyLinks' });
    }
    const examples = (g.examplesJa ?? []).join('\n');
    if (examples) {
      const seen = new Set<string>();
      // 語は例文に**文字どおり出ている**ので級で絞らない（事実の辺）。級で絞るのは文法の芯照合だけ
      for (const v of linkableVocab) {
        if (seen.has(v.wordId)) continue;
        if (examples.includes(v.surface)) {
          seen.add(v.wordId);
          push({ from: g.grammarId, to: v.wordId, layer: 'grammar-vocab', evidence: 'derived', via: `example:${v.surface}` });
        }
      }
    }
    if (g.practice && g.practice.targetUse) {
      push({ from: g.grammarId, to: `production:${g.grammarId}`, layer: 'grammar-production', evidence: 'explicit', via: g.practice.themeJa });
    }
  }

  // ── 教材 → 文法・語彙・分野 ──
  for (const m of input.materials) {
    const k = m.knowledge;
    if (k) {
      for (const gid of k.grammarLinks) if (grammar.has(gid)) push({ from: gid, to: m.setId, layer: 'grammar-material', evidence: 'explicit', via: 'knowledge.grammarLinks' });
      for (const wid of k.vocabularyLinks) if (vocab.has(wid)) push({ from: wid, to: m.setId, layer: 'vocab-material', evidence: 'explicit', via: 'knowledge.vocabularyLinks' });
      push({ from: m.setId, to: `domain:${k.domain}`, layer: 'material-domain', evidence: 'explicit', via: 'knowledge.domain' });
    }
    const explicitG = new Set(k?.grammarLinks ?? []);
    const explicitV = new Set(k?.vocabularyLinks ?? []);
    // 文法の芯が本文に出る（同じ級か下の級の文法だけ。N5 の本文に N1 文法は無い）
    for (const g of input.grammar) {
      if (explicitG.has(g.grammarId) || !levelWithin(g.level, m.level)) continue;
      for (const stem of grammarStems(g.pattern)) {
        const hit = stemAppears(m.text, stem);
        if (hit) { push({ from: g.grammarId, to: m.setId, layer: 'grammar-material', evidence: 'derived', via: `text:${hit}` }); break; }
      }
    }
    // 語彙が本文に出る
    const seen = new Set<string>();
    const domainHits = new Map<PracticalDomain, number>();
    for (const v of linkableVocab) {
      if (explicitV.has(v.wordId) || seen.has(v.wordId)) continue;
      if (m.text.includes(v.surface)) {
        seen.add(v.wordId);
        push({ from: v.wordId, to: m.setId, layer: 'vocab-material', evidence: 'derived', via: `text:${v.surface}` });
        for (const [d, ids] of vocabByDomain) if (ids.includes(v.wordId)) domainHits.set(d, (domainHits.get(d) ?? 0) + 1);
      }
    }
    // 明示の分野が無い教材は、本文に出た語の分野が3語以上そろったときだけ導出で付ける
    if (!k) {
      for (const [d, n] of domainHits) {
        if (n >= 3) push({ from: m.setId, to: `domain:${d}`, layer: 'material-domain', evidence: 'derived', via: `vocab:${n}` });
      }
    }
  }

  const out = new Map<string, CrossEdge[]>(); const inn = new Map<string, CrossEdge[]>();
  for (const e of edges) {
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    inn.set(e.to, [...(inn.get(e.to) ?? []), e]);
  }
  return { edges, grammar, vocab, materials, out, in: inn, vocabByDomain, situationsByVocab };
};

/* ────────────────────────────────────────────────────────────
   辿る
   ──────────────────────────────────────────────────────────── */

const neighboursOf = (idx: CrossLinkIndex, id: string, layer: CrossEdge['layer'], dir: 'out' | 'in'): CrossEdge[] =>
  (dir === 'out' ? idx.out.get(id) : idx.in.get(id))?.filter((e) => e.layer === layer) ?? [];

export interface LearningPathInput {
  domain: PracticalDomain;
  situation?: SituationTag;
  /** 学習者の級。これより上の級の教材は経路に入れない */
  level: KnowledgeLevel;
  /** 各層の上限 */
  limit?: number;
}

export interface LearningPath {
  domain: PracticalDomain;
  situation: SituationTag | null;
  vocab: string[];
  grammar: string[];
  /** 文法の例文のうち、経路の語彙が実際に出ているもの */
  examples: { grammarId: string; exampleJa: string; viaWord: string }[];
  reading: string[];
  listening: string[];
  /** 産出＝AI会話ミッションにできる文法（practice を持つもの） */
  production: { grammarId: string; themeJa: string; targetUse: string }[];
}

const withinLevel = (level: string | undefined, learner: KnowledgeLevel): boolean => {
  const l = levelOf(level);
  return !l || !isHigherLevel(l, learner);
};

/**
 * 「仕事で依頼する」→ 語彙 → 文法 → 例文 → 読解 → 聴解 → 産出。
 * 学習者の級以下の教材だけで組む。空の層は空のまま返す（無いものを在るように見せない）。
 */
export const learningPath = (idx: CrossLinkIndex, input: LearningPathInput): LearningPath => {
  const limit = input.limit ?? 8;
  const vocabAll = (idx.vocabByDomain.get(input.domain) ?? [])
    .filter((w) => withinLevel(idx.vocab.get(w)?.level, input.level))
    .filter((w) => !input.situation || (idx.situationsByVocab.get(w) ?? []).includes(input.situation));
  const vocabIds = vocabAll.slice(0, limit);

  // 語彙 → 文法（例文にその語が出る文法。明示リンクも含む）。
  // 並び: 経路の語が例文に出る数 ＋ 学習者の級に近いほど加点（N2 の人に「〜を」ばかり出さない）
  //       ＋ 場面（依頼・謝罪…）の手がかり語が practice に出ていれば加点
  const grammarScore = new Map<string, number>();
  const situationWords = input.situation ? SITUATION_KEYWORDS[input.situation] : [];
  for (const w of vocabAll) {
    for (const e of neighboursOf(idx, w, 'grammar-vocab', 'in')) {
      const g = idx.grammar.get(e.from);
      if (!g || !withinLevel(g.level, input.level)) continue;
      if (!grammarScore.has(g.grammarId)) {
        const lv = levelOf(g.level);
        const levelBonus = lv ? LEVEL_ORDER.indexOf(lv) * 0.75 : 0;
        const practiceText = `${g.practice?.themeJa ?? ''} ${g.practice?.targetUse ?? ''}`;
        const situationBonus = situationWords.some((k) => practiceText.includes(k)) ? 3 : 0;
        grammarScore.set(g.grammarId, levelBonus + situationBonus);
      }
      grammarScore.set(g.grammarId, (grammarScore.get(g.grammarId) ?? 0) + 1);
    }
  }
  const grammarIds = [...grammarScore.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, limit);

  // 例文：経路の語彙が出ているもの
  const examples: LearningPath['examples'] = [];
  const vocabSet = new Set(vocabAll);
  for (const g of grammarIds) {
    const item = idx.grammar.get(g);
    for (const ex of item?.examplesJa ?? []) {
      const hit = [...vocabSet].map((w) => idx.vocab.get(w)?.surface ?? '').find((s) => s && ex.includes(s));
      if (hit) { examples.push({ grammarId: g, exampleJa: ex, viaWord: hit }); break; }
    }
  }

  // 読解・聴解：分野の教材を優先し、無ければ経路の語彙・文法が出る教材
  const materialScore = new Map<string, number>();
  const bump = (id: string, n: number) => materialScore.set(id, (materialScore.get(id) ?? 0) + n);
  for (const e of idx.in.get(`domain:${input.domain}`) ?? []) if (e.layer === 'material-domain') bump(e.from, 5);
  for (const w of vocabAll) for (const e of neighboursOf(idx, w, 'vocab-material', 'out')) bump(e.to, 1);
  for (const g of grammarIds) for (const e of neighboursOf(idx, g, 'grammar-material', 'out')) bump(e.to, 2);
  const ranked = [...materialScore.entries()]
    .filter(([id]) => withinLevel(idx.materials.get(id)?.level, input.level))
    .sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const reading = ranked.filter((id) => idx.materials.get(id)?.kind === 'reading').slice(0, limit);
  const listening = ranked.filter((id) => idx.materials.get(id)?.kind === 'listening').slice(0, limit);

  const production = grammarIds
    .map((g) => idx.grammar.get(g))
    .filter((g): g is GrammarForLinks => !!g && !!g.practice?.targetUse)
    .map((g) => ({ grammarId: g.grammarId, themeJa: g.practice!.themeJa, targetUse: g.practice!.targetUse }));

  return { domain: input.domain, situation: input.situation ?? null, vocab: vocabIds, grammar: grammarIds, examples, reading, listening, production };
};

/** 1つの文法から辿れるもの（画面の「関連」に出す形） */
export const linksOfGrammar = (idx: CrossLinkIndex, grammarId: string): {
  vocab: string[]; reading: string[]; listening: string[]; domains: PracticalDomain[]; hasProduction: boolean;
} => {
  const vocab = neighboursOf(idx, grammarId, 'grammar-vocab', 'out').map((e) => e.to);
  const mats = neighboursOf(idx, grammarId, 'grammar-material', 'out').map((e) => e.to);
  const domains = new Set<PracticalDomain>();
  for (const w of vocab) for (const e of neighboursOf(idx, w, 'vocab-domain', 'out')) domains.add(e.to.replace('domain:', '') as PracticalDomain);
  return {
    vocab,
    reading: mats.filter((id) => idx.materials.get(id)?.kind === 'reading'),
    listening: mats.filter((id) => idx.materials.get(id)?.kind === 'listening'),
    domains: [...domains],
    hasProduction: neighboursOf(idx, grammarId, 'grammar-production', 'out').length > 0,
  };
};

/* ────────────────────────────────────────────────────────────
   QA
   ──────────────────────────────────────────────────────────── */

export interface CrossLinkCoverage {
  grammar: number;
  grammarWithVocab: number;
  grammarWithMaterial: number;
  grammarWithProduction: number;
  /** 語彙にも教材にも繋がっていない文法 */
  isolatedGrammar: string[];
  vocab: number;
  vocabWithMaterial: number;
  materials: number;
  materialsWithAnyLink: number;
  materialsWithDomain: number;
  edges: { explicit: number; derived: number };
  /** 分野ごとに、語彙・文法・読解・聴解・産出の全層へ届くか */
  domainsComplete: PracticalDomain[];
}

export const crossLinkCoverage = (idx: CrossLinkIndex, domains: readonly PracticalDomain[], level: KnowledgeLevel = 'N1'): CrossLinkCoverage => {
  const has = (id: string, layer: CrossEdge['layer'], dir: 'out' | 'in') => neighboursOf(idx, id, layer, dir).length > 0;
  const gIds = [...idx.grammar.keys()];
  const isolatedGrammar = gIds.filter((g) => !has(g, 'grammar-vocab', 'out') && !has(g, 'grammar-material', 'out'));
  const mIds = [...idx.materials.keys()];
  const domainsComplete = domains.filter((d) => {
    const p = learningPath(idx, { domain: d, level });
    return p.vocab.length > 0 && p.grammar.length > 0 && p.reading.length > 0 && p.listening.length > 0 && p.production.length > 0;
  });
  return {
    grammar: gIds.length,
    grammarWithVocab: gIds.filter((g) => has(g, 'grammar-vocab', 'out')).length,
    grammarWithMaterial: gIds.filter((g) => has(g, 'grammar-material', 'out')).length,
    grammarWithProduction: gIds.filter((g) => has(g, 'grammar-production', 'out')).length,
    isolatedGrammar,
    vocab: idx.vocab.size,
    vocabWithMaterial: [...idx.vocab.keys()].filter((w) => has(w, 'vocab-material', 'out')).length,
    materials: mIds.length,
    materialsWithAnyLink: mIds.filter((m) => has(m, 'grammar-material', 'in') || has(m, 'vocab-material', 'in')).length,
    materialsWithDomain: mIds.filter((m) => has(m, 'material-domain', 'out')).length,
    edges: {
      explicit: idx.edges.filter((e) => e.evidence === 'explicit').length,
      derived: idx.edges.filter((e) => e.evidence === 'derived').length,
    },
    domainsComplete,
  };
};

/** parseKnowledgeId が読めない ID が混ざっていないか（孤立・異物の検出） */
export const unknownIds = (idx: CrossLinkIndex): string[] =>
  [...idx.grammar.keys(), ...idx.vocab.keys()].filter((id) => !parseKnowledgeId(id));

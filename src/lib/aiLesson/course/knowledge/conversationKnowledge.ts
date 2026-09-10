/**
 * AI会話 × 知識項目（2026-09-10 Phase 6）。
 *
 * 【方針（変えない）】
 *   ・AI会話は毎日の主教材ではない。今日の冒険には出さない／「ほかの学習を見る」から任意選択／全員 週3回。
 *   ・ここでは会話の**結果を知識項目へ戻す**接続だけを作る。会話 runtime・回数制限・課金は触らない。
 *
 * 【何を残すか】
 * 会話ログ全文は知識グラフへ保存しない。学習に必要な **structured result** だけ:
 *   missionId → grammarId（どの知識項目を使う会話だったか）
 *   outcome   → used_self（自分で使えた）／used_with_hint（お手本の直後）／incorrect（使ったが直された）
 *               ／avoided（最後まで使わなかった）／incomplete（途中で終わった）
 *   retryTarget → 言い直し（production）へ回すべきか
 *
 * 【missionId → grammarId】
 * 会話コースの90ミッション（w01m1…）は targetExpression（〜ようになりました）を持つ。
 * Phase 2-2 の Alias 層で既存の文法IDへ解決する。機械で決められないものは MANUAL に人が書く。
 * 「総合」ミッション（複数の表現）は1つの項目に繋がないので null。
 */
import { buildAliasIndex, resolveAlias, type AliasIndex } from './aliasLayer';
import { parseKnowledgeId } from './knowledgeId';
import type { KnowledgeEvent } from './learnerKnowledgeState';

export interface MissionLike {
  id: string;
  targetExpression: string;
  /** 検出用の正規表現ソース */
  detect?: string;
}

/**
 * 機械で決められなかったミッション → 文法ID（人が読んで決めた）。
 * 総合（w0Xm5）と、表現が文法項目でないもの（もう一度お願いします・いつも／よく）は入れない。
 */
export const MANUAL_MISSION_GRAMMAR: Record<string, string> = {
  'w01m2': 'n5g-teimasu-state',          // 〜に住んでいます（状態）
  'w01m3': 'n5g-teimasu-state',          // 〜をしています（職業＝状態）
  'w01m4': 'n5g-gasuki-jouzu',
  'w02m2': 'n4g-toki',
  'w02m4': 'n4g-tabakaridesu',
  'w03m1': 'n4g-youninarimasu',
  'w03m2': 'n5g-kunarimasu-ninarimasu',  // 〜なくなりました＝ない＋くなる
  'w03m3': 'n5g-ga-kedo',                // 以前は〜でしたが（前置き）
  'w03m4': 'n4g-teikimasu-tekimasu',     // だんだん〜てきました
  'w04m1': 'n4g-kotonishimasu',
  'w04m4': 'n4g-hajimeru-owaru-tsuzukeru',
  'w05m1': 'n5g-temo-ii',
  'w05m2': 'n4g-temorau',
  'w05m4': 'n4g-tehoshii',
  'w06m1': 'n4g-teshimaimasu',
  'w06m3': 'n4g-ba',                     // どうすればいいですか
  'w06m4': 'n4g-tahougaii',
  'w07m2': 'n5g-kara-riyuu',
  'w07m3': 'n4g-node',
  'w07m4': 'n4g-baaiwa',
  'w08m2': 'n2g-149',                    // 〜ほど〜ない
  'w08m4': 'n3g-nikurabete',
  'w09m1': 'n4g-kamoshiremasen',
  'w09m2': 'n4g-soudesu-youtai',         // 推測の週＝様態（雨が降りそうです）
  'w09m3': 'n4g-youdesu',
  'w10m1': 'n4g-kotoninarimasu',
  'w11m1': 'n5g-mashou-masenka',
  'w11m2': 'n5g-temo-ii',                // 〜ても大丈夫ですか
  'w11m4': 'n4g-tahougaii',
  'w13m1': 'n4g-sonkeigo-tokubetsu',
  'w13m2': 'n4g-kenjougo-osuru',
  'w13m4': 'n4g-kenjougo-tokubetsu',
  'w14m2': 'n1g-049',
  'w14m3': 'n2g-087',                    // 〜というより
  'w14m4': 'n2g-170',                    // 〜わけではない
  'w15m1': 'n3g-toiunoha',
  'w16m1': 'n3g-gasuru',                 // 〜ような気がします
  'w16m2': 'n2g-028',
  'w17m2': 'n1g-110',
  'w17m3': 'n4g-teorimasu',
  'w17m4': 'n4g-deshou',
  'w18m2': 'n1g-107',
};

/**
 * 文法項目に当たらない（＝繋がなくて正しい）ミッション。
 * 語（いつも／よく）・定型句（もう一度お願いします・恐れ入りますが）・談話の型（経緯の説明）。
 */
export const NON_GRAMMAR_MISSIONS: ReadonlySet<string> = new Set([
  'w01m1', 'w04m3', 'w06m2', 'w08m3', 'w10m4', 'w11m3', 'w13m3', 'w14m1', 'w15m2', 'w15m3', 'w15m4',
  'w16m3', 'w16m4', 'w17m1', 'w18m1', 'w18m3', 'w18m4',
]);

export type MissionGrammarSource = 'manual' | 'exact' | 'variant' | 'partial';

export interface MissionGrammarLink {
  missionId: string;
  grammarId: string;
  source: MissionGrammarSource;
}

const isIntegrated = (m: MissionLike): boolean =>
  /（総合）|総合|＋/.test(m.targetExpression) || (m.detect ?? '').split('|').length >= 4 && /総合|＋/.test(m.targetExpression);

/**
 * ミッション → 文法ID。
 * 順: MANUAL → Alias（exact/variant） → 部分一致。決められなければ繋がない。
 */
export const buildMissionGrammarMap = (
  missions: readonly MissionLike[],
  grammar: readonly { grammarId: string; pattern?: string }[],
  index?: AliasIndex,
): { map: Map<string, MissionGrammarLink>; unresolved: MissionLike[] } => {
  const idx = index ?? buildAliasIndex(grammar);
  const known = new Set(grammar.map((g) => g.grammarId));
  const map = new Map<string, MissionGrammarLink>();
  const unresolved: MissionLike[] = [];
  for (const m of missions) {
    if (isIntegrated(m) || NON_GRAMMAR_MISSIONS.has(m.id)) continue;
    const manual = MANUAL_MISSION_GRAMMAR[m.id];
    if (manual && known.has(manual)) { map.set(m.id, { missionId: m.id, grammarId: manual, source: 'manual' }); continue; }
    const r = resolveAlias(idx, m.targetExpression);
    if (r.kind === 'exact' || r.kind === 'variant') { map.set(m.id, { missionId: m.id, grammarId: r.id, source: r.kind }); continue; }
    /**
     * 部分一致は使わない。索引に「〜ます」「〜い」のような短い芯があり、
     * 「〜かもしれません」が「〜ます／〜ません」に当たる（実測）。人が MANUAL に書く
     */
    unresolved.push(m);
  }
  return { map, unresolved };
};

/* ────────────────────────────────────────────────────────────
   会話の結果（structured result）
   ──────────────────────────────────────────────────────────── */

export type ConversationOutcome = 'used_self' | 'used_with_hint' | 'incorrect' | 'avoided' | 'incomplete';

export interface ConversationSessionLike {
  id: string;
  missionId: string;
  startedAt: string;
  completionStatus: string;
  targetUsed?: boolean;
  targetUsedIndependently?: boolean;
  report?: { targetUsage?: 'self' | 'hint' | 'none'; corrections?: { original: string; improved: string }[] } | null;
}

export interface StructuredConversationResult {
  sessionId: string;
  missionId: string;
  /** 繋がった知識項目。総合・未解決は null */
  grammarId: string | null;
  outcome: ConversationOutcome;
  correctionsCount: number;
  /** 言い直し（production）へ回すべきか＝使ったが直された／使えなかった */
  retryTarget: boolean;
}

/**
 * 1セッションの結果。誇張しない:
 *   used_self は「自分で使えた」（report.targetUsage=self か targetUsedIndependently）だけ。
 *   incorrect は「使ったが、その発話が直しの対象になった」（detect が直された原文に当たる）。
 */
export const conversationOutcome = (s: ConversationSessionLike, detectSource?: string): ConversationOutcome => {
  if (s.completionStatus !== 'completed') return 'incomplete';
  const usage = s.report?.targetUsage ?? (s.targetUsedIndependently ? 'self' : s.targetUsed ? 'hint' : 'none');
  if (usage === 'none') return 'avoided';
  if (detectSource) {
    try {
      const re = new RegExp(detectSource);
      if ((s.report?.corrections ?? []).some((c) => re.test(c.original))) return 'incorrect';
    } catch { /* 壊れた正規表現は無視（判定しない） */ }
  }
  return usage === 'self' ? 'used_self' : 'used_with_hint';
};

/** セッションの missionId → grammarId。advconv-<grammarId>（文法 practice の会話）と、会話コースの対応表の両方 */
export const grammarIdOfMission = (missionId: string, missionGrammar?: ReadonlyMap<string, MissionGrammarLink | string>): string | null => {
  const m = /^advconv-(.+)$/.exec(missionId);
  if (m && parseKnowledgeId(m[1])?.kind === 'grammar') return m[1];
  const biz = /^bizconv-.+:(.+)$/.exec(missionId);
  if (biz && parseKnowledgeId(biz[1])?.kind === 'grammar') return biz[1];
  const hit = missionGrammar?.get(missionId);
  if (!hit) return null;
  return typeof hit === 'string' ? hit : hit.grammarId;
};

export const structuredConversationResults = (
  sessions: readonly ConversationSessionLike[],
  missionGrammar?: ReadonlyMap<string, MissionGrammarLink | string>,
  detectOf?: (missionId: string) => string | undefined,
): StructuredConversationResult[] =>
  sessions.map((s) => {
    const outcome = conversationOutcome(s, detectOf?.(s.missionId));
    return {
      sessionId: s.id, missionId: s.missionId,
      grammarId: grammarIdOfMission(s.missionId, missionGrammar),
      outcome,
      correctionsCount: s.report?.corrections?.length ?? 0,
      retryTarget: outcome === 'incorrect' || outcome === 'avoided',
    };
  });

/** structured result → 知識項目の出来事（conversation 経路）。項目に繋がらないもの・途中終了は出さない */
export const conversationEvents = (
  results: readonly StructuredConversationResult[],
  sessions: readonly ConversationSessionLike[],
  dateKeyOf: (iso: string) => string,
): KnowledgeEvent[] => {
  const at = new Map(sessions.map((s) => [s.id, s.startedAt]));
  const out: KnowledgeEvent[] = [];
  for (const r of results) {
    if (!r.grammarId || r.outcome === 'incomplete') continue;
    const iso = at.get(r.sessionId) ?? '';
    out.push({
      at: iso, dateKey: dateKeyOf(iso), itemId: r.grammarId, channel: 'conversation', kind: 'conversation',
      ok: r.outcome === 'used_self', source: `session:${r.sessionId}:${r.outcome}`,
    });
  }
  return out;
};

/** 会話のあと、言い直しへ回す文法（使ったが直された／使えなかった）。新しい順・重複なし */
export const retryTargetsAfterConversation = (results: readonly StructuredConversationResult[]): string[] => {
  const out: string[] = [];
  for (const r of [...results].reverse()) if (r.retryTarget && r.grammarId && !out.includes(r.grammarId)) out.push(r.grammarId);
  return out;
};

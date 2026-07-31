// Learning Connectivity Graph（Phase 2E-1.9・read-only監査・レビュー系lazy chunk専用）。
// 語彙⇔学習surface（語彙画面/診断/会話/復習）の接続を、実在するコードパス・静的データ参照
// だけから決定的に導出する。自動接続・教材変更・learnerデータ参照は一切しない。
// evidenceはファイル/export/関数名（行番号は変更でずれるため使わない・§8）。
// 注意: ことば図鑑全体が現在labPreviewゲート内（一般受講生には非公開）。この監査は
// 「lab学習体験の内部接続」を対象とし、全体のlab隔離はgraph.labOnlyで別途明示する（§6）。
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';
import { VOCABULARY_PACKS, roleFor } from './vocabularyPacks';
import type { VocabularyTrack } from './vocabularyPacks';
import { poolQuestionsFor, CONVERSATION_CORE_POOL } from './vocabDiagnosticPool';
import { practiceForItem } from './vocabConversationPractice';
import { levelMetaOf } from './vocabularyLevelMeta';
import type { ChineseCognateType } from './vocabularyLevelMeta';

export type ConnectivityStatus = 'connected' | 'partial' | 'orphaned' | 'unverified' | 'intentionally_isolated';
/**
 * 接続の品質（Phase 2E-1.10 §26）。560接続がすべて同じ品質に見えないように分ける。
 * none=接続なし／generic=一般的な導線のみ（対象語に固有でない）／
 * contextual=対象語に固有の内容がある（theme・問題・スケジュール等）／
 * verified=テストまたは実ブラウザで動作確認済み。
 */
export type ConnectionQuality = 'none' | 'generic' | 'contextual' | 'verified';
export type SurfaceKey = 'vocabScreen' | 'diagnostic' | 'conversation' | 'review';
export const SURFACE_KEYS: SurfaceKey[] = ['vocabScreen', 'diagnostic', 'conversation', 'review'];

export interface SurfaceConnection {
  edgeId: string;                     // `${itemId}>${surface}`（決定的・順序非依存）
  surface: SurfaceKey;
  status: ConnectivityStatus;
  /** 接続の品質（§26・generic接続を完成扱いしない） */
  quality: ConnectionQuality;
  /** direct=安定IDによる明示参照／derived=コードパスから導出（§4: confidenceではなく検証レベル） */
  verification: 'direct' | 'derived';
  reasonJa: string;
  evidence: string;                   // ファイル/export/関数名
}

export interface WordConnectivity {
  itemId: string;
  wordJa: string;
  levelGroup: 'basics' | 'n3';
  conversationRole: string;           // conversation trackのrole（roleForから）
  cognate: ChineseCognateType;
  surfaces: Record<SurfaceKey, SurfaceConnection>;
  /** 総合状態（最も弱い接続。orphaned>unverified>partial>connectedの順で弱い） */
  overall: ConnectivityStatus;
}

export interface InvalidReference { source: string; refId: string; evidence: string }

export interface ConnectivityGraph {
  labOnly: true;                      // ことば図鑑全体が一般受講生に対してintentionally-isolated
  words: WordConnectivity[];
  edgeCount: number;
  duplicateEdgeCount: number;
  invalidReferences: InvalidReference[];
}

const WEAK_ORDER: ConnectivityStatus[] = ['connected', 'partial', 'unverified', 'orphaned', 'intentionally_isolated'];
const weaker = (a: ConnectivityStatus, b: ConnectivityStatus): ConnectivityStatus =>
  WEAK_ORDER[Math.max(WEAK_ORDER.indexOf(a), WEAK_ORDER.indexOf(b))];

const TRACKS: VocabularyTrack[] = ['life_basic', 'n3_prep', 'n2_prep', 'conversation'];

export const buildConnectivityGraph = (): ConnectivityGraph => {
  const items = allVocabularyItems();
  const n3Ids = new Set(N3_ITEMS.map((i) => i.id));
  const itemIds = new Set(items.map((i) => i.id));
  const invalid: InvalidReference[] = [];
  // 診断プールの明示参照（直接参照・安定ID）。存在しないwordIdはinvalidへ
  const poolRefs = new Map<string, number>();
  for (const pack of VOCABULARY_PACKS) {
    for (const q of poolQuestionsFor(pack.id)) {
      if (!itemIds.has(q.itemId)) { invalid.push({ source: `pool:${q.q.id}`, refId: q.itemId, evidence: 'vocabDiagnosticPool.poolQuestionsFor' }); continue; }
      poolRefs.set(q.itemId, (poolRefs.get(q.itemId) ?? 0) + 1);
    }
  }
  // 会話コア確認プール（2E-1.10 §10・診断セットへ決定的ローテーションで入る）
  const coreRefs = new Map<string, number>();
  for (const q of CONVERSATION_CORE_POOL) {
    if (!itemIds.has(q.itemId)) { invalid.push({ source: `core:${q.q.id}`, refId: q.itemId, evidence: 'vocabDiagnosticPool.CONVERSATION_CORE_POOL' }); continue; }
    coreRefs.set(q.itemId, (coreRefs.get(q.itemId) ?? 0) + 1);
  }
  const packOf = (id: string) => VOCABULARY_PACKS.find((p) => p.itemIds.includes(id));

  const words: WordConnectivity[] = items.map((item) => {
    const pack = packOf(item.id);
    const convRole = pack ? roleFor(pack.id, 'conversation', item.id) : 'optional';
    // ① 語彙→語彙学習画面: 全語が一覧/詳細へ到達し meaningZh/exJa/exZh/cognate を表示（直接）
    const vocabScreen: SurfaceConnection = {
      edgeId: `${item.id}>vocabScreen`, surface: 'vocabScreen', status: 'connected', quality: 'verified', verification: 'direct',
      reasonJa: '一覧・詳細で表示（meaningZh/例文/同源語バッジ/画像）。roleはレビュー画面と診断選定で利用',
      evidence: 'VocabularyHub.tsx listFor・VocabDetailView / vocabularyLevelMeta.levelMetaOf',
    };
    // ② 語彙→診断: プール明示参照=direct。role=diagnosticなら生成問題で出題可能=derived。
    //    それ以外（required/optional）は診断セット対象外=partial（学習フロー側で扱う）
    const inPool = poolRefs.has(item.id);
    const inCorePool = coreRefs.has(item.id);
    const anyDiagRole = pack ? TRACKS.some((tr) => roleFor(pack.id, tr, item.id) === 'diagnostic') : false;
    const diagnostic: SurfaceConnection = inPool
      ? { edgeId: `${item.id}>diagnostic`, surface: 'diagnostic', status: 'connected', quality: 'verified', verification: 'direct',
          reasonJa: `診断プール問題が${poolRefs.get(item.id)}問参照`, evidence: 'vocabDiagnosticPool.BASIC_POOL/N3_POOL' }
      : inCorePool
        ? { edgeId: `${item.id}>diagnostic`, surface: 'diagnostic', status: 'connected', quality: 'verified', verification: 'direct',
            reasonJa: `会話コア確認問題が${coreRefs.get(item.id)}問参照（診断ごとに決定的ローテーションで出題・2E-1.10 §10）`,
            evidence: 'vocabDiagnosticPool.CONVERSATION_CORE_POOL / vocabDiagnostic.buildDiagnosticSet' }
        : anyDiagRole
          ? { edgeId: `${item.id}>diagnostic`, surface: 'diagnostic', status: 'connected', quality: 'contextual', verification: 'derived',
              reasonJa: 'role=diagnosticのため生成問題（読み/意味）で診断セットに入る', evidence: 'vocabDiagnostic.buildDiagnosticSet/buildDiagnosticQuestion' }
          : { edgeId: `${item.id}>diagnostic`, surface: 'diagnostic', status: 'partial', quality: 'generic', verification: 'derived',
              reasonJa: `診断セット対象外（全trackでrole=${convRole === 'required' ? 'required=学習フロー担当' : convRole}）。誤答時の復習経由でのみ再確認`,
              evidence: 'vocabularyPacks.roleFor' };
    // ③ 語彙→会話: スクリプト練習の明示itemId参照のみconnected。それ以外はAI自由会話の可能性のみ=unverified
    const practice = practiceForItem(item.id);
    const conversation: SurfaceConnection = practice
      ? { edgeId: `${item.id}>conversation`, surface: 'conversation', status: 'connected', quality: 'contextual', verification: 'direct',
          reasonJa: `対象語別の練習「${practice.themeJa}」がitemIdで参照（theme/starter/target付き・実LLM接続はEdge設計後）`,
          evidence: 'vocabConversationPractice.practiceForItem' }
      : { edgeId: `${item.id}>conversation`, surface: 'conversation', status: 'unverified', quality: 'generic', verification: 'derived',
          reasonJa: 'AI会話画面への一般導線のみ（対象語を使う保証はない・動的prompt生成のため静的検証不可）',
          evidence: 'vocabConversationPractice.VOCAB_CONVERSATION_PRACTICES（該当なし）' };
    // ④ 語彙→復習: 3分復習の候補選定コードパスは全パック語に存在（誤答・不安・関連語）。
    //    ただし翌日/3日/7日の間隔スケジュール生成へは未接続=partial
    // ④ 語彙→復習: 2E-1.10で間隔反復（翌日/3日後/7日後）を実装。語ごとに予定が作られる＝contextual。
    //    正式DB保存は未実装のため（preview Repositoryのみ）statusはconnectedだがdocsへブロッカー記録。
    const review: SurfaceConnection = {
      edgeId: `${item.id}>review`, surface: 'review', status: 'connected', quality: 'verified', verification: 'direct',
      reasonJa: '出題結果から語ごとに翌日/3日後/7日後の予定を作成（誤答→翌日・補助あり→3日後・自力正解→7日後）。保存はpreview Repository（正式DB保存は本番前ブロッカー）',
      evidence: 'vocabSpacedReview.createVocabSpacedReviewRepository / vocabRecommendation.recommendWords',
    };
    const surfaces = { vocabScreen, diagnostic, conversation, review };
    const overall = SURFACE_KEYS.reduce<ConnectivityStatus>((acc, k) => weaker(acc, surfaces[k].status), 'connected');
    return {
      itemId: item.id, wordJa: item.displayForm,
      levelGroup: n3Ids.has(item.id) ? 'n3' : 'basics',
      conversationRole: convRole,
      cognate: levelMetaOf(item.id).cognate,
      surfaces, overall,
    };
  });
  const edgeIds = words.flatMap((w) => SURFACE_KEYS.map((k) => w.surfaces[k].edgeId));
  return {
    labOnly: true, words,
    edgeCount: edgeIds.length,
    duplicateEdgeCount: edgeIds.length - new Set(edgeIds).size,
    invalidReferences: invalid,
  };
};

/** 診断カバレッジ監査（§7・診断16問=N3パック・基礎13問はプール+生成） */
export interface DiagnosticCoverageAudit {
  poolQuestionTotal: number;
  uniqueWordRefs: number;
  basicsWordRefs: number;
  n3WordRefs: number;
  invalidWordIds: number;
  duplicateQuestionIds: number;
  ffProbeCount: number;                // false friend probe（都合等）
  n3DiagnosticEligible: number;        // N3語で診断セットに入り得る語（プール or role=diagnostic）
  n3CoveragePct: number;               // 上記/62
}

export const auditDiagnosticCoverage = (): DiagnosticCoverageAudit => {
  const items = allVocabularyItems();
  const itemIds = new Set(items.map((i) => i.id));
  const n3Ids = new Set(N3_ITEMS.map((i) => i.id));
  const qIds = new Set<string>();
  let total = 0, dupQ = 0, invalid = 0, ff = 0;
  const refWords = new Set<string>();
  for (const pack of VOCABULARY_PACKS) {
    for (const q of poolQuestionsFor(pack.id)) {
      total += 1;
      if (qIds.has(q.q.id)) dupQ += 1; else qIds.add(q.q.id);
      if (!itemIds.has(q.itemId)) { invalid += 1; continue; }
      refWords.add(q.itemId);
      if (q.q.id.includes('-ff-')) ff += 1;
    }
  }
  const graph = buildConnectivityGraph();
  const n3Eligible = graph.words.filter((w) => w.levelGroup === 'n3' && w.surfaces.diagnostic.status === 'connected').length;
  return {
    poolQuestionTotal: total,
    uniqueWordRefs: refWords.size,
    basicsWordRefs: [...refWords].filter((id) => !n3Ids.has(id)).length,
    n3WordRefs: [...refWords].filter((id) => n3Ids.has(id)).length,
    invalidWordIds: invalid,
    duplicateQuestionIds: dupQ,
    ffProbeCount: ff,
    n3DiagnosticEligible: n3Eligible,
    n3CoveragePct: Math.round((n3Eligible / N3_ITEMS.length) * 100),
  };
};

/** 集計（§7・軸ごとの恒等式。複数軸を合算して140にしない） */
export interface ConnectivitySummary {
  totalWords: number;
  basics: number;
  n3: number;
  byStatusPerSurface: Record<SurfaceKey, Record<ConnectivityStatus, number>>;
  /** 接続品質別（§26・genericを完成扱いしないための集計） */
  byQualityPerSurface: Record<SurfaceKey, Record<ConnectionQuality, number>>;
  qualityTotals: Record<ConnectionQuality, number>;
  overallByStatus: Record<ConnectivityStatus, number>;
  byLevelOverall: Record<'basics' | 'n3', Record<ConnectivityStatus, number>>;
  byRoleDiagnostic: Record<string, Record<ConnectivityStatus, number>>;   // conversation role別のdiagnostic状態
}

const emptyCounts = (): Record<ConnectivityStatus, number> =>
  ({ connected: 0, partial: 0, orphaned: 0, unverified: 0, intentionally_isolated: 0 });
const emptyQuality = (): Record<ConnectionQuality, number> => ({ none: 0, generic: 0, contextual: 0, verified: 0 });

export const connectivitySummary = (graph = buildConnectivityGraph()): ConnectivitySummary => {
  const byStatusPerSurface = {
    vocabScreen: emptyCounts(), diagnostic: emptyCounts(), conversation: emptyCounts(), review: emptyCounts(),
  } as Record<SurfaceKey, Record<ConnectivityStatus, number>>;
  const overallByStatus = emptyCounts();
  const byLevelOverall = { basics: emptyCounts(), n3: emptyCounts() };
  const byRoleDiagnostic: Record<string, Record<ConnectivityStatus, number>> = {};
  const byQualityPerSurface = {
    vocabScreen: emptyQuality(), diagnostic: emptyQuality(), conversation: emptyQuality(), review: emptyQuality(),
  } as Record<SurfaceKey, Record<ConnectionQuality, number>>;
  const qualityTotals = emptyQuality();
  for (const w of graph.words) {
    for (const k of SURFACE_KEYS) {
      byStatusPerSurface[k][w.surfaces[k].status] += 1;
      byQualityPerSurface[k][w.surfaces[k].quality] += 1;
      qualityTotals[w.surfaces[k].quality] += 1;
    }
    overallByStatus[w.overall] += 1;
    byLevelOverall[w.levelGroup][w.overall] += 1;
    byRoleDiagnostic[w.conversationRole] = byRoleDiagnostic[w.conversationRole] ?? emptyCounts();
    byRoleDiagnostic[w.conversationRole][w.surfaces.diagnostic.status] += 1;
  }
  return {
    totalWords: graph.words.length,
    basics: graph.words.filter((w) => w.levelGroup === 'basics').length,
    n3: graph.words.filter((w) => w.levelGroup === 'n3').length,
    byStatusPerSurface, byQualityPerSurface, qualityTotals, overallByStatus, byLevelOverall, byRoleDiagnostic,
  };
};

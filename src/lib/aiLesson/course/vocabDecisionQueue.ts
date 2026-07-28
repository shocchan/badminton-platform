// Human Decision Queue（Phase 2E-1.7/2E-1.8・レビュー画面lazy chunk専用）。
// 人間判断待ちを「判断事項単位」で決定的に導出する（語単位で潰さない・§2）。
// ここで作るのは表示用の派生データのみ。教材本体への書き込み・自動確定は一切しない。
// 2E-1.8: provenance（由来）・独立/継承priorityの区別・導出の完全性監査を追加。
// decisionPriorityの意味は変えない（語単位priorityの継承を明示するだけ・§3.1）。
import { buildVocabularyReviewRecords } from './vocabularyReview';
import { CHATGPT_REVIEWS } from './vocabChatgptReview';
import { buildReviewComparisons } from './vocabDualReview';
import type { HumanReviewPriority, ExternalVocabularyReview } from './vocabDualReview';
import { DECISION_DATASET_VERSION } from './vocabDecisionStore';
import { isCeoDecidedField } from './vocabFieldReviewDecisions';

export type DecisionType = 'example' | 'cognate' | 'meaning_zh' | 'role' | 'sense';

/** 由来情報（§4・既存データから導出できるものだけ。推測で生成しない） */
export interface DecisionProvenance {
  sourceReview: 'chatgpt' | 'claude';
  sourceField: string;
  sourceConfidence: string;
  /** 語単位priority（buildReviewComparisonsの導出値） */
  sourcePriority: HumanReviewPriority;
  /** この判断事項単独で導いた場合のpriority（表示用参考値） */
  independentPriority: HumanReviewPriority;
  /** decisionPriorityが語単位priorityの継承か（単独では達しない場合true・§3.1） */
  priorityInheritedFromWord: boolean;
  derivationRule: string;
  datasetVersion: string;
}

/**
 * リリース影響の分類（Phase 2E-1.10 §18）。
 * 91件すべてをリリースブロッカーにしない。ただしP0/P1は後回しにしない。
 */
export type ReleaseClass = 'release_blocker' | 'before_beta_recommended' | 'can_defer';

/**
 * 重大度の由来（§19）。同じ根本問題が複数P0に見える誤解を防ぐ。
 * local=この判断事項自体が重大／inherited=同じ語の別の重大問題を継承。
 */
export type SeveritySource = 'local' | 'inherited';

export interface HumanDecisionItem {
  decisionId: string;               // `${itemId}:${decisionType}`（決定的・元データ順序に依存しない）
  itemId: string;
  wordJa: string;
  decisionType: DecisionType;
  priority: HumanReviewPriority;    // 語単位priority（従来どおり・意味を変えない）
  /** 現在の教材値（人が読める短い表現） */
  currentValueJa: string;
  /** 提案値（採用は人間のみ。AI多数決で確定しない） */
  proposedValueJa: string;
  proposalSource: 'claude' | 'chatgpt' | 'both';
  reasonJa: string;
  impactAreas: string[];            // 現在接続済みの影響範囲
  impactFutureAreas: string[];      // 将来影響候補（現在は未接続・断定しない・§7）
  provenance: DecisionProvenance;
  /** この判断事項自体の重大度（§19・語からの継承を含まない） */
  localSeverity: HumanReviewPriority;
  /** 語単位で継承した重大度（§19・表示上は「関連する語の重大問題」） */
  inheritedSeverity: HumanReviewPriority;
  /** 実効重大度（local と inherited の重い方＝従来のpriorityと同値） */
  effectiveSeverity: HumanReviewPriority;
  severitySource: SeveritySource;
  /** 同じ根本問題をまとめる単位（§19・Release Gateで重複カウントしない） */
  rootIssueId: string;
  /** リリース影響の分類（§18） */
  releaseClass: ReleaseClass;
}

const P_ORDER: Record<HumanReviewPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * 判断事項単独でのpriority参考値（§3.1・表示用）。
 * 語単位priorityの導出規則（priorityOf）をそのtypeの該当フィールドに限定して適用した近似。
 * decisionPriority自体はこの値で上書きしない（人間判断なしに優先度の意味を変えない）。
 */
const independentPriorityOf = (
  type: DecisionType, g: ExternalVocabularyReview | null, cognateCurrent?: string,
): HumanReviewPriority => {
  switch (type) {
    case 'example':
      return g && (g.japaneseStatus === 'major_issue' || g.furiganaStatus === 'major_issue') ? 'P0' : 'P2';
    case 'meaning_zh':
      return g?.chineseStatus === 'major_issue' ? 'P1' : 'P3';
    case 'cognate':
      // CEO決定のseverity原則（2026-07-28）:
      //   unreviewed＝学習者へ断定表示せず・false friend診断にも推薦にも使っていない → P2
      //   確定済み分類が誤りの疑い＝既に画面・診断で利用中の誤情報の可能性 → P1
      return cognateCurrent === 'unreviewed' ? 'P2' : 'P1';
    case 'role':
      return 'P2';
    case 'sense':
      return 'P2';
  }
};

const provenanceOf = (
  type: DecisionType, g: ExternalVocabularyReview | null, wordPriority: HumanReviewPriority,
  sourceField: string, derivationRule: string, sourceReview: 'chatgpt' | 'claude' = 'chatgpt',
  cognateCurrent?: string,
): DecisionProvenance => {
  const independent = independentPriorityOf(type, g, cognateCurrent);
  return {
    sourceReview, sourceField,
    sourceConfidence: g?.confidence ?? 'n/a',
    sourcePriority: wordPriority,
    independentPriority: independent,
    priorityInheritedFromWord: P_ORDER[wordPriority] < P_ORDER[independent],
    derivationRule, datasetVersion: DECISION_DATASET_VERSION,
  };
};

/** 導出の完全性監査（§2.3・labPreview/テスト用。learner向けUIへは出さない） */
export interface DecisionQueueAudit {
  sourceCandidates: number;
  /**
   * レビュー対象に選定した件数（§20の用語修正）。
   * 「教材へ採用済み」「公開承認済み」ではない。判断キューに載せた＝人間の判断待ち、という意味。
   */
  queuedForReview: number;
  /** 提案が既に教材へ反映済み（現在値と一致）で判断不要 */
  excludedAlreadyApplied: number;
  excludedNotApplicable: number;    // 導出条件を満たさず対象外（例: roleが既にoptional以外）
  /** CEOがfield単位で判断済み（vocabFieldReviewDecisions）。再度キューへ出さない */
  excludedCeoDecided: number;
  duplicates: number;               // 重複decisionId（常に0であるべき）
  byType: Record<DecisionType, { candidates: number; queuedForReview: number; excludedAlreadyApplied: number; excludedNotApplicable: number; excludedCeoDecided: number }>;
}

interface BuildResult { queue: HumanDecisionItem[]; audit: DecisionQueueAudit }

/** 導出途中の形（重大度分離・リリース分類を付ける前） */
type DraftDecisionItem = Omit<HumanDecisionItem,
  'localSeverity' | 'inheritedSeverity' | 'effectiveSeverity' | 'severitySource' | 'rootIssueId' | 'releaseClass'>;

/**
 * リリース影響の分類（§18）。
 * blocker=学習が成立しない/重大な誤りが学習者に出る（読み・意味・例文の重大誤り、P0/P1相当）。
 * before_beta=品質として直したいが学習は成立する（中国語の自然さ・ふりがな粒度・role判断・画像品質）。
 * can_defer=表現の好み・optional/enrichmentの微調整・内部表示。
 */
const releaseClassOf = (_d: DraftDecisionItem, localSeverity: HumanReviewPriority): ReleaseClass => {
  // CEO決定のseverity原則（2026-07-28）:
  //   blocker＝その判断事項自体がP0/P1（学習不能・重大誤答・表示中の重大誤情報）だけ。
  //   P2（未確定cognate・非表示の補助分類・role/sense確認）＝before beta recommended。
  //   P3（文言・軽微な自然さ）＝can defer。typeだけを理由に格上げしない。
  if (localSeverity === 'P0' || localSeverity === 'P1') return 'release_blocker';
  if (localSeverity === 'P2') return 'before_beta_recommended';
  return 'can_defer';
};

const buildAll = (): BuildResult => {
  const records = buildVocabularyReviewRecords();
  const prioById = new Map(buildReviewComparisons().map((c) => [c.itemId, c.humanReviewPriority]));
  const out: DraftDecisionItem[] = [];
  const byType: DecisionQueueAudit['byType'] = {
    example: { candidates: 0, queuedForReview: 0, excludedAlreadyApplied: 0, excludedNotApplicable: 0, excludedCeoDecided: 0 },
    cognate: { candidates: 0, queuedForReview: 0, excludedAlreadyApplied: 0, excludedNotApplicable: 0, excludedCeoDecided: 0 },
    meaning_zh: { candidates: 0, queuedForReview: 0, excludedAlreadyApplied: 0, excludedNotApplicable: 0, excludedCeoDecided: 0 },
    role: { candidates: 0, queuedForReview: 0, excludedAlreadyApplied: 0, excludedNotApplicable: 0, excludedCeoDecided: 0 },
    sense: { candidates: 0, queuedForReview: 0, excludedAlreadyApplied: 0, excludedNotApplicable: 0, excludedCeoDecided: 0 },
  };
  // CEO判断済みfieldはキューへ載せない（判断は人間側で確定済み・§2）
  const pushUnlessCeoDecided = (d: DraftDecisionItem) => {
    if (isCeoDecidedField(d.decisionId)) { byType[d.decisionType].excludedCeoDecided += 1; return; }
    byType[d.decisionType].queuedForReview += 1;
    out.push(d);
  };
  for (const rec of records) {
    const g = CHATGPT_REVIEWS[rec.itemId] ?? null;
    const prio = prioById.get(rec.itemId) ?? 'P3';
    const word = rec.item.displayForm;
    // ① 例文の提案（fi-namae等）。採用済み（現在値と一致）は判断不要として除外
    if (g?.suggestedExampleJa) {
      byType.example.candidates += 1;
      if (g.suggestedExampleJa === rec.item.exampleJa) byType.example.excludedAlreadyApplied += 1;
      else {
        pushUnlessCeoDecided({
          decisionId: `${rec.itemId}:example`, itemId: rec.itemId, wordJa: word, decisionType: 'example',
          priority: prio,
          currentValueJa: `${rec.item.exampleJa}／${rec.item.exampleZh}`,
          proposedValueJa: `${g.suggestedExampleJa}／${g.suggestedExampleZh ?? '(中国語提案なし)'}`,
          proposalSource: 'chatgpt', reasonJa: g.rationaleJa,
          impactAreas: ['ことば図鑑の例文', '例文ふりがな'],
          impactFutureAreas: ['診断・復習の例文引用（現在は例文本文を直接出題に使用しない）'],
          provenance: provenanceOf('example', g, prio, 'exampleJa/exampleZh', 'chatgpt.suggestedExampleJaが現在値と不一致'),
        });
      }
    }
    // ② cognate分類の提案（現分類と一致=採用済みは除外）
    if (g?.suggestedCognate) {
      byType.cognate.candidates += 1;
      if (g.suggestedCognate === rec.cognateDefault) byType.cognate.excludedAlreadyApplied += 1;
      else {
        pushUnlessCeoDecided({
          decisionId: `${rec.itemId}:cognate`, itemId: rec.itemId, wordJa: word, decisionType: 'cognate',
          priority: prio,
          currentValueJa: rec.cognateDefault,
          proposedValueJa: g.suggestedCognate,
          proposalSource: 'chatgpt', reasonJa: g.rationaleJa,
          impactAreas: ['同源語バッジ', 'false friend注意表示'],
          impactFutureAreas: ['診断の優先次元（false friend問題の出題対象）'],
          provenance: provenanceOf('cognate', g, prio, 'cognate', 'chatgpt.suggestedCognateが現分類と不一致', 'chatgpt', rec.cognateDefault),
        });
      }
    }
    // ③ meaningZhの提案（採用済みは除外）
    if (g?.suggestedMeaningZh) {
      byType.meaning_zh.candidates += 1;
      if (g.suggestedMeaningZh === rec.item.meaningZh) byType.meaning_zh.excludedAlreadyApplied += 1;
      else {
        pushUnlessCeoDecided({
          decisionId: `${rec.itemId}:meaning_zh`, itemId: rec.itemId, wordJa: word, decisionType: 'meaning_zh',
          priority: prio,
          currentValueJa: rec.item.meaningZh,
          proposedValueJa: g.suggestedMeaningZh,
          proposalSource: 'chatgpt', reasonJa: g.rationaleJa,
          impactAreas: ['ことば図鑑の訳語', '意味問題の正答テキスト'],
          impactFutureAreas: [],
          provenance: provenanceOf('meaning_zh', g, prio, 'meaningZh', 'chatgpt.suggestedMeaningZhが現在値と不一致'),
        });
      }
    }
    // ④ role提案（conversation trackがoptionalの語のみ対象。roleは変更しない・表示のみ）
    if (g?.issueTypes.includes('role_mismatch')) {
      byType.role.candidates += 1;
      const current = rec.rolesByTrack.conversation ?? 'optional';
      if (current !== 'optional') byType.role.excludedNotApplicable += 1;
      else {
        pushUnlessCeoDecided({
          decisionId: `${rec.itemId}:role`, itemId: rec.itemId, wordJa: word, decisionType: 'role',
          priority: prio,
          currentValueJa: `conversation: ${current}`,
          proposedValueJa: 'conversation: diagnostic',
          proposalSource: 'chatgpt', reasonJa: '基礎語のため任意ではなく短い確認（diagnostic）で通過させる提案',
          impactAreas: ['ことばロードマップの診断対象数', 'パック開始診断の問題数'],
          impactFutureAreas: ['出題頻度の重み（現在roleは出題頻度に直接接続していない）'],
          provenance: provenanceOf('role', g, prio, 'rolesByTrack.conversation', 'chatgpt.issueTypesにrole_mismatch・現roleがoptional'),
        });
      }
    }
    // ⑤ Sense未レビュー（Claude側の指摘）
    if (rec.cognateSenseOverrides.length > 0) {
      byType.sense.candidates += 1;
      if (!rec.cognateSenseOverrides.some((o) => o.reviewStatus === 'unreviewed')) byType.sense.excludedNotApplicable += 1;
      else {
        pushUnlessCeoDecided({
          decisionId: `${rec.itemId}:sense`, itemId: rec.itemId, wordJa: word, decisionType: 'sense',
          priority: prio,
          currentValueJa: rec.cognateSenseOverrides.map((o) => `${o.senseId}:${o.reviewStatus}`).join('・'),
          proposedValueJa: '未レビューSenseの focus 文言と分類を人間が確認',
          proposalSource: 'claude', reasonJa: 'Sense別cognate上書きに unreviewed が残っている',
          impactAreas: ['多義語の注意表示'],
          impactFutureAreas: [],
          provenance: provenanceOf('sense', g, prio, 'senseOverrides', 'senseOverrides.reviewStatusにunreviewedが存在', 'claude'),
        });
      }
    }
  }
  // 重大度の分離とリリース分類（2E-1.10 §18-§19）を、導出後に決定的に付与する
  const enriched = out.map((d) => {
    const localSeverity = d.provenance.independentPriority;
    const inheritedSeverity = d.provenance.sourcePriority;
    const effectiveSeverity = P_ORDER[localSeverity] <= P_ORDER[inheritedSeverity] ? localSeverity : inheritedSeverity;
    const severitySource: SeveritySource = P_ORDER[inheritedSeverity] < P_ORDER[localSeverity] ? 'inherited' : 'local';
    return {
      ...d,
      localSeverity, inheritedSeverity, effectiveSeverity, severitySource,
      // 根本問題の単位（§19）: この判断事項自体に重大問題（P0/P1）があれば独立した根本問題。
      // 自分は軽微で語の重大度を継承しているだけなら、語の根本問題へまとめて重複カウントを防ぐ。
      rootIssueId: (localSeverity === 'P0' || localSeverity === 'P1') ? d.decisionId
        : severitySource === 'inherited' ? `${d.itemId}:root` : d.decisionId,
      releaseClass: releaseClassOf(d, localSeverity),
    };
  });
  // 決定的順序: P0→P1→P2→P3、同一priorityはitemId昇順、同一語はdecisionType順。
  // decisionIdはitemId+typeのみから決まるため、元データの並びが変わっても不変（§2.2）
  const tOrder: Record<DecisionType, number> = { example: 0, cognate: 1, meaning_zh: 2, sense: 3, role: 4 };
  const queue = enriched.sort((a, b) =>
    P_ORDER[a.priority] - P_ORDER[b.priority] || a.itemId.localeCompare(b.itemId) || tOrder[a.decisionType] - tOrder[b.decisionType]);
  const ids = new Set(queue.map((d) => d.decisionId));
  const audit: DecisionQueueAudit = {
    sourceCandidates: Object.values(byType).reduce((n, x) => n + x.candidates, 0),
    queuedForReview: queue.length,
    excludedAlreadyApplied: Object.values(byType).reduce((n, x) => n + x.excludedAlreadyApplied, 0),
    excludedNotApplicable: Object.values(byType).reduce((n, x) => n + x.excludedNotApplicable, 0),
    excludedCeoDecided: Object.values(byType).reduce((n, x) => n + x.excludedCeoDecided, 0),
    duplicates: queue.length - ids.size,
    byType,
  };
  return { queue, audit };
};

/** 判断キューの決定的導出（読み取りのみ。保存はvocabDecisionStore側） */
export const buildDecisionQueue = (): HumanDecisionItem[] => buildAll().queue;

/** 導出の完全性監査（§2・labPreview/テスト/docs用） */
export const auditDecisionQueue = (): DecisionQueueAudit => buildAll().audit;

export interface DecisionQueueSummary {
  itemCount: number;                 // 判断事項数
  wordCount: number;                 // 対象語数（判断事項数と分けて表示・§7）
  byType: Record<DecisionType, number>;
  byPriority: Record<HumanReviewPriority, number>;
  /** priority由来の内訳（§3: 独立 vs 語からの継承） */
  independentPriorityCount: number;
  inheritedPriorityCount: number;
  /** リリース影響の分類（§18・91件すべてをブロッカーにしない） */
  byReleaseClass: Record<ReleaseClass, number>;
  /** 根本問題ベースのブロッカー数（§19・同じ根本問題を重複カウントしない） */
  rootBlockerCount: number;
  /** 自分自身がP0/P1の判断事項数（継承だけのP0を含まない・§19） */
  rootP0Count: number;
  rootP1Count: number;
}

export const decisionQueueSummary = (queue = buildDecisionQueue()): DecisionQueueSummary => {
  const byType: Record<DecisionType, number> = { example: 0, cognate: 0, meaning_zh: 0, role: 0, sense: 0 };
  const byPriority: Record<HumanReviewPriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const words = new Set<string>();
  const byReleaseClass: Record<ReleaseClass, number> = { release_blocker: 0, before_beta_recommended: 0, can_defer: 0 };
  const blockerRoots = new Set<string>();
  let inherited = 0, rootP0 = 0, rootP1 = 0;
  for (const d of queue) {
    byType[d.decisionType] += 1; byPriority[d.priority] += 1; words.add(d.itemId);
    if (d.provenance.priorityInheritedFromWord) inherited += 1;
    byReleaseClass[d.releaseClass] += 1;
    if (d.releaseClass === 'release_blocker') blockerRoots.add(d.rootIssueId);
    if (d.localSeverity === 'P0') rootP0 += 1;
    if (d.localSeverity === 'P1') rootP1 += 1;
  }
  return {
    itemCount: queue.length, wordCount: words.size, byType, byPriority,
    independentPriorityCount: queue.length - inherited, inheritedPriorityCount: inherited,
    byReleaseClass, rootBlockerCount: blockerRoots.size, rootP0Count: rootP0, rootP1Count: rootP1,
  };
};

/** 語ごとの未処理判断バッジ用の軽量集計（語彙詳細→Console導線・labPreview限定・§6.2） */
export interface WordDecisionBadge { total: number; pending: number; p0: number; deferred: number }
export const decisionBadgeForWord = (
  itemId: string, draftStatusOf: (decisionId: string) => string | undefined, queue = buildDecisionQueue(),
): WordDecisionBadge => {
  const items = queue.filter((d) => d.itemId === itemId);
  let pending = 0, p0 = 0, deferred = 0;
  for (const d of items) {
    const st = draftStatusOf(d.decisionId) ?? 'pending';
    if (st === 'pending' || st === 'needs_context') pending += 1;
    if (st === 'deferred') deferred += 1;
    if (d.priority === 'P0' && (st === 'pending' || st === 'needs_context')) p0 += 1;
  }
  return { total: items.length, pending, p0, deferred };
};

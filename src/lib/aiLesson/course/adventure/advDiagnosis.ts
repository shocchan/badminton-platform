// 現在地診断（§10）。5〜8分・3戦構成。長い模試にしない。
// 出題は既存のvalidated済みプールのみ（新規生成問題を診断に使わない＝品質担保）。
// 測れない能力は測れないと言う（listening/practical は暫定/未判定のまま返す）。
import type {
  AdvBand, AdvConfidence, AdvDiagnosisResult, AdvGoalType, AdvSkillProfile, JlptLevel,
} from './advTypes';
import { emptySkillProfile } from './advProfile';
import { conversationStartArea } from './advRoute';
import { evidenceToConfidence, scoreToBand, bandAtLeast } from './advSkillProfile';

/** 診断で使う統一問題形（既存プールから正規化して渡す。生成はしない） */
export interface DiagQuestion {
  /** 出題記録キー（未出判定と共有）。rec:<grammarId> / n3q:<unitId>:<qid> */
  key: string;
  level: 'foundation' | 'n3' | 'n2';
  skill: 'vocabulary' | 'grammar';
  promptJa: string;
  promptZh: string;
  choices: string[];
  answerIndex: number;
  explanationZh: string;
  /** 誤答時にgapへ入れる実コンテンツID（itemId / grammarId） */
  refId: string;
}

export interface DiagAnswer { key: string; choiceIndex: number; }

/** 会話診断の生徒発話サンプル（text会話1〜2往復。voiceは任意・D-011） */
export interface ConvSample { studentText: string; }

/** 決定的シャッフル（seed固定で再現可能・テスト可能） */
export const seededShuffle = <T,>(arr: T[], seed: number): T[] => {
  const a = [...arr];
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export interface DiagnosisPools {
  /** 語彙（foundation帯）: N3単元diagnostic等のchoice型 */
  foundationVocab: DiagQuestion[];
  /** 語彙（N3prep帯） */
  n3Vocab: DiagQuestion[];
  /** N3文法 recognition */
  n3Grammar: DiagQuestion[];
  /** N2文法 recognition（目標N2のときのみ使用） */
  n2Grammar: DiagQuestion[];
}

/**
 * 診断の出題構成（§10）: 第1戦=語彙6問・第2戦=文法6問（+N2目標は N2 3問含む）。
 * 合計12問＋会話1〜2往復 ≒ 5〜8分。
 */
export const selectDiagnosisQuestions = (
  pools: DiagnosisPools, targetJlpt: JlptLevel | null, goalType: AdvGoalType, seed: number,
): DiagQuestion[] => {
  const take = <T,>(arr: T[], n: number, s: number): T[] => seededShuffle(arr, s).slice(0, n);
  const wantsN2 = targetJlpt === 'N2' && goalType !== 'conversation';
  const vocab = [
    ...take(pools.foundationVocab, 3, seed + 1),
    ...take(pools.n3Vocab, 3, seed + 2),
  ];
  const grammar = wantsN2
    ? [...take(pools.n3Grammar, 3, seed + 3), ...take(pools.n2Grammar, 3, seed + 4)]
    : [...take(pools.n3Grammar, 4, seed + 3), ...take(pools.n2Grammar, 2, seed + 4)];
  return [...vocab, ...grammar];
};

const pct = (correct: number, total: number): number =>
  total === 0 ? 0 : Math.round((correct / total) * 100);

interface BucketScore { correct: number; total: number; }

const bucketOf = (qs: DiagQuestion[], answers: Map<string, number>, level: DiagQuestion['level'], skill?: DiagQuestion['skill']): BucketScore => {
  let correct = 0; let total = 0;
  for (const q of qs) {
    if (q.level !== level) continue;
    if (skill && q.skill !== skill) continue;
    const a = answers.get(q.key);
    if (a === undefined) continue; // 未回答は集計に入れない（推測しない）
    total += 1;
    if (a === q.answerIndex) correct += 1;
  }
  return { correct, total };
};

/** 段階的に帯を決める: 下の帯が固まっていない限り上の帯を名乗らない（正直側） */
const ladderBand = (foundationPct: number, n3Pct: number, n2Pct: number, n2Asked: boolean): AdvBand => {
  if (foundationPct < 60) return scoreToBand(foundationPct, 'foundation');
  if (n3Pct < 60) return scoreToBand(n3Pct, 'n3');
  if (!n2Asked) return 'n3_late';
  return scoreToBand(n2Pct, 'n2');
};

/**
 * 会話サンプルの決定的採点（§6）。1〜2往復の粗い目安なので confidence は low 止まり。
 * 断定表示はしない（開始地点の決定にのみ使う）。
 */
export const scoreConversationSample = (samples: ConvSample[]): { band: AdvBand; scorePct: number; confidence: AdvConfidence } => {
  if (samples.length === 0) return { band: 'needs_assessment', scorePct: 0, confidence: 'none' };
  const KANA = /[぀-ゟ゠-ヿ]/;
  const PARTICLE = /[はがをにでへと](?![぀-ゟ])|[はがをにでへ]/;
  const CONNECTIVE = /(から|ので|けど|でも|して|くて)/;
  const PAST = /(ました|かった|だった|ませんでした)/;
  let best = 0;
  for (const s of samples) {
    const t = s.studentText.trim();
    if (t.length === 0) continue;
    let level = 0;
    if (KANA.test(t)) level = 1;
    if (KANA.test(t) && t.length >= 8 && PARTICLE.test(t)) level = 2;
    if (level >= 2 && CONNECTIVE.test(t)) level = 3;
    if (level >= 3 && PAST.test(t) && t.length >= 20) level = 4;
    best = Math.max(best, level);
  }
  const map: { band: AdvBand; scorePct: number }[] = [
    { band: 'pre_n5', scorePct: 10 },
    { band: 'n4', scorePct: 30 },
    { band: 'n3_early', scorePct: 50 },
    { band: 'n3', scorePct: 70 },
    { band: 'n3_late', scorePct: 85 },
  ];
  return { ...map[best], confidence: 'low' };
};

export interface DiagnosisScoreInput {
  questions: DiagQuestion[];
  answers: DiagAnswer[];
  convSamples: ConvSample[];
  conversationSampled: boolean;
  targetJlpt: JlptLevel | null;
  goalType: AdvGoalType;
  nowISO: string;
}

export interface DiagnosisOutcome {
  result: AdvDiagnosisResult;
  skills: AdvSkillProfile;
}

/** 診断の採点→skill profile＋診断結果（§10）。router向けの帯もここで確定 */
export const scoreDiagnosis = (input: DiagnosisScoreInput): DiagnosisOutcome => {
  const { questions, answers, convSamples, conversationSampled, goalType, nowISO } = input;
  const amap = new Map(answers.map((a) => [a.key, a.choiceIndex]));

  const vFound = bucketOf(questions, amap, 'foundation', 'vocabulary');
  const vN3 = bucketOf(questions, amap, 'n3', 'vocabulary');
  const gN3 = bucketOf(questions, amap, 'n3', 'grammar');
  const gN2 = bucketOf(questions, amap, 'n2', 'grammar');
  const n2Asked = questions.some((q) => q.level === 'n2');

  const vFoundPct = pct(vFound.correct, vFound.total);
  const vN3Pct = pct(vN3.correct, vN3.total);
  const gN3Pct = pct(gN3.correct, gN3.total);
  const gN2Pct = pct(gN2.correct, gN2.total);

  // 全問「わからない」＝証拠0件のときは帯を断定しない（原則13: 存在するふりをしない）
  const noEvidence = vFound.total + vN3.total + gN3.total + gN2.total === 0;
  const vocabularyBand: AdvBand = noEvidence ? 'needs_assessment' : ladderBand(vFoundPct, vN3Pct, 100, false);
  const grammarBand: AdvBand = noEvidence ? 'needs_assessment' : ladderBand(100, gN3Pct, gN2Pct, n2Asked);
  const knowledgeBand: AdvBand = noEvidence
    ? 'needs_assessment'
    : (['vocabulary', 'grammar'] as const)
      .map((k) => (k === 'vocabulary' ? vocabularyBand : grammarBand))
      .reduce((lo, b) => (bandAtLeast(lo, b) ? b : lo));

  const conv = conversationSampled
    ? scoreConversationSample(convSamples)
    : { band: 'needs_assessment' as AdvBand, scorePct: 0, confidence: 'none' as AdvConfidence };

  // gap抽出: 誤答したrefIdのみ（未回答はgapにしない）
  const wrong = (skill: DiagQuestion['skill']) => questions
    .filter((q) => q.skill === skill)
    .filter((q) => { const a = amap.get(q.key); return a !== undefined && a !== q.answerIndex; })
    .map((q) => q.refId);

  const vocabEvidence = vFound.total + vN3.total;
  const grammarEvidence = gN3.total + gN2.total;
  const skills: AdvSkillProfile = {
    ...emptySkillProfile(),
    vocabulary: {
      currentScore: Math.round((vFoundPct + vN3Pct) / 2),
      confidence: evidenceToConfidence(vocabEvidence),
      evidenceCount: vocabEvidence, lastAssessedAt: nowISO, band: vocabularyBand,
    },
    grammar: {
      currentScore: n2Asked ? Math.round((gN3Pct + gN2Pct) / 2) : gN3Pct,
      confidence: evidenceToConfidence(grammarEvidence),
      evidenceCount: grammarEvidence, lastAssessedAt: nowISO, band: grammarBand,
    },
    conversation: {
      currentScore: conv.scorePct, confidence: conv.confidence,
      evidenceCount: convSamples.length, lastAssessedAt: conversationSampled ? nowISO : null, band: conv.band,
    },
    // 読解・聴解・実践は診断で測っていない＝未判定のまま（§10・D-009）
  };

  const startArea = goalType === 'conversation'
    ? conversationStartArea(conv.band)
    : conversationStartArea(knowledgeBand); // JLPT系の初期会話ミッションの場も知識帯に合わせる

  const result: AdvDiagnosisResult = {
    completedAt: nowISO,
    knowledgeBand,
    conversationBand: conv.band,
    vocabularyGapIds: wrong('vocabulary'),
    grammarGapIds: wrong('grammar'),
    listeningConfidence: 'none',
    supportNeed: knowledgeBand === 'needs_assessment' || !bandAtLeast(knowledgeBand, 'n3_early') ? 'often'
      : !bandAtLeast(knowledgeBand, 'n3_late') ? 'grammar' : 'whenStuck',
    recommendedStartAreaId: startArea.areaId,
    routeExplanationJa: '', // route生成側で確定（generateRoute.explanation）
    routeExplanationZh: '',
    askedQuestionKeys: questions.map((q) => q.key),
    conversationSampled,
  };
  return { result, skills };
};

/** 目標との距離の表示文（§5の文言原則: 降格と言わない） */
export const gapPhrase = (target: JlptLevel, knowledge: AdvBand): { ja: string; zh: string } => {
  if (knowledge === 'needs_assessment') {
    return { ja: '現在地はこれから測ります', zh: '当前位置将通过诊断确认' };
  }
  const behind = (target === 'N2' && !bandAtLeast(knowledge, 'n3_late'))
    || (target === 'N3' && !bandAtLeast(knowledge, 'n4_late'));
  if (!behind) return { ja: `${target}攻略に直行できます`, zh: `可以直接开始${target}攻略` };
  return {
    ja: `${target}を攻略するために、まず不足している基礎を短期間で補強します`,
    zh: `为了攻略${target}，先集中补足目前缺少的基础`,
  };
};

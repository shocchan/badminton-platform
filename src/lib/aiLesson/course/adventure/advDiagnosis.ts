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
  level: 'foundation' | 'n3' | 'n2' | 'n1';
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
  // seedはそのまま使わず撹拌する（小さいseedで並びが偏るため。advChoiceOrder参照）
  let s = (seed >>> 0) + 0x9e3779b9 >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97) >>> 0;
  s = (s ^ (s >>> 15)) >>> 0;
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
  /**
   * N5文法 recognition（2026-08-18 追加）。
   * N5/N4を目標に選べるようにしたのに、診断は N3語彙3・N3文法4・N2文法2 を出していて、
   * **12問中9問が目標より上**だった（CEO指摘）。初級文法148項目は診断で1問も使われていなかった。
   */
  basicGrammarN5: DiagQuestion[];
  /** N4文法 recognition（同上） */
  basicGrammarN4: DiagQuestion[];
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
  const basicTarget = goalType !== 'conversation' && (targetJlpt === 'N5' || targetJlpt === 'N4');

  /**
   * 目標がN5/N4のときは、**その帯を測る問題**を出す（2026-08-18・CEO指摘）。
   * 上の帯は「実は目標より上かもしれない」を見るぶんだけ少し混ぜる。
   * 全部を目標帯にしないのは、N5と申告した人が実はN3圏という取り違えを拾えなくなるため。
   */
  if (basicTarget) {
    const n5 = targetJlpt === 'N5';
    const q = [
      ...take(pools.foundationVocab, n5 ? 4 : 3, seed + 1),
      ...take(pools.basicGrammarN5, n5 ? 4 : 2, seed + 5),
      ...take(pools.basicGrammarN4, n5 ? 2 : 4, seed + 6),
      ...take(pools.n3Vocab, 2, seed + 2),
      ...(n5 ? [] : take(pools.n3Grammar, 1, seed + 3)),
    ];
    return shuffleChoices(q, seed);
  }

  const vocab = [
    ...take(pools.foundationVocab, 3, seed + 1),
    ...take(pools.n3Vocab, 3, seed + 2),
  ];
  const grammar = wantsN2
    ? [...take(pools.n3Grammar, 3, seed + 3), ...take(pools.n2Grammar, 3, seed + 4)]
    : [...take(pools.n3Grammar, 4, seed + 3), ...take(pools.n2Grammar, 2, seed + 4)];
  return shuffleChoices([...vocab, ...grammar], seed);
};

/**
 * 正解の位置が執筆順（1番目）へ偏らないよう、選択肢を問題ごとに決定的へシャッフルする。
 * seedは問題keyから作るので、同じ問題は何度開いても同じ並び（採点はanswerIndexを追随させる）
 */
const shuffleChoices = (qs: DiagQuestion[], seed: number): DiagQuestion[] => qs.map((q) => {
  const s = [...q.key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, seed >>> 0);
  const order = seededShuffle(q.choices.map((_, i) => i), s);
  return { ...q, choices: order.map((i) => q.choices[i]), answerIndex: order.indexOf(q.answerIndex) };
});

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
  const gFound = bucketOf(questions, amap, 'foundation', 'grammar');
  const gN3 = bucketOf(questions, amap, 'n3', 'grammar');
  const gN2 = bucketOf(questions, amap, 'n2', 'grammar');
  const n2Asked = questions.some((q) => q.level === 'n2');

  const vFoundPct = pct(vFound.correct, vFound.total);
  const vN3Pct = pct(vN3.correct, vN3.total);
  const gN3Pct = pct(gN3.correct, gN3.total);
  const gN2Pct = pct(gN2.correct, gN2.total);
  /**
   * 文法の土台の正答率（2026-08-18）。
   * 従来は初級文法の問題が診断に1問も無かったため 100 をベタ書きして素通りさせており、
   * 「ことばは知っているが文法がゼロ」の人を基礎帯と判定できなかった（下限が n4_late 止まり）。
   * 初級文法を出したときだけ実測値を使い、出していないときは従来どおり 100（＝素通り）にする。
   */
  const gFoundPct = gFound.total > 0 ? pct(gFound.correct, gFound.total) : 100;

  // 全問「わからない」＝証拠0件のときは帯を断定しない（原則13: 存在するふりをしない）
  const noEvidence = vFound.total + vN3.total + gFound.total + gN3.total + gN2.total === 0;
  const vocabularyBand: AdvBand = noEvidence ? 'needs_assessment' : ladderBand(vFoundPct, vN3Pct, 100, false);
  const grammarBand: AdvBand = noEvidence ? 'needs_assessment' : ladderBand(gFoundPct, gN3Pct, gN2Pct, n2Asked);
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
  const grammarEvidence = gFound.total + gN3.total + gN2.total;
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

/**
 * 現在地診断（12問）を出さない目標かどうか（CEO決定 2026-08-22）。
 *
 * 【なぜ出さないか】
 * 診断はN3/N2の語彙・文法プールから出題する。ひらがなしか読めない人にとっては
 * 「住・飲・読」のような漢字だけの選択肢が12問並ぶ画面になり、
 * 測っているのは実力ではなく「読めないこと」でしかない。
 * N5/N4はどちらにせよ基礎（かな→ことば→文法）から順に進むので、
 * 診断の結果でルートが変わらない。測れないものを測るふりをせず、
 * 冒険の入口まで最短で通す。
 *
 * 会話目標（conversation）は targetJlpt を使わないので対象外。
 */
export const skipsDiagnosis = (goalType: AdvGoalType, targetJlpt: JlptLevel | null): boolean =>
  goalType !== 'conversation' && (targetJlpt === 'N5' || targetJlpt === 'N4');

/**
 * 診断を出さなかった人の診断結果。
 * 「測っていない」を needs_assessment としてそのまま返す（原則13: 存在するふりをしない）。
 * scoreDiagnosis に空の出題・空の解答を渡すのと同じ＝分岐を増やさず、
 * 既存の「証拠0件なら断定しない」経路をそのまま通す。
 *
 * この needs_assessment には副作用がある（意図した副作用）:
 *  - generateRoute が基礎キャンプから始まるルートを組む
 *  - AdvShell がかな確認を出す → ひらがなが読めない人はかな道場に入る
 */
export const unmeasuredDiagnosis = (input: {
  targetJlpt: JlptLevel | null; goalType: AdvGoalType; nowISO: string;
}): DiagnosisOutcome => scoreDiagnosis({
  questions: [], answers: [], convSamples: [], conversationSampled: false,
  targetJlpt: input.targetJlpt, goalType: input.goalType, nowISO: input.nowISO,
});

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
